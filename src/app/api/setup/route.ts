import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bootstrap zero-touch. Uma request pra /api/setup deixa o Radar operante:
 *   1. Aplica supabase/migrations/TODAS.sql (schema + RLS + DataJud).
 *      Idempotente — o próprio SQL usa IF NOT EXISTS / EXCEPTION.
 *   2. Insere leads-semente com pitch pronto pra corretor testar.
 *   3. Promove o email do ADMIN_EMAIL a papel='admin' + status_ativo,
 *      assim que existir uma linha em `perfis` (o cadastro cria a linha
 *      via trigger; se não existir ainda, o setup pula essa parte).
 *
 * Protegido por SETUP_TOKEN — passa como ?token=... na URL.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = process.env.SETUP_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ erro: "token inválido" }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json(
      { erro: "DATABASE_URL não configurada" },
      { status: 500 },
    );
  }

  const passos: Array<{ passo: string; ok: boolean; detalhe?: string }> = [];

  // 1. Migrations via pg direto
  const sqlPath = join(process.cwd(), "supabase", "migrations", "TODAS.sql");
  let sql: string;
  try {
    sql = readFileSync(sqlPath, "utf8");
  } catch (e: unknown) {
    return NextResponse.json(
      { erro: "TODAS.sql não encontrado", detalhe: String(e) },
      { status: 500 },
    );
  }

  const cliente = new Client({ connectionString: dbUrl });
  try {
    await cliente.connect();
    await cliente.query(sql);
    passos.push({ passo: "migrations", ok: true });
  } catch (e: unknown) {
    // Migrations idempotentes podem lançar "already exists" — só falha se
    // for erro estrutural. Tenta seguir mesmo assim, mas anota.
    const msg = e instanceof Error ? e.message : String(e);
    passos.push({ passo: "migrations", ok: false, detalhe: msg });
  } finally {
    await cliente.end().catch(() => {});
  }

  // 2. Seed de leads via SDK (usa RLS-bypass do service_role)
  const supabase = db();
  const leadsSemente = [
    {
      fonte: "whatsapp" as const,
      externo_id: "seed-001",
      texto:
        "REPASSE URGENTE Res. Alpha Torre 1 apto 502, 68m², 2q1s, R$ 220mil, financiado pela Caixa, aceito troca. Chaves em 3 meses. (62) 99999-0001",
      classe: "A" as const,
      score: 0.92,
      anunciado_em: new Date().toISOString(),
      pitch:
        "Boa tarde! Vi seu anúncio do repasse no Res. Alpha (68m², 2q1s, R$220mil). Tenho cliente pré-aprovado na Caixa, posso levar sinal ainda essa semana. Podemos conversar?",
    },
    {
      fonte: "whatsapp" as const,
      externo_id: "seed-002",
      texto:
        "Vendo repasse Golden Park Bloco B unidade 304, 3q1s, 82m², sacada gourmet. Valor R$ 315mil, dívida R$180mil na Caixa. Chaves em 5 meses. Só pra financiado. (62) 98888-0002",
      classe: "A" as const,
      score: 0.88,
      anunciado_em: new Date().toISOString(),
      pitch:
        "Olá! Sobre o repasse do Golden Park (3q1s, 82m², sacada gourmet): tenho lista de compradores com aprovação na Caixa aguardando esse perfil. Consegue mandar RGI e boletos pra eu adiantar análise?",
    },
    {
      fonte: "facebook" as const,
      externo_id: "seed-003",
      texto:
        "Passo direitos apartamento Setor Bueno, novo, 45m², 1q, R$ 195mil. Aceito financiamento MCMV. Direto com proprietário. WhatsApp (62) 97777-0003",
      classe: "B" as const,
      score: 0.71,
      anunciado_em: new Date().toISOString(),
      pitch:
        "Oi! Vi o repasse do apto no Setor Bueno (45m², 1q, R$195mil, MCMV). Tenho clientes MCMV aprovados nessa faixa. Posso passar hoje pra ver e já fecho na semana?",
    },
    {
      fonte: "olx" as const,
      externo_id: "seed-004",
      texto:
        "Repasse Village Terrazzo, 3q sendo 1 suíte, 78m², R$ 285mil, dívida 165k Bradesco. Chaves em 30 dias. Aceito troca por menor. (62) 96666-0004",
      classe: "A" as const,
      score: 0.85,
      anunciado_em: new Date().toISOString(),
      pitch:
        "Boa noite! Sobre o repasse Village Terrazzo (3q, 1suíte, chaves em 30 dias): perfeito pra um cliente meu financiado no Bradesco. Podemos combinar visita amanhã pela manhã?",
    },
  ];

  try {
    const { error } = await supabase
      .from("leads")
      .upsert(leadsSemente as never, { onConflict: "fonte,externo_id" });
    if (error) throw error;
    passos.push({ passo: "seed_leads", ok: true, detalhe: `${leadsSemente.length} leads` });
  } catch (e: unknown) {
    passos.push({
      passo: "seed_leads",
      ok: false,
      detalhe: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. Promove admin, se o email já cadastrou
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    try {
      const { data, error } = await supabase
        .from("perfis")
        .update({ papel: "admin", status_acesso: "ativo" })
        .eq("email", adminEmail)
        .select("id, email, papel, status_acesso");
      if (error) throw error;
      if (data && data.length > 0) {
        passos.push({
          passo: "promover_admin",
          ok: true,
          detalhe: `${adminEmail} → admin/ativo`,
        });
      } else {
        passos.push({
          passo: "promover_admin",
          ok: false,
          detalhe: `${adminEmail} ainda não cadastrou em /cadastrar`,
        });
      }
    } catch (e: unknown) {
      passos.push({
        passo: "promover_admin",
        ok: false,
        detalhe: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    passos.push({
      passo: "promover_admin",
      ok: false,
      detalhe: "ADMIN_EMAIL não configurada",
    });
  }

  return NextResponse.json({ ok: true, passos });
}

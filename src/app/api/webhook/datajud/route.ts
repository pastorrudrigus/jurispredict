import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { CONSULTAS, montarConsulta } from "@/lib/datajud/consultas";
import { ENDPOINT_TJGO, paraSinal, type ProcessoDataJud } from "@/lib/datajud/cliente";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * DataJud rodado de FORA da Vercel (o egress da Vercel não faz TLS com o CNJ).
 * O n8n do servidor próprio alcança o CNJ; este endpoint só entrega as queries
 * e recebe os hits de volta.
 *
 *   GET  → devolve { endpoint, desde_atualizacao, consultas: [{categoria, body}] }
 *          O n8n pega cada body e POSTa no `endpoint` do CNJ (com a API key
 *          pública na header Authorization: APIKey <chave>).
 *
 *   POST → { categoria, hits: [ES _source...] }  → mapeia via paraSinal e
 *          grava em sinais_judiciais (upsert por numero_processo).
 *
 * Auth: header x-webhook-secret == EVOLUTION_WEBHOOK_SECRET.
 */

function autorizado(req: Request): boolean {
  const secret = req.headers.get("x-webhook-secret") ?? req.headers.get("apikey");
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  return !!expected && secret === expected;
}

/** Marco do delta: última atualização já vista. */
async function marcoDelta(): Promise<string | null> {
  const { data } = await db()
    .from("sinais_judiciais")
    .select("ultima_atualizacao")
    .not("ultima_atualizacao", "is", null)
    .order("ultima_atualizacao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { ultima_atualizacao: string } | null)?.ultima_atualizacao ?? null;
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "secret invalido" }, { status: 401 });
  }

  const desde = await marcoDelta();

  const consultas = CONSULTAS.map((def) => ({
    categoria: def.categoria,
    body: montarConsulta(def, {
      tamanho: 200,
      desdeAtualizacao: desde,
    }),
  }));

  return NextResponse.json({
    endpoint: ENDPOINT_TJGO,
    desde_atualizacao: desde,
    total_consultas: consultas.length,
    consultas,
  });
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "secret invalido" }, { status: 401 });
  }

  let corpo: { categoria?: string; hits?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }

  const categoria = corpo.categoria;
  if (!categoria) {
    return NextResponse.json({ erro: "categoria ausente" }, { status: 400 });
  }

  // Aceita: array de _source direto, OU o shape do ES { hits: { hits: [{_source}] } }
  let processos: ProcessoDataJud[] = [];
  const h = corpo.hits as unknown;
  if (Array.isArray(h)) {
    processos = h.map((x) =>
      (x as { _source?: ProcessoDataJud })._source ?? (x as ProcessoDataJud),
    );
  } else if (
    h &&
    typeof h === "object" &&
    Array.isArray((h as { hits?: { hits?: unknown[] } })?.hits?.hits)
  ) {
    processos = (h as { hits: { hits: Array<{ _source?: ProcessoDataJud }> } }).hits.hits
      .map((x) => x._source)
      .filter(Boolean) as ProcessoDataJud[];
  }

  if (processos.length === 0) {
    return NextResponse.json({ ok: true, categoria, gravados: 0, nota: "sem hits" });
  }

  const linhas = processos
    .filter((p) => p && p.numeroProcesso)
    .map((p) => paraSinal(p, categoria));

  if (linhas.length === 0) {
    return NextResponse.json({ ok: true, categoria, gravados: 0, nota: "sem numeroProcesso" });
  }

  const { error, count } = await db()
    .from("sinais_judiciais")
    .upsert(linhas as never, { onConflict: "numero_processo", count: "exact" });

  if (error) {
    return NextResponse.json(
      { erro: "upsert falhou", detalhe: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    categoria,
    recebidos: processos.length,
    gravados: count ?? linhas.length,
  });
}

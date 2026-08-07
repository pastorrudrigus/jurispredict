import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { CONSULTAS } from "@/lib/datajud/consultas";
import { ErroDataJud, paraSinal, varrerCategoria } from "@/lib/datajud/cliente";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV !== "production";
  return (request.headers.get("authorization") ?? "") === `Bearer ${segredo}`;
}

/** Última atualização já vista — base do delta diário. */
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

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const apiKey = process.env.DATAJUD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erro: "DATAJUD_API_KEY não configurada (chave pública da wiki do CNJ)." },
      { status: 503 },
    );
  }

  // `?completo=1` ignora o delta e repuxa desde 2023 — para a carga inicial.
  const completo = request.nextUrl.searchParams.get("completo") === "1";
  const desdeAtualizacao = completo ? null : await marcoDelta();

  const porCategoria: Record<string, { coletados: number; gravados: number; erro?: string }> = {};
  let totalGravados = 0;

  for (const def of CONSULTAS) {
    try {
      const processos = await varrerCategoria(def, {
        apiKey,
        desdeAtualizacao,
        maxPaginas: completo ? 50 : 10,
      });

      if (processos.length === 0) {
        porCategoria[def.categoria] = { coletados: 0, gravados: 0 };
        continue;
      }

      const linhas = processos.map((p) => paraSinal(p, def.categoria));

      /*
       * upsert por numero_processo: um processo pode cair em mais de uma
       * categoria (execução que também tem movimentação de leilão). A última
       * categoria vence — o Estágio 3 relê o payload de qualquer forma.
       */
      const { error, count } = await db()
        .from("sinais_judiciais")
        .upsert(linhas, { onConflict: "numero_processo", count: "exact" });

      if (error) throw new Error(error.message);

      porCategoria[def.categoria] = {
        coletados: processos.length,
        gravados: count ?? linhas.length,
      };
      totalGravados += count ?? linhas.length;
    } catch (e) {
      // Uma categoria quebrada não derruba a varredura inteira.
      porCategoria[def.categoria] = {
        coletados: 0,
        gravados: 0,
        erro: e instanceof ErroDataJud ? e.message : String(e),
      };
    }
  }

  return NextResponse.json({
    modo: completo ? "carga_inicial" : "delta",
    desde_atualizacao: desdeAtualizacao,
    total_gravados: totalGravados,
    por_categoria: porCategoria,
  });
}

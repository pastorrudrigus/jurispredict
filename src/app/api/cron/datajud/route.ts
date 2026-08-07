import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ENDPOINT = "https://api-publica.datajud.cnj.br/api_publica_tjgo/_search";
const DESDE = "2023-01-01";
// Código IBGE do município de Goiânia. Configurável porque o campo
// orgaoJulgador.codigoMunicipioIBGE nem sempre vem preenchido — se a coleta
// voltar vazia, tente rodar sem o filtro (DATAJUD_MUNICIPIO_IBGE=).
const MUNICIPIO_IBGE = process.env.DATAJUD_MUNICIPIO_IBGE ?? "5208707";

const TERMOS = ["rescisão", "rescisao", "execução", "execucao", "inventário", "inventario", "divórcio", "divorcio"];

type Hit = {
  _source?: {
    numeroProcesso?: string;
    classe?: { nome?: string };
    assuntos?: Array<{ nome?: string }>;
    dataAjuizamento?: string;
    orgaoJulgador?: { nome?: string; codigoMunicipioIBGE?: number | string };
  };
};

function autorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${segredo}`;
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

  const filtros: unknown[] = [
    { range: { dataAjuizamento: { gte: DESDE } } },
    {
      multi_match: {
        query: TERMOS.join(" "),
        fields: ["classe.nome", "assuntos.nome"],
        operator: "or",
      },
    },
  ];
  if (MUNICIPIO_IBGE) {
    filtros.push({ term: { "orgaoJulgador.codigoMunicipioIBGE": Number(MUNICIPIO_IBGE) } });
  }

  const resposta = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `APIKey ${apiKey}`,
    },
    body: JSON.stringify({ size: 200, query: { bool: { must: filtros } } }),
    cache: "no-store",
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    return NextResponse.json(
      { erro: `DataJud respondeu ${resposta.status}`, corpo: corpo.slice(0, 500) },
      { status: 502 },
    );
  }

  const json = (await resposta.json()) as { hits?: { hits?: Hit[] } };
  const hits = json.hits?.hits ?? [];

  const linhas = hits
    .map((h) => h._source)
    .filter((s): s is NonNullable<Hit["_source"]> => Boolean(s?.numeroProcesso))
    .map((s) => ({
      fonte: "datajud_tjgo",
      numero_processo: s.numeroProcesso!,
      classe: s.classe?.nome ?? null,
      assunto: s.assuntos?.map((a) => a.nome).filter(Boolean).join("; ") || null,
      data_ajuizamento: s.dataAjuizamento ? s.dataAjuizamento.slice(0, 10) : null,
      municipio: s.orgaoJulgador?.nome ?? null,
      payload: s,
    }));

  if (linhas.length === 0) {
    return NextResponse.json({ coletados: 0, gravados: 0 });
  }

  const { error, count } = await db()
    .from("sinais_judiciais")
    .upsert(linhas, { onConflict: "numero_processo", count: "exact" });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ coletados: hits.length, gravados: count ?? linhas.length });
}

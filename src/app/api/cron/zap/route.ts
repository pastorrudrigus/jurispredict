import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron ZAP: roda de dentro da Vercel (que ALCANÇA a Apify, só não alcança o
 * CNJ). Coleta repasse no ZAP Imóveis via Apify e joga no webhook /portal —
 * sem depender de n8n nem servidor externo.
 *
 * Autenticação: Vercel manda `Authorization: Bearer $CRON_SECRET` nos crons.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV !== "production";
  return (req.headers.get("authorization") ?? "") === `Bearer ${segredo}`;
}

const ACTOR = "haketa~zapimoveis-scraper";

// Faixas onde o repasse/ágio se concentra. Cada rodada varre uma; juntas
// cobrem estúdio barato até apartamento de alto padrão + casa de condomínio.
// Como o cron é diário (limite do plano), varre largo de uma vez.
const FAIXAS = [
  { unitTypes: ["KITNET", "FLAT"], minPrice: 40000, maxPrice: 200000 },
  { unitTypes: ["APARTMENT"], minPrice: 60000, maxPrice: 250000 },
  { unitTypes: ["APARTMENT"], minPrice: 250000, maxPrice: 400000 },
  { unitTypes: ["APARTMENT", "PENTHOUSE"], minPrice: 400000, maxPrice: 700000 },
  { unitTypes: ["HOME", "CONDOMINIUM"], minPrice: 150000, maxPrice: 600000 },
];

type ItemZap = Record<string, unknown>;

function mapear(d: ItemZap) {
  const titulo = (d.title as string) ?? "";
  const descricao = (d.description as string) ?? "";
  if (!titulo && !descricao) return null;
  let phones = (d.phones ?? d.phone ?? d.whatsapp) as unknown;
  if (Array.isArray(phones)) phones = phones[0] ?? null;
  return {
    fonte: "zap",
    url: d.url as string | undefined,
    titulo,
    descricao,
    preco: d.priceBRL as number | undefined,
    area_m2: (d.usableArea ?? d.totalArea) as number | undefined,
    quartos: d.bedrooms as number | undefined,
    bairro: d.neighborhood as string | undefined,
    cidade: (d.city as string) ?? "Goiânia",
    telefone: phones as string | null,
    nome_anunciante: (d.agencyName ?? d.advertiserName) as string | undefined,
    // sinais estruturados de quem anuncia — o ZAP é ~100% imobiliária
    publisher_type: d.publisherType as string | undefined,
    agencia: d.agencyName as string | undefined,
    creci: d.agencyCRECI as string | undefined,
  };
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const apifyToken = process.env.APIFY_TOKEN;
  const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!apifyToken || !webhookSecret) {
    return NextResponse.json(
      { erro: "APIFY_TOKEN e EVOLUTION_WEBHOOK_SECRET precisam estar configuradas" },
      { status: 500 },
    );
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get("host")}`;
  const porFaixa: Array<{ faixa: number; coletados: number; gravados: number; erro?: string }> = [];
  let totalGravados = 0;

  for (let i = 0; i < FAIXAS.length; i++) {
    const faixa = FAIXAS[i];
    try {
      const runResp = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${apifyToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "listings",
            portal: "ZAP",
            business: ["SALE"],
            cities: ["goiania"],
            states: ["GO"],
            unitTypes: faixa.unitTypes,
            minPrice: faixa.minPrice,
            maxPrice: faixa.maxPrice,
            maxListings: 200,
            maxPages: 10,
          }),
        },
      );
      const dados = (await runResp.json()) as ItemZap[];
      const itens = Array.isArray(dados)
        ? dados.map(mapear).filter((x): x is NonNullable<typeof x> => x !== null)
        : [];

      let gravadosFaixa = 0;
      // Manda em lotes de 50 pro webhook (que chama IA por item que passa filtro)
      for (let j = 0; j < itens.length; j += 50) {
        const lote = itens.slice(j, j + 50);
        const wr = await fetch(`${base}/api/webhook/portal`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": webhookSecret,
          },
          body: JSON.stringify({ items: lote }),
        });
        const wresp = (await wr.json()) as { gravados?: number };
        gravadosFaixa += wresp.gravados ?? 0;
      }

      totalGravados += gravadosFaixa;
      porFaixa.push({ faixa: i, coletados: itens.length, gravados: gravadosFaixa });
    } catch (e) {
      porFaixa.push({
        faixa: i,
        coletados: 0,
        gravados: 0,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, total_gravados: totalGravados, por_faixa: porFaixa });
}

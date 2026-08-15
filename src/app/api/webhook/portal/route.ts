import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/supabase";
import { MODELO_EXTRACAO, extrairAnuncio } from "@/lib/anthropic";
import { pareceRepasse } from "@/lib/coletores/filtro";
import { aplicarBonusJanela, classeLead } from "@/lib/classe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Webhook genérico de ingestão de anúncios estruturados de PORTAIS
 * (OLX, ZAP, VivaReal) via qualquer fonte: Apify, n8n, Zyte, feed XML.
 *
 * Desacopla "de onde vem o lead" do produto: troque o scraper sem tocar
 * no Radar. Qualquer coisa que POSTe o formato abaixo vira lead.
 *
 * Auth: header `x-webhook-secret` deve bater com env EVOLUTION_WEBHOOK_SECRET
 * (reusa o mesmo segredo do webhook de WhatsApp).
 *
 * Body: array de anúncios OU { items: [...] }. Cada item aceita campos
 * estruturados (quando o scraper já extraiu) + texto livre pra IA refinar:
 * {
 *   fonte?: "olx" | "zap" | "vivareal" | string,   // default "olx"
 *   url?: string,                                    // usado no dedup
 *   titulo?: string,
 *   descricao?: string,                              // texto livre p/ IA
 *   preco?: number,                                  // valor pedido
 *   area_m2?: number,
 *   quartos?: number,
 *   bairro?: string,
 *   cidade?: string,
 *   telefone?: string,
 *   nome_anunciante?: string,
 *   empreendimento?: string
 * }
 *
 * Só grava o que passa em: (1) pré-filtro pareceRepasse no titulo+descricao,
 * (2) confirmação eh_repasse da IA. Campos estruturados do scraper têm
 * prioridade; a IA preenche os que faltam + score de urgência.
 */

type ItemPortal = {
  fonte?: string;
  url?: string;
  titulo?: string;
  descricao?: string;
  preco?: number;
  area_m2?: number;
  quartos?: number;
  bairro?: string;
  cidade?: string;
  telefone?: string;
  nome_anunciante?: string;
  empreendimento?: string;
};

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret") ?? req.headers.get("apikey");
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ erro: "secret invalido" }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }

  const itens: ItemPortal[] = Array.isArray(corpo)
    ? (corpo as ItemPortal[])
    : Array.isArray((corpo as { items?: ItemPortal[] })?.items)
      ? (corpo as { items: ItemPortal[] }).items
      : [];

  if (itens.length === 0) {
    return NextResponse.json(
      { erro: "esperado array de anuncios ou {items:[...]}" },
      { status: 400 },
    );
  }

  // Cidade-alvo: só Goiânia e região. Vazio = aceita tudo.
  const cidadesAlvo = (process.env.CIDADES_ALVO ?? "goiania,aparecida de goiania,senador canedo,trindade")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const supabase = db();
  const resultados: Array<{
    url?: string;
    situacao: string;
    id?: string;
    score?: number;
    classe?: string;
  }> = [];

  let gravados = 0;

  for (const item of itens) {
    const fonte = (item.fonte ?? "olx").toLowerCase();
    const titulo = item.titulo ?? "";
    const descricao = item.descricao ?? "";
    const textoLivre = [titulo, descricao].filter(Boolean).join("\n").trim();

    if (textoLivre.length < 15) {
      resultados.push({ url: item.url, situacao: "texto_curto" });
      continue;
    }

    // Filtro de cidade quando o scraper informa (normaliza acento)
    if (cidadesAlvo.length > 0 && item.cidade) {
      const semAcento = (s: string) =>
        s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const cid = semAcento(item.cidade);
      if (!cidadesAlvo.some((c) => cid.includes(semAcento(c)))) {
        resultados.push({ url: item.url, situacao: "fora_da_regiao" });
        continue;
      }
    }

    // Pré-filtro barato de repasse
    if (!pareceRepasse(textoLivre)) {
      resultados.push({ url: item.url, situacao: "nao_parece_repasse" });
      continue;
    }

    // Dedup: prioriza URL do anúncio, senão hash do texto
    const chave = item.url
      ? `${fonte}${item.url}`
      : `${fonte}${textoLivre.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const hashDedup = createHash("md5").update(chave).digest("hex");

    const { data: existente } = await supabase
      .from("anuncios_repasse")
      .select("id")
      .eq("hash_dedup", hashDedup)
      .maybeSingle();
    if (existente) {
      resultados.push({ url: item.url, situacao: "duplicado", id: existente.id });
      continue;
    }

    // IA confirma repasse + extrai score/urgência do texto livre
    let extraido: Awaited<ReturnType<typeof extrairAnuncio>>;
    try {
      extraido = await extrairAnuncio(textoLivre);
    } catch (e) {
      resultados.push({
        url: item.url,
        situacao: "erro_ia",
      });
      continue;
    }

    if (!extraido.eh_repasse) {
      resultados.push({ url: item.url, situacao: "ia_nao_repasse" });
      continue;
    }

    // Campos estruturados do scraper têm prioridade; IA preenche buracos
    const bairro = item.bairro ?? extraido.bairro;
    const empTexto = item.empreendimento ?? extraido.empreendimento_texto;
    const areaM2 = item.area_m2 ?? extraido.area_m2;
    const valorPedido = item.preco ?? extraido.valor_pedido;
    const tipologia = item.quartos ? `${item.quartos}q` : extraido.tipologia;
    const telefone = item.telefone ?? extraido.telefone_contato;
    const nome = item.nome_anunciante ?? extraido.nome_contato;

    // Match empreendimento + janela crítica
    let empId: string | null = null;
    let naJanela = false;
    if (empTexto) {
      const { data: match } = await supabase.rpc("match_empreendimento", {
        busca: empTexto,
      });
      if (
        Array.isArray(match) &&
        match.length > 0 &&
        (match[0] as { sim: number }).sim >= 0.35
      ) {
        empId = (match[0] as { id: string }).id;
        const { data: emp } = await supabase
          .from("empreendimentos_janela")
          .select("na_janela_critica")
          .eq("id", empId)
          .maybeSingle();
        naJanela =
          (emp as { na_janela_critica: boolean } | null)?.na_janela_critica === true;
      }
    }

    const classe = classeLead(extraido);
    const scoreFinal = aplicarBonusJanela(
      extraido.score_urgencia ?? 0,
      classe,
      naJanela,
    );

    const { data: inserido, error } = await supabase
      .from("anuncios_repasse")
      .insert({
        fonte,
        url_original: item.url ?? null,
        hash_dedup: hashDedup,
        texto_bruto: textoLivre,
        empreendimento_id: empId,
        empreendimento_texto: empTexto,
        bairro,
        tipologia,
        area_m2: areaM2,
        valor_pago: extraido.valor_pago,
        valor_pedido: valorPedido,
        saldo_devedor: extraido.saldo_devedor,
        fase_obra_mencionada: extraido.fase_obra_mencionada,
        telefone_contato: telefone,
        nome_contato: nome,
        score_urgencia: scoreFinal,
        sinais_urgencia: extraido.sinais_urgencia ?? [],
        status: "novo",
        extraido_em: new Date().toISOString(),
        modelo_extracao: MODELO_EXTRACAO,
      })
      .select("id")
      .single();

    if (error) {
      resultados.push({ url: item.url, situacao: "erro_insert" });
      continue;
    }

    gravados += 1;
    resultados.push({
      url: item.url,
      situacao: "novo",
      id: inserido.id,
      score: scoreFinal,
      classe,
    });
  }

  return NextResponse.json({
    ok: true,
    recebidos: itens.length,
    gravados,
    detalhes: resultados,
  });
}

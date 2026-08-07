import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Extracao } from "./types";

export const MODELO_EXTRACAO = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Você é um extrator de dados de anúncios imobiliários de REPASSE/CESSÃO DE
DIREITOS de imóveis na planta em Goiânia-GO. Responda APENAS com JSON
válido, sem markdown:

{
  "empreendimento_texto": string|null,
  "construtora": string|null,
  "bairro": string|null,
  "tipologia": string|null,
  "area_m2": number|null,
  "valor_pago": number|null,
  "valor_pedido": number|null,
  "saldo_devedor": number|null,
  "fase_obra_mencionada": string|null,
  "telefone_contato": string|null,
  "nome_contato": string|null,
  "sinais_urgencia": string[],
  "score_urgencia": 0-100,
  "eh_repasse": boolean
}

Regras:
- eh_repasse=true SOMENTE para cessão de direitos/repasse/ágio de imóvel na
  planta ou recém-entregue. Venda comum de usado = false.
- score_urgencia: 0-30 neutro; 31-60 sinais leves (aceita proposta,
  negociável); 61-100 sinais fortes (urgente, viagem, abaixo do valor pago,
  entrega chegando).
- "80 mil" -> 80000. Telefone: só dígitos com DDD.
- Nunca invente dados ausentes: use null.`;

let cached: Anthropic | null = null;

function client(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  cached = new Anthropic({ apiKey });
  return cached;
}

/** Remove cercas de markdown e sobras de texto ao redor do JSON. */
function parseJsonDefensivo(raw: string): unknown {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const inicio = t.indexOf("{");
    const fim = t.lastIndexOf("}");
    if (inicio === -1 || fim <= inicio) {
      throw new Error(`Resposta da IA não continha JSON: ${raw.slice(0, 200)}`);
    }
    return JSON.parse(t.slice(inicio, fim + 1));
  }
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizar(bruto: unknown): Extracao {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const telefone = texto(o.telefone_contato)?.replace(/\D/g, "") ?? null;
  const score = numero(o.score_urgencia) ?? 0;

  return {
    empreendimento_texto: texto(o.empreendimento_texto),
    construtora: texto(o.construtora),
    bairro: texto(o.bairro),
    tipologia: texto(o.tipologia),
    area_m2: numero(o.area_m2),
    valor_pago: numero(o.valor_pago),
    valor_pedido: numero(o.valor_pedido),
    saldo_devedor: numero(o.saldo_devedor),
    fase_obra_mencionada: texto(o.fase_obra_mencionada),
    telefone_contato: telefone && telefone.length >= 10 ? telefone : null,
    nome_contato: texto(o.nome_contato),
    sinais_urgencia: Array.isArray(o.sinais_urgencia)
      ? o.sinais_urgencia.filter((s): s is string => typeof s === "string" && s.trim() !== "")
      : [],
    score_urgencia: Math.max(0, Math.min(100, Math.round(score))),
    eh_repasse: o.eh_repasse === true,
  };
}

/** Extrai um anúncio. Lança em erro de API ou JSON irrecuperável — o chamador
 *  captura e marca o item do lote como `erro` sem derrubar o resto. */
export async function extrairAnuncio(textoBruto: string): Promise<Extracao> {
  const resposta = await client().messages.create({
    model: MODELO_EXTRACAO,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: textoBruto }],
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new Error("Resposta da IA sem bloco de texto.");
  }

  return normalizar(parseJsonDefensivo(bloco.text));
}

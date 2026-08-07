import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extrairComCliente } from "./extracao";
import type { Extracao } from "./types";

export { MODELO_EXTRACAO } from "./extracao";

let cached: Anthropic | null = null;

function client(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  cached = new Anthropic({ apiKey });
  return cached;
}

/**
 * Extrai um anúncio. Lança em erro de API ou JSON irrecuperável — o chamador
 * captura e marca o item do lote como `erro` sem derrubar o resto.
 */
export function extrairAnuncio(textoBruto: string): Promise<Extracao> {
  return extrairComCliente(client(), textoBruto);
}

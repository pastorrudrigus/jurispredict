import type { AnuncianteTipo } from "./types";

export type ClasseLead = "A" | "B" | "benchmark";

/**
 * Classe A = proprietário com urgência real. É o lead que vale a corrida.
 * Anúncio de corretor/imobiliária NÃO é descartado: vira benchmark, porque
 * serve de régua de preço por empreendimento e de mapa da concorrência.
 */
export function classeLead(input: {
  anunciante_tipo?: AnuncianteTipo | string | null;
  score_urgencia?: number | null;
}): ClasseLead {
  const tipo = input.anunciante_tipo ?? "indefinido";
  if (tipo === "corretor" || tipo === "imobiliaria") return "benchmark";
  if (tipo === "proprietario" && (input.score_urgencia ?? 0) >= 40) return "A";
  return "B";
}

export const ROTULO_CLASSE: Record<ClasseLead, string> = {
  A: "A",
  B: "B",
  benchmark: "BM",
};

export const COR_CLASSE: Record<ClasseLead, string> = {
  A: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
  B: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
  benchmark: "border-violet-500/40 bg-violet-500/10 text-violet-300",
};

/** Bônus da janela crítica pré-chaves (Parte C do spec). */
export const BONUS_JANELA_ANUNCIO = 20;
export const BONUS_JANELA_JUDICIAL = 25;

export function aplicarBonusJanela(
  score: number,
  classe: ClasseLead,
  naJanela: boolean,
): number {
  if (!naJanela || classe !== "A") return score;
  return Math.min(100, score + BONUS_JANELA_ANUNCIO);
}

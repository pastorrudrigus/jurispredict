/**
 * Camada 3 — Motor de limite. Seção 4 da spec.
 * Limite ancorado no que o cliente já compra: crédito a serviço do share of wallet.
 */

import type { ParametrosCarteira, Rating } from "./types.js";

const MULTIPLICADOR: Record<Rating, number> = { A: 1.5, B: 1.0, C: 0.6, D: 0.3, E: 0 };
const PRAZO_DIAS: Record<Rating, number> = { A: 60, B: 45, C: 35, D: 28, E: 0 };

/** Teto absoluto por cliente no MVP (Seção 4) — sobrescrever via ParametrosCarteira. */
export const TETO_ABSOLUTO_PADRAO = 100_000;
/** Nenhum cliente pode passar de 5% da carteira total. */
export const CAP_CONCENTRACAO = 0.05;
/** valido_ate = 90 dias ⇒ revisão trimestral obrigatória. */
export const VALIDADE_DIAS = 90;

export interface Limite {
  limiteCalculado: number;
  limiteAprovado: number;
  prazoMaximoDias: number;
  validadeDias: number;
}

export function calcularLimite(
  rating: Rating,
  faturamentoMedio3m: number,
  params: ParametrosCarteira = {}
): Limite {
  const bruto = Math.max(0, faturamentoMedio3m) * MULTIPLICADOR[rating];

  let aprovado = Math.min(bruto, params.tetoAbsoluto ?? TETO_ABSOLUTO_PADRAO);
  if (params.exposicaoCarteiraTotal !== undefined) {
    aprovado = Math.min(aprovado, params.exposicaoCarteiraTotal * CAP_CONCENTRACAO);
  }
  // arredonda para baixo em múltiplos de R$ 100 — limite "quebrado" só gera ruído
  aprovado = Math.floor(aprovado / 100) * 100;

  return {
    limiteCalculado: Math.round(bruto * 100) / 100,
    limiteAprovado: aprovado,
    prazoMaximoDias: PRAZO_DIAS[rating],
    validadeDias: VALIDADE_DIAS,
  };
}

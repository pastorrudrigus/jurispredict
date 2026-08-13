/**
 * Orquestração das três camadas do Crivo (Seção 4 da spec):
 * política (knockouts) → score comportamental → motor de limite.
 *
 * Função pura: recebe features, devolve a decisão completa. A persistência em
 * credito.decisoes e o transporte (Edge Function crivo-decide) são camadas por
 * fora — só entram após o Sprint 1 criar o schema, que por sua vez espera o
 * resultado da auditoria do Sprint 0.
 */

import { avaliarKnockouts, decisaoDosKnockouts } from "./knockouts.js";
import { calcularBlocos, calcularScore, ratingDoScore } from "./scorecard.js";
import { calcularLimite } from "./limites.js";
import type { FeaturesCliente, ParametrosCarteira, ResultadoCrivo } from "./types.js";

export const VERSAO_POLITICA = "v1.0";

export function decidir(f: FeaturesCliente, params: ParametrosCarteira = {}): ResultadoCrivo {
  const knockouts = avaliarKnockouts(f);
  const decisaoKO = decisaoDosKnockouts(knockouts);

  // score e rating são sempre calculados — mesmo negado/manual, a mesa e a
  // auditoria precisam ver o que o motor enxergou
  const blocos = calcularBlocos(f);
  const score = calcularScore(blocos);
  const rating = ratingDoScore(score);
  const limite = calcularLimite(rating, f.faturamentoMedio3m, params);

  const decisao = decisaoKO ?? (rating === "E" ? "negado" : "aprovado");

  // negado ou suspenso ⇒ nenhuma nova operação; manual ⇒ limite vai como
  // sugestão para a mesa, quem aprova é o analista dentro da alçada (Seção 8)
  const limiteAprovado = decisao === "negado" || decisao === "suspenso" ? 0 : limite.limiteAprovado;

  return {
    decisao,
    knockouts,
    score,
    rating,
    blocos,
    limiteCalculado: limite.limiteCalculado,
    limiteAprovado,
    prazoMaximoDias: decisao === "negado" || decisao === "suspenso" ? 0 : limite.prazoMaximoDias,
    validadeDias: limite.validadeDias,
    versaoPolitica: VERSAO_POLITICA,
    payloadFeatures: f,
  };
}

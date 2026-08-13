/**
 * Camada 1 — Política (knockouts, binário). Seção 4 da spec.
 * Qualquer regra acionada decide antes do score. Precedência: negar > suspender > manual.
 */

import type { Decisao, FeaturesCliente, Knockout } from "./types.js";

export function avaliarKnockouts(f: FeaturesCliente): Knockout[] {
  const ks: Knockout[] = [];

  if (!f.cnpjAtivo) {
    ks.push({ regra: "cnpj_inapto", acao: "negar", detalhe: "CNPJ inapto/baixado na Receita" });
  }
  if (f.restritivoGrave) {
    ks.push({ regra: "restritivo_grave", acao: "negar", detalhe: "Restritivo grave no Ábaco (protesto/execução fiscal relevante)" });
  }
  if (f.dpdAtual > 30) {
    ks.push({ regra: "dpd_maior_30", acao: "negar", detalhe: `dpd_atual = ${f.dpdAtual} dias na própria JC` });
  }
  if (f.qtdRenegociacoes6m > 0) {
    ks.push({ regra: "renegociacao_6m", acao: "manual", detalhe: `${f.qtdRenegociacoes6m} renegociação(ões) nos últimos 6 meses` });
  }
  if (f.mesesRelacionamento < 6 || f.qtdPedidos12m < 4) {
    ks.push({
      regra: "sem_historico",
      acao: "manual",
      detalhe: `relacionamento ${f.mesesRelacionamento}m / ${f.qtdPedidos12m} pedidos — sem histórico, limite conservador de entrada`,
    });
  }
  if (f.valorVencido > 0) {
    ks.push({ regra: "valor_vencido", acao: "suspender", detalhe: `R$ ${f.valorVencido.toFixed(2)} vencido em aberto` });
  }

  return ks;
}

/** Resolve a decisão a partir dos knockouts; null = nenhum acionado, segue para o score. */
export function decisaoDosKnockouts(ks: Knockout[]): Decisao | null {
  if (ks.some((k) => k.acao === "negar")) return "negado";
  if (ks.some((k) => k.acao === "suspender")) return "suspenso";
  if (ks.some((k) => k.acao === "manual")) return "manual";
  return null;
}

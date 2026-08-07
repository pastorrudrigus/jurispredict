import { brl, dataBR, deltaTexto, tempoRelativo } from "./format";
import type { Lead } from "./types";

function nomeEmpreendimento(lead: Lead): string {
  return (
    lead.empreendimentos?.nome ??
    lead.empreendimento_texto ??
    "Empreendimento não identificado"
  );
}

function bairro(lead: Lead): string | null {
  return lead.bairro ?? lead.empreendimentos?.bairro ?? null;
}

function tipologiaLinha(lead: Lead): string | null {
  const partes: string[] = [];
  if (lead.tipologia) partes.push(lead.tipologia);
  if (lead.area_m2) partes.push(`${lead.area_m2} m²`);
  return partes.length ? partes.join(", ") : null;
}

/** Pitch de um lead individual — formato da seção 7 do spec.
 *  Linhas sem dado são omitidas. */
export function pitchIndividual(lead: Lead): string {
  const linhas: string[] = [];

  const b = bairro(lead);
  linhas.push(`🏢 *${nomeEmpreendimento(lead)}*${b ? ` — ${b}` : ""}`);

  const tip = tipologiaLinha(lead);
  if (tip) linhas.push(tip);

  if (lead.valor_pedido) {
    const d = deltaTexto(lead.valor_pago, lead.valor_pedido);
    linhas.push(`💰 Pedido: ${brl(lead.valor_pedido)}${d ? ` (${d} vs pago)` : ""}`);
  }

  const financeiro: string[] = [];
  if (lead.valor_pago) financeiro.push(`Já pago: ${brl(lead.valor_pago)}`);
  if (lead.saldo_devedor) financeiro.push(`Saldo: ${brl(lead.saldo_devedor)}`);
  if (financeiro.length) linhas.push(`📈 ${financeiro.join(" | ")}`);

  if (lead.score_urgencia !== null && lead.score_urgencia !== undefined) {
    const sinais = (lead.sinais_urgencia ?? []).join(", ");
    linhas.push(
      `🔥 Urgência: ${lead.score_urgencia}/100${sinais ? ` — ${sinais}` : ""}`,
    );
  }

  const entrega = dataBR(lead.empreendimentos?.data_entrega_prevista ?? null);
  if (entrega) linhas.push(`🗓 Entrega prevista: ${entrega}`);

  linhas.push(`Fonte: ${lead.fonte}, captado ${tempoRelativo(lead.criado_em)}`);

  return linhas.join("\n");
}

/** Item compacto para a mensagem de lista. */
function itemCompacto(lead: Lead, indice: number): string {
  const b = bairro(lead);
  const linhas: string[] = [];
  linhas.push(`${indice}. *${nomeEmpreendimento(lead)}*${b ? ` — ${b}` : ""}`);

  const detalhe: string[] = [];
  const tip = tipologiaLinha(lead);
  if (tip) detalhe.push(tip);
  if (lead.valor_pedido) {
    const d = deltaTexto(lead.valor_pago, lead.valor_pedido);
    detalhe.push(`Pedido ${brl(lead.valor_pedido)}${d ? ` (${d})` : ""}`);
  }
  if (lead.saldo_devedor) detalhe.push(`Saldo ${brl(lead.saldo_devedor)}`);
  if (lead.score_urgencia !== null && lead.score_urgencia !== undefined) {
    detalhe.push(`🔥 ${lead.score_urgencia}/100`);
  }
  if (detalhe.length) linhas.push(`   ${detalhe.join(" · ")}`);

  const rodape: string[] = [];
  const entrega = dataBR(lead.empreendimentos?.data_entrega_prevista ?? null);
  if (entrega) rodape.push(`Entrega ${entrega}`);
  rodape.push(`${lead.fonte}, ${tempoRelativo(lead.criado_em)}`);
  linhas.push(`   ${rodape.join(" · ")}`);

  return linhas.join("\n");
}

/** Mensagem única com N oportunidades — versão lista da seção 7. */
export function pitchLista(leads: Lead[], hoje = new Date()): string {
  const data = hoje.toLocaleDateString("pt-BR");
  const cabecalho = `Radar Imob — ${data} — ${leads.length} oportunidade${
    leads.length === 1 ? "" : "s"
  } em Goiânia`;
  const corpo = leads.map((l, i) => itemCompacto(l, i + 1)).join("\n\n");
  return `${cabecalho}\n\n${corpo}`;
}

export function linkWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

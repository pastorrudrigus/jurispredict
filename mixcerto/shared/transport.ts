import type { LogisticsTerms, Modal, UF } from "./contracts";

/** UFs com acesso marítimo. Destinos fora desta lista exigem trecho terrestre final após cabotagem. */
export const COASTAL_UFS: UF[] = [
  "AP", "PA", "MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE", "BA", "ES", "RJ", "SP", "PR", "SC", "RS",
];

export const isCoastal = (uf: UF) => COASTAL_UFS.includes(uf);

/**
 * Valida condições logísticas declaradas. Retorna lista de erros (vazia = válida).
 * Não consulta rotas, capacidades ou transportadoras reais.
 */
export function validateLogistics(t: LogisticsTerms, destinationUf: UF): string[] {
  const errors: string[] = [];
  if (!t.modals.length) errors.push("Informe ao menos um modal.");
  if (!t.sellerDelivers && t.contractedBy === "vendedor")
    errors.push("Se o vendedor não entrega, a contratação do transporte/retirada é do comprador.");
  if (t.freightIncluded && t.paidBy === "comprador")
    errors.push("Frete absorvido/incluído só é possível quando o vendedor paga o frete.");
  if (t.freightIncluded && !t.sellerDelivers)
    errors.push("Frete incluído pelo vendedor exige que o vendedor entregue.");
  if (t.modals.includes("cabotagem") && !isCoastal(destinationUf) && !t.modals.some((m) => m === "rodoviario" || m === "ferroviario"))
    errors.push(`Cabotagem até ${destinationUf} exige trecho terrestre final (rodoviário ou ferroviário); valor e prazo devem abranger a combinação.`);
  for (const [k, v] of [["frete", t.freightCents], ["seguro", t.insuranceCents], ["despesas", t.expensesCents]] as const)
    if (!Number.isFinite(v) || v < 0) errors.push(`Valor de ${k} inválido.`);
  if (!Number.isInteger(t.leadTimeDays) || t.leadTimeDays < 0) errors.push("Prazo total inválido.");
  if (!Number.isInteger(t.paymentTermDays) || t.paymentTermDays < 0) errors.push("Prazo de pagamento inválido.");
  return errors;
}

/**
 * Frete incremental cobrado do comprador. Se o vendedor absorve/inclui o frete, é exibido
 * sem cobrança adicional; se o comprador paga transportadora ou retirada, o valor informado
 * entra mesmo quando o vendedor não entrega.
 */
export function incrementalFreight(t: LogisticsTerms): number {
  return t.freightIncluded ? 0 : t.freightCents;
}

/** Total logístico: frete incremental + seguro + despesas, cada um uma única vez. */
export function logisticsTotal(t: LogisticsTerms): number {
  return incrementalFreight(t) + t.insuranceCents + t.expensesCents;
}

export const describeResponsibility = (t: LogisticsTerms): string => {
  const delivery = t.sellerDelivers ? "Vendedor entrega" : "Retirada / transporte pelo comprador";
  const freight = t.freightIncluded ? "frete absorvido pelo vendedor" : `frete pago pelo ${t.paidBy}`;
  return `${delivery}; contratado pelo ${t.contractedBy}; ${freight}`;
};

export const modalsLabel = (m: Modal[]) => m.join(" + ");

import type { UF } from "./contracts";
import { presentValue, toCents, type Cents } from "./money";

/**
 * Simulador fiscal DIDÁTICO por cenário. Perfis de origem, preços, alíquotas, MVA e benefícios
 * são hipóteses editáveis — não uma base fiscal cadastrada nem prova de benefício de qualquer estado.
 * Nenhum resultado substitui validação documental ou profissional.
 */

export type Regime = "normal" | "simples";
export type Purpose = "revenda" | "uso_consumo" | "industrializacao";
export type StMode = "nenhuma" | "informada" | "calculada";

export interface TaxScenario {
  destinationUf: UF;
  /** Data da operação (yyyy-mm-dd). */
  date: string;
  productName: string;
  ncm: string;
  cest: string;
  quantity: number;
  buyerRegime: Regime;
  purpose: Purpose;
  /** Taxa ANUAL (%) para descontar a realização futura do crédito — base 365 dias. */
  annualRatePct: number;
  /** Dias até a realização (compensação) do crédito. */
  creditRealizationDays: number;
  /** Preço unitário de revenda (para débito de saída teórico). 0 = não informado. */
  resaleUnitCents: Cents;
  /** Hipótese de revisão específica que libera crédito bloqueado por padrão. */
  creditReviewOverride: boolean;
}

export interface OriginProfile {
  id: string;
  uf: UF;
  label: string;
  sellerRegime: Regime;
  unitPriceCents: Cents;
  freightMode: "absorvido" | "cobrado";
  freightCents: Cents;
  /** Alíquota do ICMS próprio destacado (interestadual). Já está INCLUÍDO no preço. */
  ownIcmsRatePct: number;
  /** Parcela do crédito que o comprador consegue utilizar (0–100%). */
  usableCreditPct: number;
  mvaPct: number;
  /** Alíquota interna do destino aplicada na hipótese. */
  destRatePct: number;
  stMode: StMode;
  stInformedCents: Cents;
  /** Revenda já está em ST final declarada pelo usuário: não acrescentar ST novamente. */
  resaleAlreadyStFinal: boolean;
  /** Benefício hipotético ao COMPRADOR (reduz custo econômico, não o caixa). */
  buyerBenefitCents: Cents;
  /** Benefício do VENDEDOR: apenas informativo, nunca vira desconto ou crédito do comprador. */
  sellerBenefitNote: string;
  /** Outros tributos incrementais informados manualmente (entram uma vez no caixa). */
  otherTaxesCents: Cents;
}

export interface TaxResult {
  originId: string;
  uf: UF;
  label: string;
  merchandiseCents: Cents;
  /** ICMS próprio contido no preço — exibido como parcela, NÃO somado de novo. */
  icmsIncludedCents: Cents;
  freightChargedCents: Cents;
  stCents: Cents;
  otherTaxesCents: Cents;
  /** Caixa de pagamento. Crédito não reduz este valor. */
  disbursementCents: Cents;
  creditBlocked: boolean;
  creditBlockReasons: string[];
  /** Crédito condicionado (nominal) — depende de aproveitamento. */
  conditionalCreditCents: Cents;
  creditPresentValueCents: Cents;
  buyerBenefitPresentValueCents: Cents;
  /** Custo econômico = desembolso − VP(crédito) − VP(benefício ao comprador). */
  economicCents: Cents;
  /** Débito de saída teórico na revenda — separado da compra. */
  outputDebitCents: Cents;
  theoreticalBalanceCents: Cents;
  notes: string[];
  position: number;
}

/** Regiões para a regra geral de alíquota interestadual (Res. SF 22/1989). */
const SOUTH_SOUTHEAST_EXCEPT_ES: UF[] = ["MG", "SP", "RJ", "PR", "SC", "RS"];

/** Alíquota interestadual da regra geral: 7% de S/SE (exceto ES) para N/NE/CO/ES; demais 12%. Hipótese editável. */
export function defaultInterstateRate(origin: UF, dest: UF): number {
  if (origin === dest) return DEFAULT_DEST_RATE[dest] ?? 18;
  return SOUTH_SOUTHEAST_EXCEPT_ES.includes(origin) && !SOUTH_SOUTHEAST_EXCEPT_ES.includes(dest) ? 7 : 12;
}

/**
 * Alíquota modal de referência por destino. DF: 20% (Lei nº 7.326/2023; ADI nº 1/2024 — efeitos a
 * partir de 22/01/2024). Não se aplica automaticamente a todo produto: classificação, reduções,
 * regime, operação, data e normas específicas continuam necessárias.
 */
export const DEFAULT_DEST_RATE: Partial<Record<UF, number>> = { DF: 20, GO: 19, MG: 18, SP: 18, PR: 19.5, BA: 20.5 };

export const DF_MODAL_EFFECTIVE_FROM = "2024-01-22";

export function destRateFor(dest: UF, date: string): number {
  if (dest === "DF") return date >= DF_MODAL_EFFECTIVE_FROM ? 20 : 18;
  return DEFAULT_DEST_RATE[dest] ?? 18;
}

export function creditBlockReasons(s: TaxScenario, o: OriginProfile): string[] {
  const r: string[] = [];
  if (s.buyerRegime === "simples") r.push("Comprador do Simples Nacional: crédito bloqueado por padrão");
  if (s.purpose === "uso_consumo") r.push("Finalidade uso/consumo: crédito bloqueado por padrão");
  if (o.sellerRegime === "simples") r.push("Fornecedor do Simples: crédito bloqueado por padrão");
  return r;
}

export function simulateOrigin(s: TaxScenario, o: OriginProfile): Omit<TaxResult, "position"> {
  const notes: string[] = [];
  const qty = Math.max(0, s.quantity);
  const merchandiseCents = Math.round(o.unitPriceCents * qty);
  const freightChargedCents = o.freightMode === "cobrado" ? o.freightCents : 0;
  if (o.freightMode === "absorvido") notes.push("Frete absorvido pelo vendedor: sem cobrança incremental.");
  const icmsBase = merchandiseCents + freightChargedCents;
  const icmsIncludedCents = Math.round((icmsBase * o.ownIcmsRatePct) / 100);

  // ---- Substituição tributária (fórmula didática; sem consulta a protocolos/legislação por produto)
  let stCents = 0;
  if (o.resaleAlreadyStFinal) {
    notes.push("Revenda declarada em ST final: ST não é acrescentada novamente.");
  } else if (o.stMode === "informada") {
    stCents = Math.max(0, Math.round(o.stInformedCents));
    notes.push("ST informada pelo usuário.");
  } else if (o.stMode === "calculada") {
    const stBase = (icmsBase + o.otherTaxesCents) * (1 + o.mvaPct / 100);
    stCents = Math.max(0, Math.round((stBase * o.destRatePct) / 100 - icmsIncludedCents));
    notes.push(`ST didática: base × (1 + MVA ${o.mvaPct}%) × ${o.destRatePct}% − ICMS próprio.`);
  }
  if (stCents > 0) notes.push("Crédito ordinário de ST não é atribuído automaticamente.");

  const otherTaxesCents = Math.max(0, Math.round(o.otherTaxesCents));
  const disbursementCents = merchandiseCents + freightChargedCents + stCents + otherTaxesCents;

  // ---- Crédito condicionado
  const blocks = creditBlockReasons(s, o);
  const creditBlocked = blocks.length > 0 && !s.creditReviewOverride;
  if (blocks.length && s.creditReviewOverride)
    notes.push("Crédito liberado por hipótese de revisão específica — exige validação profissional.");
  const usable = Math.min(100, Math.max(0, o.usableCreditPct));
  const conditionalCreditCents = creditBlocked ? 0 : Math.round((icmsIncludedCents * usable) / 100);
  const creditPresentValueCents = presentValue(conditionalCreditCents, s.annualRatePct, s.creditRealizationDays);
  const buyerBenefitPresentValueCents = presentValue(Math.max(0, o.buyerBenefitCents), s.annualRatePct, s.creditRealizationDays);
  if (o.sellerBenefitNote.trim())
    notes.push(`Benefício do vendedor (“${o.sellerBenefitNote.trim()}”) não vira desconto nem crédito do comprador.`);

  const economicCents = disbursementCents - creditPresentValueCents - buyerBenefitPresentValueCents;

  // ---- Débito de saída teórico (separado da compra)
  const stClosesChain = o.resaleAlreadyStFinal || stCents > 0;
  const outputDebitCents =
    s.purpose === "revenda" && s.resaleUnitCents > 0 && !stClosesChain
      ? Math.round((s.resaleUnitCents * qty * o.destRatePct) / 100)
      : 0;
  if (s.purpose === "revenda" && stClosesChain) notes.push("Saída sem débito próprio na hipótese de ST encerrada.");

  return {
    originId: o.id,
    uf: o.uf,
    label: o.label,
    merchandiseCents,
    icmsIncludedCents,
    freightChargedCents,
    stCents,
    otherTaxesCents,
    disbursementCents,
    creditBlocked,
    creditBlockReasons: blocks,
    conditionalCreditCents,
    creditPresentValueCents,
    buyerBenefitPresentValueCents,
    economicCents,
    outputDebitCents,
    theoreticalBalanceCents: outputDebitCents - conditionalCreditCents,
    notes,
  };
}

export function simulateTax(s: TaxScenario, origins: OriginProfile[]): TaxResult[] {
  return origins
    .map((o) => simulateOrigin(s, o))
    .sort((a, b) => a.economicCents - b.economicCents || a.disbursementCents - b.disbursementCents || a.originId.localeCompare(b.originId))
    .map((r, i) => ({ ...r, position: i + 1 }));
}

/** Sensibilidade do custo econômico ao percentual de crédito utilizável (0–100%). */
export function creditSensitivity(s: TaxScenario, origins: OriginProfile[], steps = [0, 25, 50, 75, 100]) {
  return steps.map((pctUsable) => {
    const row: Record<string, number> = { usable: pctUsable };
    for (const o of origins) row[o.id] = simulateOrigin(s, { ...o, usableCreditPct: pctUsable }).economicCents;
    return row;
  });
}

export const DEFAULT_SCENARIO: TaxScenario = {
  destinationUf: "DF",
  date: "2026-10-17",
  productName: "Detergente neutro 5 L",
  ncm: "3402.50.00",
  cest: "11.001.00",
  quantity: 200,
  buyerRegime: "normal",
  purpose: "uso_consumo",
  annualRatePct: 12,
  creditRealizationDays: 30,
  resaleUnitCents: 0,
  creditReviewOverride: false,
};

const profile = (p: Partial<OriginProfile> & Pick<OriginProfile, "id" | "uf" | "label" | "unitPriceCents">): OriginProfile => ({
  sellerRegime: "normal",
  freightMode: "cobrado",
  freightCents: 0,
  ownIcmsRatePct: defaultInterstateRate(p.uf, "DF"),
  usableCreditPct: 100,
  mvaPct: 40,
  destRatePct: 20,
  stMode: "nenhuma",
  stInformedCents: 0,
  resaleAlreadyStFinal: false,
  buyerBenefitCents: 0,
  sellerBenefitNote: "",
  otherTaxesCents: 0,
  ...p,
});

/** Cinco perfis de origem HIPOTÉTICOS para o mesmo produto, embalagem e quantidade. */
export const DEFAULT_ORIGINS: OriginProfile[] = [
  profile({ id: "o-mg", uf: "MG", label: "Origem MG (hipótese)", unitPriceCents: toCents(24.6), freightCents: toCents(380) }),
  profile({ id: "o-sp", uf: "SP", label: "Origem SP (hipótese)", unitPriceCents: toCents(26.4), freightMode: "absorvido", freightCents: toCents(420) }),
  profile({ id: "o-go", uf: "GO", label: "Origem GO (hipótese)", unitPriceCents: toCents(25.2), freightCents: toCents(160),
            sellerBenefitNote: "crédito outorgado do fornecedor (hipotético)" }),
  profile({ id: "o-pr", uf: "PR", label: "Origem PR (hipótese)", unitPriceCents: toCents(23.9), freightCents: toCents(690) }),
  profile({ id: "o-ba", uf: "BA", label: "Origem BA (hipótese)", unitPriceCents: toCents(24.1), freightCents: toCents(560), sellerRegime: "simples" }),
];

/** Cenário “Exemplificar crédito fiscal”: revenda por contribuinte do regime normal. */
export function creditExampleScenario(base: TaxScenario): TaxScenario {
  return { ...base, buyerRegime: "normal", purpose: "revenda", resaleUnitCents: toCents(34.9), creditReviewOverride: false };
}

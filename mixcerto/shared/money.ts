/** Valores monetários são inteiros em centavos para evitar erro de ponto flutuante. */
export type Cents = number;

export const toCents = (reais: number): Cents => Math.round(reais * 100);
export const fromCents = (c: Cents): number => c / 100;

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (c: Cents): string => BRL.format(c / 100);

export const pct = (v: number, digits = 2): string =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

/**
 * Valor presente com taxa ANUAL e base de 365 dias:
 * VP = valor / (1 + taxaAnual)^(dias/365).
 */
export function presentValue(value: Cents, annualRatePct: number, days: number): Cents {
  if (days <= 0 || annualRatePct <= 0) return value;
  return Math.round(value / Math.pow(1 + annualRatePct / 100, days / 365));
}

export const daysBetween = (fromIso: string, toIso: string): number =>
  Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);

export const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

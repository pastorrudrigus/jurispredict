import { describe, expect, it } from "vitest";
import {
  creditExampleScenario, creditSensitivity, DEFAULT_ORIGINS, DEFAULT_SCENARIO, defaultInterstateRate, destRateFor,
  simulateOrigin, simulateTax, type OriginProfile, type TaxScenario,
} from "../shared/tax-simulator.js";
import { presentValue } from "../shared/money.js";

const revenda: TaxScenario = { ...DEFAULT_SCENARIO, purpose: "revenda" };
const mg = DEFAULT_ORIGINS.find((o) => o.uf === "MG")!;

describe("simulador fiscal", () => {
  it("alíquotas interestaduais de referência para DF e modal 20% a partir de 22/01/2024", () => {
    expect(defaultInterstateRate("MG", "DF")).toBe(7);
    expect(defaultInterstateRate("SP", "DF")).toBe(7);
    expect(defaultInterstateRate("GO", "DF")).toBe(12);
    expect(defaultInterstateRate("BA", "DF")).toBe(12);
    expect(destRateFor("DF", "2024-01-22")).toBe(20);
    expect(destRateFor("DF", "2023-12-31")).toBe(18);
  });

  it("ICMS próprio é parcela do preço, não somado de novo; crédito não reduz o caixa", () => {
    const r = simulateOrigin(revenda, mg);
    expect(r.icmsIncludedCents).toBeGreaterThan(0);
    expect(r.disbursementCents).toBe(r.merchandiseCents + r.freightChargedCents);
    expect(r.conditionalCreditCents).toBe(r.icmsIncludedCents);
    expect(r.economicCents).toBe(r.disbursementCents - r.creditPresentValueCents);
  });

  it("crédito realizado no futuro é descontado por taxa anual base 365", () => {
    const s = { ...revenda, annualRatePct: 12, creditRealizationDays: 365 };
    const r = simulateOrigin(s, mg);
    expect(r.creditPresentValueCents).toBe(Math.round(r.conditionalCreditCents / 1.12));
    expect(presentValue(112, 12, 365)).toBe(100);
  });

  it("Simples, uso/consumo e fornecedor do Simples bloqueiam crédito por padrão", () => {
    expect(simulateOrigin(DEFAULT_SCENARIO, mg).creditBlocked).toBe(true); // uso_consumo
    expect(simulateOrigin({ ...revenda, buyerRegime: "simples" }, mg).conditionalCreditCents).toBe(0);
    const ba = DEFAULT_ORIGINS.find((o) => o.uf === "BA")!;
    expect(simulateOrigin(revenda, ba).creditBlocked).toBe(true);
    const unlocked = simulateOrigin({ ...revenda, creditReviewOverride: true }, ba);
    expect(unlocked.creditBlocked).toBe(false);
    expect(unlocked.notes.join()).toMatch(/revisão específica/);
  });

  it("benefício do vendedor não vira desconto do comprador; benefício do comprador só no econômico", () => {
    const base = simulateOrigin(revenda, mg);
    const withSeller = simulateOrigin(revenda, { ...mg, sellerBenefitNote: "crédito outorgado" });
    expect(withSeller.economicCents).toBe(base.economicCents);
    expect(withSeller.disbursementCents).toBe(base.disbursementCents);
    const withBuyer = simulateOrigin({ ...revenda, creditRealizationDays: 0 }, { ...mg, buyerBenefitCents: 5000 });
    expect(withBuyer.disbursementCents).toBe(base.disbursementCents);
    expect(withBuyer.economicCents).toBe(simulateOrigin({ ...revenda, creditRealizationDays: 0 }, mg).economicCents - 5000);
  });

  it("ST didática com MVA, sem duplicar quando a revenda já está em ST final", () => {
    const o: OriginProfile = { ...mg, stMode: "calculada", mvaPct: 40, destRatePct: 20, freightMode: "absorvido" };
    const r = simulateOrigin(revenda, o);
    const merch = r.merchandiseCents;
    expect(r.stCents).toBe(Math.round(merch * 1.4 * 0.2 - Math.round(merch * 0.07)));
    expect(r.disbursementCents).toBe(merch + r.stCents);
    expect(r.notes.join()).toMatch(/Crédito ordinário de ST não é atribuído/);
    const final = simulateOrigin(revenda, { ...o, resaleAlreadyStFinal: true });
    expect(final.stCents).toBe(0);
  });

  it("outros tributos manuais entram uma única vez no caixa", () => {
    const r = simulateOrigin(revenda, { ...mg, otherTaxesCents: 1234 });
    expect(r.disbursementCents).toBe(simulateOrigin(revenda, mg).disbursementCents + 1234);
  });

  it("débito de saída e saldo teórico ficam separados da compra", () => {
    const s = creditExampleScenario(DEFAULT_SCENARIO);
    const r = simulateOrigin(s, mg);
    expect(r.outputDebitCents).toBe(Math.round(s.resaleUnitCents * s.quantity * 0.2));
    expect(r.theoreticalBalanceCents).toBe(r.outputDebitCents - r.conditionalCreditCents);
    expect(r.disbursementCents).toBe(simulateOrigin(revenda, mg).disbursementCents);
  });

  it("ranking por cenário muda com o crédito utilizável", () => {
    const s = creditExampleScenario(DEFAULT_SCENARIO);
    const ranked = simulateTax(s, DEFAULT_ORIGINS);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
    const sens = creditSensitivity(s, DEFAULT_ORIGINS);
    expect(sens[0][mg.id]).toBeGreaterThan(sens[4][mg.id]);
  });
});

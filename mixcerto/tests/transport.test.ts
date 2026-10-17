import { describe, expect, it } from "vitest";
import { logisticsTotal, validateLogistics } from "../shared/transport";
import type { LogisticsTerms } from "../shared/contracts";

const base: LogisticsTerms = {
  sellerDelivers: true, contractedBy: "vendedor", paidBy: "comprador", freightIncluded: false, modals: ["rodoviario"],
  freightCents: 10000, insuranceCents: 500, expensesCents: 300, leadTimeDays: 5, paymentTermDays: 28,
};

describe("transporte", () => {
  it("cabotagem até Brasília exige trecho terrestre final", () => {
    expect(validateLogistics({ ...base, modals: ["cabotagem"] }, "DF").join()).toMatch(/trecho terrestre/);
    expect(validateLogistics({ ...base, modals: ["cabotagem", "rodoviario"] }, "DF")).toEqual([]);
    expect(validateLogistics({ ...base, modals: ["cabotagem"] }, "BA")).toEqual([]);
  });
  it("frete, seguro e despesas entram uma vez; frete incluído não é cobrado", () => {
    expect(logisticsTotal(base)).toBe(10800);
    expect(logisticsTotal({ ...base, paidBy: "vendedor", freightIncluded: true })).toBe(800);
  });
  it("retirada exige contratação pelo comprador e frete incluído exige vendedor pagador", () => {
    expect(validateLogistics({ ...base, sellerDelivers: false }, "DF").join()).toMatch(/comprador/);
    expect(validateLogistics({ ...base, freightIncluded: true }, "DF").join()).toMatch(/vendedor paga/);
  });
});

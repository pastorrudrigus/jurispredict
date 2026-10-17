import { describe, expect, it } from "vitest";
import {
  closeArena, createArena, createOrder, newDb, simulateRound, submitBid, updateLogistics, viewArena, type Db,
} from "../server/domain/competition";
import { seedCatalog, INITIAL_LOGISTICS } from "../server/seed";

const NOW = "2026-10-17T12:00:00.000Z";
const fresh = () => {
  const db = newDb(seedCatalog("2026-10-17"));
  const a = createArena(db, {}, NOW);
  return { db, a };
};
const leader = (db: Db, id: string) => viewArena(db, db.arenas.find((x) => x.id === id)!, NOW).ranking[0];

describe("arena de competição", () => {
  it("preserva o mix de 20 itens: 19 atendíveis e o saco reforçado explícito como indisponível", () => {
    const { a } = fresh();
    expect(a.basket).toHaveLength(19);
    expect(a.unavailable.map((u) => u.productId)).toEqual(["p10"]);
    expect(a.unavailable[0].reason).toContain("Abastece Minas");
  });

  it("ranking só entre aptas; preço nominal mais baixo não vence automaticamente", () => {
    const { db, a } = fresh();
    const v = viewArena(db, a, NOW);
    const apt = v.ranking.filter((r) => r.position !== null);
    const cheapest = [...apt].sort((x, y) => x.merchandiseCents - y.merchandiseCents)[0];
    expect(cheapest.supplierId).toBe("s4");
    expect(v.ranking[0].supplierId).not.toBe("s4");
    const baia = v.ranking.find((r) => r.supplierId === "s5")!;
    expect(baia.position).toBeNull();
    expect(baia.reasons.join()).toMatch(/Café/);
    expect(v.explanation.join(" ")).toMatch(/preço nominal mais baixo não vence/);
  });

  it("três rodadas determinísticas alternam a liderança e reduzem a melhor compra", () => {
    const { db, a } = fresh();
    const leaders = [leader(db, a.id).supplierId];
    const best = [leader(db, a.id).economicCents];
    for (let i = 0; i < 3; i++) {
      simulateRound(db, a.id, a.version, NOW);
      leaders.push(leader(db, a.id).supplierId);
      best.push(leader(db, a.id).economicCents);
    }
    expect(leaders).toEqual(["s2", "s1", "s2", "s1"]);
    for (let i = 1; i < best.length; i++) expect(best[i]).toBeLessThan(best[i - 1]);
    expect(a.rounds.every((r) => r.toPct - r.fromPct === 0.5)).toBe(true);
    expect(() => simulateRound(db, a.id, a.version, NOW)).toThrow(/Limite de 3/);
    expect(a.timeline).toHaveLength(4);
  });

  it("controle de versão rejeita operação com versão desatualizada", () => {
    const { db, a } = fresh();
    expect(() => simulateRound(db, a.id, a.version - 1, NOW)).toThrow(/desatualizada/);
    expect(() => simulateRound(db, a.id, undefined, NOW)).toThrow(/Informe a versão/);
  });

  it("lance manual: acumulado, crescente e até 12%", () => {
    const { db, a } = fresh();
    expect(() => submitBid(db, a.id, { supplierId: "s3", reductionPct: 12.5, expectedVersion: a.version }, NOW)).toThrow(/12%/);
    submitBid(db, a.id, { supplierId: "s3", reductionPct: 3, expectedVersion: a.version }, NOW);
    expect(() => submitBid(db, a.id, { supplierId: "s3", reductionPct: 2, expectedVersion: a.version }, NOW)).toThrow(/superar/);
    expect(a.proposals.find((p) => p.supplierId === "s3")!.reductionPct).toBe(3);
    expect(leader(db, a.id).supplierId).toBe("s3");
  });

  it("frete absorvido não é cobrado; frete pago pelo comprador entra mesmo sem entrega do vendedor", () => {
    const { db, a } = fresh();
    const v = viewArena(db, a, NOW);
    const s2 = v.ranking.find((r) => r.supplierId === "s2")!;
    expect(s2.freightAbsorbed).toBe(true);
    expect(s2.freightCents).toBe(0);
    expect(s2.disbursementCents).toBe(s2.merchandiseCents);
    const s3 = v.ranking.find((r) => r.supplierId === "s3")!;
    expect(s3.logistics.sellerDelivers).toBe(false);
    expect(s3.disbursementCents).toBe(s3.merchandiseCents + 18000 + 3500);
  });

  it("ajuste de frete valida combinação e é persistido na proposta", () => {
    const { db, a } = fresh();
    const bad = { ...INITIAL_LOGISTICS.s1, modals: ["cabotagem"] };
    expect(() => updateLogistics(db, a.id, "s1", { terms: bad, expectedVersion: a.version }, NOW)).toThrow(/trecho terrestre/);
    const ok = { ...INITIAL_LOGISTICS.s1, freightCents: 10000 };
    updateLogistics(db, a.id, "s1", { terms: ok, expectedVersion: a.version }, NOW);
    expect(a.proposals.find((p) => p.supplierId === "s1")!.logistics.freightCents).toBe(10000);
  });

  it("encerramento bloqueia novos lances e mudanças logísticas", () => {
    const { db, a } = fresh();
    closeArena(db, a.id, a.version, NOW);
    expect(a.status).toBe("encerrada");
    expect(() => simulateRound(db, a.id, a.version, NOW)).toThrow(/encerrada/);
    expect(() => submitBid(db, a.id, { supplierId: "s1", reductionPct: 5, expectedVersion: a.version }, NOW)).toThrow(/encerrada/);
    expect(() => updateLogistics(db, a.id, "s1", { terms: INITIAL_LOGISTICS.s1, expectedVersion: a.version }, NOW)).toThrow(/encerrada/);
  });

  it("mudança de cesta exige nova arena", () => {
    const { db, a } = fresh();
    // nenhum fornecedor passa a atender o café → cesta muda
    for (const o of db.catalog.offers.filter((x) => x.productId === "p15")) o.stock = 1;
    expect(() => closeArena(db, a.id, a.version, NOW)).toThrow(/nova arena/);
    expect(viewArena(db, a, NOW).basketDrift).toBe(true);
  });

  it("pedido: exige reconhecer a falta, revalida, é único e idempotente", () => {
    const { db, a } = fresh();
    for (let i = 0; i < 3; i++) simulateRound(db, a.id, a.version, NOW);
    expect(() => createOrder(db, a.id, { expectedVersion: a.version, acknowledgeShortage: true }, NOW)).toThrow(/Encerre/);
    closeArena(db, a.id, a.version, NOW);
    expect(() => createOrder(db, a.id, { expectedVersion: a.version }, NOW)).toThrow(/Reconheça/);
    const first = createOrder(db, a.id, { expectedVersion: a.version, acknowledgeShortage: true }, NOW);
    expect(first.replayed).toBe(false);
    expect(first.order.supplierName).toBe("Abastece Minas");
    expect(first.order.lines).toHaveLength(19);
    expect(first.order.shortages[0].productId).toBe("p10");
    expect(first.order.disbursementCents).toBe(first.order.merchandiseCents + first.order.logisticsCents);
    expect(first.order.logisticsCents).toBe(first.order.freightCents + first.order.insuranceCents + first.order.expensesCents);
    expect(first.order.improvementVsInitialCents).toBeGreaterThan(0);
    const again = createOrder(db, a.id, { expectedVersion: 1, acknowledgeShortage: true }, NOW, "cotacao");
    expect(again.replayed).toBe(true);
    expect(db.orders).toHaveLength(1);
  });

  it("pedido revalida preço/estoque após o encerramento", () => {
    const { db, a } = fresh();
    closeArena(db, a.id, a.version, NOW);
    const winner = a.closing!.winnerSupplierId;
    db.catalog.offers.find((o) => o.supplierId === winner && o.productId === "p01")!.unitPriceCents += 100;
    expect(() => createOrder(db, a.id, { expectedVersion: a.version, acknowledgeShortage: true }, NOW)).toThrow(/mudou/);
    expect(db.orders).toHaveLength(0);
  });

  it("nova arena não exclui a anterior", () => {
    const { db } = fresh();
    createArena(db, {}, NOW);
    expect(db.arenas.map((x) => x.id)).toEqual(["arena-1", "arena-2"]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Client, startServer } from "./helpers.js";

let server: Server;
let base = "";
let c: Client;
beforeAll(async () => {
  ({ server, base } = await startServer());
  c = new Client(base);
  expect((await c.login("comprador@teste.br")).status).toBe(200);
});
afterAll(() => server.close());

describe("API HTTP — fluxo completo", () => {
  it("arena → rodadas → encerrar → pedido idempotente; cotação-base não contorna regras", async () => {
    let r = await c.call("POST", "/arenas");
    expect(r.status).toBe(201);
    const id = r.body.id;
    let v = r.body.version;
    for (let i = 0; i < 3; i++) {
      r = await c.call("POST", `/arenas/${id}/rodadas`, { expectedVersion: v });
      expect(r.status).toBe(200);
      v = r.body.version;
    }
    expect((await c.call("POST", `/arenas/${id}/rodadas`, { expectedVersion: v })).body.code).toBe("ROUND_LIMIT");
    expect((await c.call("POST", `/arenas/${id}/rodadas`, { expectedVersion: v - 1 })).status).toBe(409);
    expect((await c.call("POST", `/cotacoes/${id}/pedido`, { expectedVersion: v, acknowledgeShortage: true })).body.code).toBe("ARENA_NOT_CLOSED");
    r = await c.call("POST", `/arenas/${id}/encerrar`, { expectedVersion: v });
    v = r.body.version;
    expect(r.body.closing.evaluation.supplierName).toBe("Abastece Minas");
    expect((await c.call("POST", `/arenas/${id}/lances`, { supplierId: "s2", reductionPct: 5, expectedVersion: v })).body.code).toBe("ARENA_CLOSED");
    expect((await c.call("POST", `/arenas/${id}/pedido`, { expectedVersion: v })).body.code).toBe("SHORTAGE_NOT_ACKNOWLEDGED");
    const p1 = await c.call("POST", `/arenas/${id}/pedido`, { expectedVersion: v, acknowledgeShortage: true });
    expect(p1.status).toBe(201);
    const p2 = await c.call("POST", `/arenas/${id}/pedido`, { expectedVersion: v, acknowledgeShortage: true });
    expect(p2.status).toBe(200);
    expect(p2.body.replayed).toBe(true);
    expect(p2.body.order.id).toBe(p1.body.order.id);
    expect((await c.call("GET", "/pedidos")).body).toHaveLength(1);
    const auditLog = (await c.call("GET", "/auditoria")).body as { actor: string; action: string }[];
    expect(auditLog.find((e) => e.action === "pedido.criado")!.actor).toBe("comprador@teste.br");
  });

  it("nova cotação com mix personalizado e matriz por item", async () => {
    const r = await c.call("POST", "/arenas", { title: "Reposição copa", mix: [{ productId: "p15", quantity: 10 }, { productId: "p16", quantity: 5 }, { productId: "p15", quantity: 2 }] });
    expect(r.status).toBe(201);
    expect(r.body.title).toBe("Reposição copa");
    expect(r.body.basket).toEqual([{ productId: "p15", quantity: 12 }, { productId: "p16", quantity: 5 }]);
    expect(r.body.unavailable).toHaveLength(0);
    expect(r.body.matrix).toHaveLength(2);
    expect(r.body.matrix[0].bestSupplierId).toBeTruthy();
    // Baía Comercial atende 12 cafés (estoque 10? não) — continua inapta por estoque
    expect((await c.call("POST", "/arenas", { mix: [{ productId: "zzz", quantity: 1 }] })).body.code).toBe("UNKNOWN_PRODUCT");
    expect((await c.call("POST", "/arenas", { mix: [{ productId: "p01", quantity: 0 }] })).body.code).toBe("INVALID_QUANTITY");
  });

  it("scorecard de fornecedores", async () => {
    const r = await c.call("GET", "/fornecedores");
    expect(r.body).toHaveLength(5);
    const am = r.body.find((s: { id: string }) => s.id === "s1");
    expect(am.ordersWon).toBe(1);
    expect(am.participations).toBeGreaterThan(0);
  });

  it("rotas desconhecidas e JSON inválido retornam erros estruturados", async () => {
    expect((await c.call("GET", "/nada")).status).toBe(404);
    const res = await fetch(`${base}/arenas`, { method: "POST", headers: { "content-type": "application/json", cookie: c.cookie, "x-mixcerto": "1" }, body: "{" });
    expect(res.status).toBe(400);
  });
});

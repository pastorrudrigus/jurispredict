import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/app";
import { Store } from "../server/store";

let server: Server;
let base = "";
beforeAll(async () => {
  const store = new Store(null, () => "2026-10-17T12:00:00.000Z");
  server = createApp(store).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

describe("API HTTP — fluxo completo", () => {
  it("arena → rodadas → encerrar → pedido idempotente; cotação-base não contorna regras", async () => {
    let r = await call("POST", "/arenas");
    expect(r.status).toBe(201);
    const id = r.body.id;
    let v = r.body.version;
    for (let i = 0; i < 3; i++) {
      r = await call("POST", `/arenas/${id}/rodadas`, { expectedVersion: v });
      expect(r.status).toBe(200);
      v = r.body.version;
    }
    expect((await call("POST", `/arenas/${id}/rodadas`, { expectedVersion: v })).body.code).toBe("ROUND_LIMIT");
    expect((await call("POST", `/arenas/${id}/rodadas`, { expectedVersion: v - 1 })).status).toBe(409);
    expect((await call("POST", `/cotacoes/${id}/pedido`, { expectedVersion: v, acknowledgeShortage: true })).body.code).toBe("ARENA_NOT_CLOSED");
    r = await call("POST", `/arenas/${id}/encerrar`, { expectedVersion: v });
    v = r.body.version;
    expect(r.body.closing.evaluation.supplierName).toBe("Abastece Minas");
    expect((await call("POST", `/arenas/${id}/lances`, { supplierId: "s2", reductionPct: 5, expectedVersion: v })).body.code).toBe("ARENA_CLOSED");
    expect((await call("POST", `/arenas/${id}/pedido`, { expectedVersion: v })).body.code).toBe("SHORTAGE_NOT_ACKNOWLEDGED");
    const p1 = await call("POST", `/arenas/${id}/pedido`, { expectedVersion: v, acknowledgeShortage: true });
    expect(p1.status).toBe(201);
    const p2 = await call("POST", `/arenas/${id}/pedido`, { expectedVersion: v, acknowledgeShortage: true });
    expect(p2.status).toBe(200);
    expect(p2.body.replayed).toBe(true);
    expect(p2.body.order.id).toBe(p1.body.order.id);
    expect((await call("GET", "/pedidos")).body).toHaveLength(1);
    expect((await call("GET", "/auditoria")).body.length).toBeGreaterThan(5);
  });

  it("rotas desconhecidas e JSON inválido retornam erros estruturados", async () => {
    expect((await call("GET", "/nada")).status).toBe(404);
    const res = await fetch(`${base}/arenas`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(res.status).toBe(400);
  });
});

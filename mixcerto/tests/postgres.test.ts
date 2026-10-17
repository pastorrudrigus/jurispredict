import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import pg from "pg";
import { createApp } from "../server/app.js";
import { createUser, ensureBootstrapAdmin } from "../server/auth.js";
import { PostgresBackend, Store } from "../server/store.js";
import { Client, PASSWORD } from "./helpers.js";

/** Roda só com TEST_DATABASE_URL (ex.: postgresql://mix:mix@localhost:5432/mixcerto). */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("persistência em Postgres (Supabase)", () => {
  let server: Server;
  let base = "";
  let backend: PostgresBackend;
  let store: Store;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query("DROP TABLE IF EXISTS mixcerto_state");
    await admin.end();
    backend = new PostgresBackend(url!);
    store = new Store(backend, () => "2026-10-17T12:00:00.000Z");
    process.env.MIXCERTO_ADMIN_PASSWORD = PASSWORD;
    store.onFirstRequest = (s) => {
      ensureBootstrapAdmin(s, () => {});
      if (!s.db.users.some((u) => u.email === "comprador@teste.br"))
        createUser(s.db, s.now(), { email: "comprador@teste.br", name: "c", role: "comprador", password: PASSWORD, mustChangePassword: false });
      s.save();
    };
    server = createApp(store).listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => {
    server.close();
    delete process.env.MIXCERTO_ADMIN_PASSWORD;
    await backend.end();
  });

  it("cria a tabela, semeia e persiste entre instâncias", async () => {
    const c = new Client(base);
    expect((await c.login("comprador@teste.br")).status).toBe(200);
    const a = await c.call("POST", "/arenas");
    expect(a.status).toBe(201);
    // Nova instância (como outra função serverless) lê o mesmo estado.
    const other = new Store(new PostgresBackend(url!));
    const ids = await other.run(false, () => other.db.arenas.map((x) => x.id));
    expect(ids).toContain(a.body.id);
    const users = await other.run(false, () => other.db.users.map((u) => u.email));
    expect(users).toContain("admin@mixcerto.local");
  });

  it("escritas concorrentes são serializadas: só um lance vence a mesma versão", async () => {
    const c = new Client(base);
    await c.login("comprador@teste.br");
    const a = (await c.call("POST", "/arenas")).body;
    const results = await Promise.all(
      ["s1", "s2", "s3", "s4"].map((s) => c.call("POST", `/arenas/${a.id}/lances`, { supplierId: s, reductionPct: 1, expectedVersion: a.version })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.code === "VERSION_CONFLICT")).toHaveLength(3);
    const after = (await c.call("GET", `/arenas/${a.id}`)).body;
    expect(after.version).toBe(a.version + 1);
  });

  it("falha de login fica gravada mesmo com resposta 401", async () => {
    const c = new Client(base);
    await c.login("comprador@teste.br", "errada12345");
    const fails = await store.run(false, () => store.db.audit.filter((e) => e.action === "auth.falha").length);
    expect(fails).toBeGreaterThan(0);
  });

  it("pedido idempotente sob confirmações simultâneas", async () => {
    const c = new Client(base);
    await c.login("comprador@teste.br");
    let a = (await c.call("POST", "/arenas")).body;
    a = (await c.call("POST", `/arenas/${a.id}/encerrar`, { expectedVersion: a.version })).body;
    const rs = await Promise.all([1, 2, 3].map(() => c.call("POST", `/arenas/${a.id}/pedido`, { expectedVersion: a.version, acknowledgeShortage: true })));
    const ids = new Set(rs.map((r) => r.body.order?.id));
    expect(ids.size).toBe(1);
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
  });
});

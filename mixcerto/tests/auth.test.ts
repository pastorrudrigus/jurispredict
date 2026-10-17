import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Client, PASSWORD, startServer } from "./helpers";
import { hashPassword, verifyPassword } from "../server/auth";
import type { Store } from "../server/store";

let server: Server;
let base = "";
let store: Store;
beforeAll(async () => {
  ({ server, base, store } = await startServer());
});
afterAll(() => server.close());

describe("controle de acesso", () => {
  it("senhas com scrypt e sal", () => {
    const h = hashPassword("abc12345678");
    expect(h).not.toContain("abc12345678");
    expect(verifyPassword("abc12345678", h)).toBe(true);
    expect(verifyPassword("errada12345", h)).toBe(false);
    expect(hashPassword("abc12345678")).not.toBe(h);
  });

  it("sem login, a API (exceto health) responde 401", async () => {
    const c = new Client(base);
    expect((await c.call("GET", "/arenas")).status).toBe(401);
    expect((await c.call("GET", "/auditoria")).status).toBe(401);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("login define cookie HttpOnly/SameSite e não expõe hash", async () => {
    const c = new Client(base);
    const r = await c.login("leitura@teste.br");
    expect(r.status).toBe(200);
    expect(r.setCookie).toMatch(/HttpOnly/);
    expect(r.setCookie).toMatch(/SameSite=Strict/);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash/);
    expect(store.db.sessions.every((s) => !r.setCookie!.includes(s.tokenHash))).toBe(true);
    expect((await c.call("GET", "/auth/me")).body.user.role).toBe("leitura");
  });

  it("credenciais inválidas: mensagem genérica e bloqueio após 5 tentativas", async () => {
    const c = new Client(base);
    const unknown = await c.login("ninguem@teste.br", "qualquer123");
    const wrong = await c.login("comprador@teste.br", "errada12345");
    expect(unknown.body.error).toBe(wrong.body.error);
    for (let i = 0; i < 4; i++) await c.login("comprador@teste.br", "errada12345");
    const locked = await c.login("comprador@teste.br", PASSWORD);
    expect(locked.status).toBe(429);
    store.db.users.find((u) => u.email === "comprador@teste.br")!.lockedUntil = null;
    expect((await c.login("comprador@teste.br")).status).toBe(200);
  });

  it("escritas exigem cabeçalho anti-CSRF", async () => {
    const c = new Client(base);
    await c.login("admin@teste.br");
    expect((await c.call("POST", "/arenas", {}, {})).body.code).toBe("CSRF");
    expect((await c.call("POST", "/auth/login", { email: "admin@teste.br", password: PASSWORD }, {})).body.code).toBe("CSRF");
  });

  it("perfis: leitura só consulta; comprador negocia mas não gere verbas/usuários", async () => {
    const leitor = new Client(base);
    await leitor.login("leitura@teste.br");
    expect((await leitor.call("GET", "/arenas")).status).toBe(200);
    expect((await leitor.call("POST", "/arenas", {})).body.code).toBe("FORBIDDEN");
    expect((await leitor.call("PATCH", "/catalogo/produtos/p01", { minShelfLifeDays: 3 })).status).toBe(403);
    const comprador = new Client(base);
    await comprador.login("comprador@teste.br");
    expect((await comprador.call("POST", "/arenas", {})).status).toBe(201);
    expect((await comprador.call("PATCH", "/verbas/v1", { ceilingCents: 100 })).status).toBe(403);
    expect((await comprador.call("GET", "/usuarios")).status).toBe(403);
    expect((await comprador.call("POST", "/demo/reset", {})).status).toBe(403);
  });

  it("admin cria usuário; troca de senha obrigatória no 1º acesso", async () => {
    const admin = new Client(base);
    await admin.login("admin@teste.br");
    expect((await admin.call("POST", "/usuarios", { email: "novo@teste.br", name: "Novo", role: "comprador", password: "curta" })).body.code).toBe("WEAK_PASSWORD");
    const created = await admin.call("POST", "/usuarios", { email: "Novo@Teste.br", name: "Novo", role: "comprador", password: "Temporaria123" });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe("novo@teste.br");
    expect((await admin.call("POST", "/usuarios", { email: "novo@teste.br", role: "comprador", password: "Temporaria123" })).body.code).toBe("EMAIL_TAKEN");

    const novo = new Client(base);
    await novo.login("novo@teste.br", "Temporaria123");
    expect((await novo.call("GET", "/arenas")).body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await novo.call("POST", "/auth/password", { currentPassword: "errada", newPassword: "NovaSenha456" })).status).toBe(400);
    expect((await novo.call("POST", "/auth/password", { currentPassword: "Temporaria123", newPassword: "NovaSenha456" })).status).toBe(200);
    expect((await novo.call("GET", "/arenas")).status).toBe(200);

    // desativar encerra sessões
    await admin.call("PATCH", `/usuarios/${created.body.id}`, { active: false });
    expect((await novo.call("GET", "/arenas")).status).toBe(401);
    expect((await novo.login("novo@teste.br", "NovaSenha456")).status).toBe(401);
  });

  it("admin não remove o próprio acesso; logout invalida a sessão", async () => {
    const admin = new Client(base);
    const me = (await admin.login("admin@teste.br")).body.user;
    expect((await admin.call("PATCH", `/usuarios/${me.id}`, { role: "leitura" })).body.code).toBe("SELF_DEMOTE");
    expect((await admin.call("PATCH", `/usuarios/${me.id}`, { active: false })).body.code).toBe("SELF_DISABLE");
    const cookie = admin.cookie;
    await admin.call("POST", "/auth/logout", {});
    admin.cookie = cookie;
    expect((await admin.call("GET", "/arenas")).status).toBe(401);
  });

  it("auditoria registra login e falhas", () => {
    const actions = store.db.audit.map((e) => e.action);
    expect(actions).toContain("auth.login");
    expect(actions).toContain("auth.falha");
    expect(actions).toContain("usuario.criado");
  });
});

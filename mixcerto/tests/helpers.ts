import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/app.js";
import { createUser } from "../server/auth.js";
import { Store } from "../server/store.js";

export const PASSWORD = "SenhaForte123";

/** Sobe a API em memória com um usuário de cada perfil (senha já definitiva). */
export async function startServer() {
  const store = new Store(null, () => "2026-10-17T12:00:00.000Z");
  for (const role of ["admin", "comprador", "leitura"] as const)
    createUser(store.db, store.now(), { email: `${role}@teste.br`, name: role, role, password: PASSWORD, mustChangePassword: false });
  const server: Server = createApp(store).listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  return { store, server, base };
}

export class Client {
  cookie = "";
  constructor(private base: string) {}
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = { "x-mixcerto": "1" }) {
    const res = await fetch(this.base + path, {
      method,
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, body: await res.json(), setCookie: set };
  }
  async login(email: string, password = PASSWORD) {
    return this.call("POST", "/auth/login", { email, password });
  }
}

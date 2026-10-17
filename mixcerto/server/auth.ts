import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { can, passwordProblem, type Permission, type PublicUser, type Role } from "../shared/auth";
import { requestContext } from "./context";
import { audit, DomainError, type Db, type UserRecord } from "./domain/competition";
import type { Store } from "./store";

export const SESSION_COOKIE = "mixcerto_sid";
const SESSION_HOURS = 8;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const ROLES: Role[] = ["admin", "comprador", "leitura"];

// ---------- Senhas (scrypt com sal aleatório) ----------

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Hash usado para comparar tempo constante quando o e-mail não existe (evita enumeração por tempo). */
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString("hex"));

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export const toPublic = (u: UserRecord): PublicUser => ({
  id: u.id, email: u.email, name: u.name, role: u.role, active: u.active,
  mustChangePassword: u.mustChangePassword, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
});

const normEmail = (e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : "");
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

export function createUser(db: Db, now: string, input: { email: unknown; name: unknown; role: unknown; password: unknown; mustChangePassword?: boolean }): UserRecord {
  const email = normEmail(input.email);
  if (!validEmail(email)) throw new DomainError(400, "INVALID_EMAIL", "E-mail inválido.");
  if (db.users.some((u) => u.email === email)) throw new DomainError(409, "EMAIL_TAKEN", "Já existe um usuário com este e-mail.");
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 120) : email;
  if (!ROLES.includes(input.role as Role)) throw new DomainError(400, "INVALID_ROLE", "Perfil inválido.");
  const problem = passwordProblem(input.password);
  if (problem) throw new DomainError(400, "WEAK_PASSWORD", problem);
  const u: UserRecord = {
    id: `u${++db.seq.user}`, email, name, role: input.role as Role, active: true,
    mustChangePassword: input.mustChangePassword ?? true,
    passwordHash: hashPassword(input.password as string), createdAt: now, lastLoginAt: null, failedLogins: 0, lockedUntil: null,
  };
  db.users.push(u);
  return u;
}

/**
 * Garante um administrador inicial. Usa MIXCERTO_ADMIN_EMAIL / MIXCERTO_ADMIN_PASSWORD; sem senha
 * configurada, gera uma aleatória e mostra uma única vez no log do servidor.
 */
export function ensureBootstrapAdmin(store: Store, log: (m: string) => void = console.log) {
  const db = store.db;
  if (db.users.some((u) => u.role === "admin" && u.active)) return;
  const email = normEmail(process.env.MIXCERTO_ADMIN_EMAIL) || "admin@mixcerto.local";
  let password = process.env.MIXCERTO_ADMIN_PASSWORD ?? "";
  const generated = !password;
  if (generated) password = `${crypto.randomBytes(9).toString("base64url")}9a`;
  const existing = db.users.find((u) => u.email === email);
  if (existing) {
    Object.assign(existing, { role: "admin", active: true, passwordHash: hashPassword(password), mustChangePassword: generated });
  } else {
    createUser(db, store.now(), { email, name: "Administrador", role: "admin", password, mustChangePassword: generated });
  }
  audit(db, store.now(), "usuario.bootstrap", email, "Administrador inicial configurado.", "sistema");
  store.save();
  if (generated) log(`\n[MixCerto] Administrador inicial: ${email}  senha temporária: ${password}\n           (defina MIXCERTO_ADMIN_PASSWORD para escolher a senha; a troca será exigida no 1º acesso)\n`);
}

// ---------- Sessões ----------

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** `Secure` sempre que a requisição chegou por HTTPS (inclusive atrás do proxy do Render, via trust proxy). */
function setSessionCookie(req: Request, res: Response, token: string, maxAgeSec: number) {
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`);
}

export interface AuthedRequest extends Request {
  user?: UserRecord;
}

export function sessionUser(db: Db, req: Request, now: string): UserRecord | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const s = db.sessions.find((x) => x.tokenHash === sha256(token));
  if (!s || s.expiresAt <= now) return null;
  const u = db.users.find((x) => x.id === s.userId);
  return u && u.active ? u : null;
}

const pruneSessions = (db: Db, now: string) => {
  db.sessions = db.sessions.filter((s) => s.expiresAt > now);
};

/**
 * Autenticação + contexto de auditoria + proteção CSRF.
 * Escritas exigem o cabeçalho `X-MixCerto: 1` (um site de terceiros não consegue enviá-lo sem CORS)
 * além do cookie SameSite=Strict.
 */
export function authMiddleware(store: Store) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = sessionUser(store.db, req, store.now());
    if (!user) return res.status(401).json({ error: "Faça login para continuar.", code: "UNAUTHENTICATED" });
    if (req.method !== "GET" && req.headers["x-mixcerto"] !== "1")
      return res.status(403).json({ error: "Requisição sem cabeçalho de proteção.", code: "CSRF" });
    const pwRoute = req.path === "/auth/password" || req.path === "/auth/logout" || req.path === "/auth/me";
    if (user.mustChangePassword && !pwRoute)
      return res.status(403).json({ error: "Troque a senha temporária antes de continuar.", code: "PASSWORD_CHANGE_REQUIRED" });
    req.user = user;
    requestContext.run({ actor: user.email }, () => next());
  };
}

/** Exige permissão. Leitura (GET) é liberada a qualquer usuário autenticado. */
export const requirePermission = (p: Permission) => (req: AuthedRequest, res: Response, next: NextFunction) => {
  if (!can(req.user?.role, p)) return res.status(403).json({ error: "Seu perfil não tem permissão para esta ação.", code: "FORBIDDEN" });
  next();
};

const failures = new Map<string, { count: number; until: number }>();

export function authRoutes(store: Store) {
  const pub = Router();
  const priv = Router();
  const db = () => store.db;
  const now = () => store.now();

  pub.post("/auth/login", (req, res) => {
    if (req.headers["x-mixcerto"] !== "1") return res.status(403).json({ error: "Requisição sem cabeçalho de proteção.", code: "CSRF" });
    const email = normEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    // Limite por IP contra força bruta distribuída entre contas.
    const ipKey = `ip:${req.ip}`;
    const ipf = failures.get(ipKey);
    if (ipf && ipf.count >= 20 && ipf.until > Date.now())
      return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos.", code: "RATE_LIMITED" });
    const u = db().users.find((x) => x.email === email);
    const t = now();
    if (u?.lockedUntil && u.lockedUntil > t)
      return res.status(429).json({ error: `Conta bloqueada temporariamente por tentativas inválidas. Tente após ${new Date(u.lockedUntil).toLocaleTimeString("pt-BR")}.`, code: "LOCKED" });
    const ok = verifyPassword(password, u?.passwordHash ?? DUMMY_HASH) && !!u && u.active;
    if (!ok) {
      failures.set(ipKey, { count: (ipf && ipf.until > Date.now() ? ipf.count : 0) + 1, until: Date.now() + LOCK_MINUTES * 60_000 });
      if (u) {
        u.failedLogins++;
        if (u.failedLogins >= MAX_FAILED) {
          u.lockedUntil = new Date(Date.parse(t) + LOCK_MINUTES * 60_000).toISOString();
          u.failedLogins = 0;
        }
      }
      audit(db(), t, "auth.falha", email || "(vazio)", "Tentativa de login inválida.", "anônimo");
      store.save();
      return res.status(401).json({ error: "E-mail ou senha inválidos.", code: "INVALID_CREDENTIALS" });
    }
    failures.delete(ipKey);
    u.failedLogins = 0;
    u.lockedUntil = null;
    u.lastLoginAt = t;
    pruneSessions(db(), t);
    const token = crypto.randomBytes(32).toString("base64url");
    db().sessions.push({ tokenHash: sha256(token), userId: u.id, createdAt: t, expiresAt: new Date(Date.parse(t) + SESSION_HOURS * 3600_000).toISOString() });
    audit(db(), t, "auth.login", u.email, "Login realizado.", u.email);
    store.save();
    setSessionCookie(req, res, token, SESSION_HOURS * 3600);
    res.json({ user: toPublic(u) });
  });

  priv.get("/auth/me", (req: AuthedRequest, res) => res.json({ user: toPublic(req.user!) }));

  priv.post("/auth/logout", (req: AuthedRequest, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    db().sessions = db().sessions.filter((s) => s.tokenHash !== sha256(token ?? ""));
    audit(db(), now(), "auth.logout", req.user!.email, "Logout.");
    store.save();
    setSessionCookie(req, res, "", 0);
    res.json({ ok: true });
  });

  priv.post("/auth/password", (req: AuthedRequest, res) => {
    const u = req.user!;
    if (!verifyPassword(String(req.body?.currentPassword ?? ""), u.passwordHash))
      return res.status(400).json({ error: "Senha atual incorreta.", code: "INVALID_CREDENTIALS" });
    const problem = passwordProblem(req.body?.newPassword);
    if (problem) return res.status(400).json({ error: problem, code: "WEAK_PASSWORD" });
    if (req.body.newPassword === req.body.currentPassword)
      return res.status(400).json({ error: "A nova senha precisa ser diferente da atual.", code: "WEAK_PASSWORD" });
    u.passwordHash = hashPassword(req.body.newPassword);
    u.mustChangePassword = false;
    // Encerra as outras sessões do usuário.
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    db().sessions = db().sessions.filter((s) => s.userId !== u.id || s.tokenHash === sha256(token ?? ""));
    audit(db(), now(), "auth.senha", u.email, "Senha alterada.");
    store.save();
    res.json({ user: toPublic(u) });
  });

  // ---------- Gestão de usuários (admin) ----------
  const onlyAdmin = requirePermission("usuarios");
  const handle = (fn: (req: AuthedRequest, res: Response) => unknown) => (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const out = fn(req, res);
      store.save();
      if (!res.headersSent) res.json(out);
    } catch (e) {
      if (e instanceof DomainError) res.status(e.status).json({ error: e.message, code: e.code });
      else next(e);
    }
  };

  priv.get("/usuarios", onlyAdmin, (_req, res) => res.json(db().users.map(toPublic)));

  priv.post("/usuarios", onlyAdmin, handle((req, res) => {
    const u = createUser(db(), now(), { ...req.body, mustChangePassword: true });
    audit(db(), now(), "usuario.criado", u.email, `Perfil ${u.role}.`);
    res.status(201);
    return toPublic(u);
  }));

  priv.patch("/usuarios/:id", onlyAdmin, handle((req) => {
    const u = db().users.find((x) => x.id === req.params.id);
    if (!u) throw new DomainError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
    const { role, active, name, password } = req.body ?? {};
    const self = u.id === req.user!.id;
    if (role !== undefined) {
      if (!ROLES.includes(role)) throw new DomainError(400, "INVALID_ROLE", "Perfil inválido.");
      if (self && role !== "admin") throw new DomainError(409, "SELF_DEMOTE", "Você não pode remover seu próprio perfil de administrador.");
      u.role = role;
    }
    if (active !== undefined) {
      if (self && active === false) throw new DomainError(409, "SELF_DISABLE", "Você não pode desativar a própria conta.");
      u.active = Boolean(active);
      if (!u.active) db().sessions = db().sessions.filter((s) => s.userId !== u.id);
    }
    if (typeof name === "string" && name.trim()) u.name = name.trim().slice(0, 120);
    if (password !== undefined) {
      const problem = passwordProblem(password);
      if (problem) throw new DomainError(400, "WEAK_PASSWORD", problem);
      u.passwordHash = hashPassword(password);
      u.mustChangePassword = true;
      u.lockedUntil = null;
      u.failedLogins = 0;
      db().sessions = db().sessions.filter((s) => s.userId !== u.id);
    }
    audit(db(), now(), "usuario.alterado", u.email, JSON.stringify({ role, active, name, senhaRedefinida: password !== undefined }));
    return toPublic(u);
  }));

  return { pub, priv };
}

import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import pg from "pg";
import { newDb, type Db } from "./domain/competition.js";
import { seedCatalog } from "./seed.js";

/** Uma unidade de trabalho: estado carregado no início da requisição e gravado ao final. */
interface Tx {
  db: Db;
  commit(dirty: boolean): Promise<void>;
  rollback(): Promise<void>;
}

export interface Backend {
  begin(write: boolean, seed: () => Db): Promise<Tx>;
  /** Estado compartilhado em memória (somente backends locais). */
  shared?: () => Db;
}

/** Migração de estados gravados por versões anteriores. */
export function migrate(db: Db): Db {
  db.users ??= [];
  db.sessions ??= [];
  db.seq.user ??= db.users.length;
  for (const a of db.arenas) {
    a.mix ??= a.basket.concat(a.unavailable.map((u) => ({ productId: u.productId, quantity: u.quantity })));
    a.title ??= "Mix padrão";
  }
  return db;
}

/** Memória, opcionalmente espelhada em arquivo JSON (desenvolvimento, testes e servidor único). */
export class FileBackend implements Backend {
  private mem: Db | null = null;
  constructor(private file: string | null, private seed: () => Db) {}
  shared = () => (this.mem ??= this.file && fs.existsSync(this.file) ? migrate(JSON.parse(fs.readFileSync(this.file, "utf8"))) : this.seed());
  async begin(): Promise<Tx> {
    const db = this.shared();
    return {
      db,
      commit: async (dirty) => {
        if (!dirty || !this.file) return;
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
        fs.renameSync(tmp, this.file);
      },
      rollback: async () => {},
    };
  }
  replace(db: Db) {
    this.mem = db;
  }
}

/**
 * Postgres (ex.: Supabase). O estado fica numa linha JSONB; escritas usam SELECT … FOR UPDATE,
 * então requisições concorrentes — inclusive em instâncias serverless diferentes — são serializadas.
 */
export class PostgresBackend implements Backend {
  private pool: pg.Pool;
  private ready: Promise<void> | null = null;
  constructor(connectionString: string) {
    const url = new URL(connectionString);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    url.searchParams.delete("sslmode");
    this.pool = new pg.Pool({
      connectionString: url.toString(),
      // Supabase exige TLS; a cadeia do pooler não está no repositório de CAs do Node.
      ssl: local || process.env.MIXCERTO_DB_SSL === "disable" ? false : { rejectUnauthorized: process.env.MIXCERTO_DB_SSL === "verify" },
      max: Number(process.env.MIXCERTO_DB_POOL ?? 3),
      idleTimeoutMillis: 10_000,
    });
  }
  private schema() {
    return (this.ready ??= this.pool
      .query(`CREATE TABLE IF NOT EXISTS mixcerto_state (
        id integer PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`)
      .then(() => undefined)
      .catch((e) => {
        this.ready = null;
        throw e;
      }));
  }
  async begin(write: boolean, seed: () => Db): Promise<Tx> {
    await this.schema();
    const client = await this.pool.connect();
    let open = false;
    try {
      const select = `SELECT data FROM mixcerto_state WHERE id = 1${write ? " FOR UPDATE" : ""}`;
      if (write) {
        await client.query("BEGIN");
        open = true;
      }
      let row = (await client.query(select)).rows[0];
      if (!row) {
        await client.query("INSERT INTO mixcerto_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING", [JSON.stringify(seed())]);
        row = (await client.query(select)).rows[0];
      }
      const db = migrate(row.data as Db);
      let done = false;
      const finish = async (sql: string | null, dirty: boolean) => {
        if (done) return;
        done = true;
        try {
          if (write) {
            if (sql === "COMMIT" && dirty) await client.query("UPDATE mixcerto_state SET data = $1, updated_at = now() WHERE id = 1", [JSON.stringify(db)]);
            await client.query(sql ?? "ROLLBACK");
          }
        } finally {
          client.release();
        }
      };
      return { db, commit: (dirty) => finish("COMMIT", dirty), rollback: () => finish(null, false) };
    } catch (e) {
      if (open) await client.query("ROLLBACK").catch(() => {});
      client.release();
      throw e;
    }
  }
  end() {
    return this.pool.end();
  }
}

interface Ctx {
  db: Db;
  dirty: boolean;
}

/**
 * Acesso ao estado. Dentro de uma requisição (ou de `run`) `store.db` é o estado daquela transação;
 * `save()` marca para gravar ao final. Fora disso, só o backend local expõe o estado compartilhado.
 */
export class Store {
  private als = new AsyncLocalStorage<Ctx>();
  private backend: Backend;
  /** Executado uma vez por instância antes da primeira requisição (ex.: administrador inicial). */
  onFirstRequest: ((store: Store) => void) | null = null;
  private warmed: Promise<void> | null = null;

  constructor(backend: string | null | Backend, private clock: () => string = () => new Date().toISOString()) {
    this.backend = typeof backend === "object" && backend !== null ? backend : new FileBackend(backend, () => this.seed());
  }

  static fromEnv(defaultFile: string | null) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    return new Store(url ? new PostgresBackend(url) : (process.env.MIXCERTO_DB ?? defaultFile));
  }

  now() {
    return this.clock();
  }
  private seed() {
    return newDb(seedCatalog(this.now().slice(0, 10)));
  }

  get db(): Db {
    const ctx = this.als.getStore();
    if (ctx) return ctx.db;
    if (this.backend.shared) return this.backend.shared();
    throw new Error("store.db acessado fora de uma transação");
  }
  set db(v: Db) {
    const ctx = this.als.getStore();
    if (ctx) ctx.db = v;
    else if (this.backend instanceof FileBackend) this.backend.replace(v);
  }

  save() {
    const ctx = this.als.getStore();
    if (ctx) ctx.dirty = true;
    else if (this.backend instanceof FileBackend) void this.backend.begin().then((tx) => tx.commit(true));
  }

  /** Executa `fn` numa transação própria (uso fora do ciclo HTTP: bootstrap, scripts). */
  async run<T>(write: boolean, fn: () => T | Promise<T>): Promise<T> {
    const tx = await this.backend.begin(write, () => this.seed());
    const ctx: Ctx = { db: tx.db, dirty: false };
    try {
      const out = await this.als.run(ctx, fn);
      await this.commit(tx, ctx, write);
      return out;
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  private commit(tx: Tx, ctx: Ctx, write: boolean) {
    // Reset troca o objeto inteiro: copia o novo estado para o objeto da transação.
    if (tx.db !== ctx.db) Object.assign(tx.db, ctx.db);
    return tx.commit(write && ctx.dirty);
  }

  /** Middleware: abre a transação da requisição e grava antes de enviar a resposta. */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (this.onFirstRequest) {
          const hook = this.onFirstRequest;
          await (this.warmed ??= this.run(true, () => hook(this)).catch((e) => {
            this.warmed = null;
            throw e;
          }));
        }
        const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
        const tx = await this.backend.begin(write, () => this.seed());
        const ctx: Ctx = { db: tx.db, dirty: false };
        let finished = false;
        const send = res.json.bind(res);
        res.json = (body: unknown) => {
          if (finished) return send(body);
          finished = true;
          const done = res.statusCode >= 500 ? tx.rollback() : this.commit(tx, ctx, write);
          done.then(
            () => send(body),
            (e) => {
              console.error(e);
              res.status(503);
              send({ error: "Falha ao gravar os dados. Tente novamente.", code: "STORAGE" });
            },
          );
          return res;
        };
        res.on("close", () => {
          if (!finished) {
            finished = true;
            void tx.rollback();
          }
        });
        this.als.run(ctx, () => next());
      } catch (e) {
        console.error(e);
        res.status(503).json({ error: "Banco de dados indisponível.", code: "STORAGE" });
      }
    };
  }

  /** Restaura a demonstração preservando usuários e sessões. */
  reset() {
    const { users, sessions, seq } = this.db;
    const fresh = this.seed();
    Object.assign(fresh, { users, sessions });
    fresh.seq.user = seq.user;
    this.db = fresh;
    this.save();
  }
}

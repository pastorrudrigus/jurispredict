import fs from "node:fs";
import path from "node:path";
import { newDb, type Db } from "./domain/competition";
import { seedCatalog } from "./seed";

/** Persistência simples em JSON (demonstração). `file = null` mantém tudo em memória. */
export class Store {
  db: Db;
  constructor(private file: string | null, private clock: () => string = () => new Date().toISOString()) {
    this.db = this.load();
  }
  now() {
    return this.clock();
  }
  private load(): Db {
    if (this.file && fs.existsSync(this.file)) {
      const db = JSON.parse(fs.readFileSync(this.file, "utf8")) as Db;
      // Migração de arquivos anteriores ao controle de acesso.
      db.users ??= [];
      db.sessions ??= [];
      db.seq.user ??= db.users.length;
      for (const a of db.arenas) {
        a.mix ??= a.basket.concat(a.unavailable.map((u) => ({ productId: u.productId, quantity: u.quantity })));
        a.title ??= "Mix padrão";
      }
      return db;
    }
    return newDb(seedCatalog(this.now().slice(0, 10)));
  }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }
  /** Restaura a demonstração preservando usuários e sessões. */
  reset() {
    const { users, sessions, seq } = this.db;
    this.db = newDb(seedCatalog(this.now().slice(0, 10)));
    Object.assign(this.db, { users, sessions });
    this.db.seq.user = seq.user;
    this.save();
  }
}

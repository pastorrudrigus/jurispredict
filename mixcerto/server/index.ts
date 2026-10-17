import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { ensureBootstrapAdmin } from "./auth";
import { Store } from "./store";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = new Store(process.env.MIXCERTO_DB ?? path.join(root, "data", "db.json"));
ensureBootstrapAdmin(store);
const port = Number(process.env.PORT ?? 3001);
const staticDir = process.env.NODE_ENV === "production" ? path.join(root, "client", "dist") : undefined;

createApp(store, staticDir).listen(port, () => console.log(`MixCerto API em http://localhost:${port}`));

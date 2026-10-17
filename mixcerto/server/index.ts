import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { ensureBootstrapAdmin } from "./auth.js";
import { Store } from "./store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = Store.fromEnv(path.join(root, "data", "db.json"));
await store.run(true, () => ensureBootstrapAdmin(store));
const port = Number(process.env.PORT ?? 3001);
const staticDir = process.env.NODE_ENV === "production" ? path.join(root, "client", "dist") : undefined;

createApp(store, staticDir).listen(port, () => console.log(`MixCerto API em http://localhost:${port}`));

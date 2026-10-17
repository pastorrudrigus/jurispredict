// Função serverless da Vercel: toda a API (/api/*) roda neste app Express.
// Estado no Postgres de DATABASE_URL (Supabase); sem ela, memória efêmera (apenas para teste).
import { createApp } from "../server/app.js";
import { ensureBootstrapAdmin } from "../server/auth.js";
import { Store } from "../server/store.js";

const store = Store.fromEnv(null);
store.onFirstRequest = (s) => ensureBootstrapAdmin(s);

export default createApp(store);

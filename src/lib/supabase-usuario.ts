import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function envPublicas() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ou _PUBLISHABLE_KEY) precisam estar definidas.",
    );
  }
  return { url, anon };
}

/**
 * Client ligado à SESSÃO DO USUÁRIO (anon key). Toda leitura do app passa por
 * aqui — é o que faz o RLS valer. A service_role (`db()` em supabase.ts) ignora
 * RLS e só pode ser usada em caminhos que já chamaram `exigirAdmin()`.
 */
export function dbUsuario(): SupabaseClient {
  const { url, anon } = envPublicas();
  const jar = cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(paraGravar) {
        try {
          for (const { name, value, options } of paraGravar) {
            jar.set(name, value, options);
          }
        } catch {
          // Server Components não podem gravar cookies. O middleware já
          // renova a sessão a cada request, então ignorar aqui é seguro.
        }
      },
    },
  });
}

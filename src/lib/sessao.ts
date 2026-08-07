import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { dbUsuario } from "./supabase-usuario";
import type { Perfil } from "./types";

export type Sessao = {
  userId: string;
  email: string | null;
  perfil: Perfil | null;
};

/**
 * Sessão atual + perfil. `cache` deduplica a chamada dentro de um mesmo render.
 * Usa getUser() (valida o JWT no servidor) e não getSession(), que só lê o
 * cookie e é falsificável.
 */
export const sessaoAtual = cache(async (): Promise<Sessao | null> => {
  const sb = dbUsuario();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await sb
    .from("perfis")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { userId: user.id, email: user.email ?? null, perfil: (perfil as Perfil) ?? null };
});

export function ehAdmin(sessao: Sessao | null): boolean {
  return sessao?.perfil?.papel === "admin" && sessao.perfil.status_acesso === "ativo";
}

export function temAcesso(sessao: Sessao | null): boolean {
  return sessao?.perfil?.status_acesso === "ativo";
}

/** Exige sessão com acesso liberado. Redireciona quem não tem. */
export async function exigirAcesso(): Promise<Sessao> {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/entrar");
  if (!temAcesso(sessao)) redirect("/aguardando");
  return sessao;
}

/**
 * Exige admin. Chamar no TOPO de toda página e de toda server action de
 * escrita — a UI esconder o botão não é autorização.
 */
export async function exigirAdmin(): Promise<Sessao> {
  const sessao = await exigirAcesso();
  if (!ehAdmin(sessao)) redirect("/");
  return sessao;
}

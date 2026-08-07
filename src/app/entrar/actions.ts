"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { dbUsuario } from "@/lib/supabase-usuario";

export type AuthEstado = { erro?: string; aviso?: string };

/** Só aceita caminho interno — evita open redirect no `?next=`. */
function destinoSeguro(bruto: unknown): string {
  const s = typeof bruto === "string" ? bruto : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function entrar(
  _anterior: AuthEstado | null,
  form: FormData,
): Promise<AuthEstado> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  const destino = destinoSeguro(form.get("next"));

  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const { error } = await dbUsuario().auth.signInWithPassword({ email, password: senha });

  if (error) {
    // Não distinguimos "e-mail não existe" de "senha errada": isso viraria um
    // oráculo para descobrir quem tem conta.
    return { erro: "E-mail ou senha incorretos." };
  }

  revalidatePath("/", "layout");
  redirect(destino);
}

export async function cadastrar(
  _anterior: AuthEstado | null,
  form: FormData,
): Promise<AuthEstado> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  const nome = String(form.get("nome") ?? "").trim();
  const telefone = String(form.get("telefone") ?? "").replace(/\D/g, "");
  const creci = String(form.get("creci") ?? "").trim();

  if (!nome) return { erro: "Informe seu nome." };
  if (!email) return { erro: "Informe seu e-mail." };
  if (senha.length < 8) return { erro: "A senha precisa ter ao menos 8 caracteres." };

  const { data, error } = await dbUsuario().auth.signUp({
    email,
    password: senha,
    options: { data: { nome, telefone, creci } },
  });

  if (error) return { erro: error.message };

  // Com confirmação de e-mail ligada no Supabase, não vem sessão na hora.
  if (!data.session) {
    return {
      aviso:
        "Conta criada. Confirme o e-mail que enviamos e depois faça login — seu acesso ainda passa por aprovação.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/aguardando");
}

export async function sair(): Promise<void> {
  await dbUsuario().auth.signOut();
  revalidatePath("/", "layout");
  redirect("/entrar");
}

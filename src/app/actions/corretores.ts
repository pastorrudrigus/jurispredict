"use server";

import { revalidatePath } from "next/cache";
import { dbUsuario } from "@/lib/supabase-usuario";
import { exigirAdmin } from "@/lib/sessao";
import { PAPEIS, STATUS_ACESSO, type Perfil } from "@/lib/types";

export async function listarPerfis(): Promise<Perfil[]> {
  await exigirAdmin();
  const { data, error } = await dbUsuario()
    .from("perfis")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Perfil[];
}

export async function definirAcesso(id: string, status: string): Promise<void> {
  await exigirAdmin();
  if (!(STATUS_ACESSO as readonly string[]).includes(status)) {
    throw new Error(`Status de acesso inválido: ${status}`);
  }
  const { error } = await dbUsuario()
    .from("perfis")
    .update({ status_acesso: status })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/corretores");
}

export async function definirPapel(id: string, papel: string): Promise<void> {
  const sessao = await exigirAdmin();
  if (!(PAPEIS as readonly string[]).includes(papel)) {
    throw new Error(`Papel inválido: ${papel}`);
  }
  // Um admin rebaixando a si mesmo deixaria o painel sem operador.
  if (id === sessao.userId && papel !== "admin") {
    throw new Error("Você não pode remover o próprio acesso de admin.");
  }
  const { error } = await dbUsuario().from("perfis").update({ papel }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/corretores");
}

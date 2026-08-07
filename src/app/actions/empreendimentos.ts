"use server";

import { revalidatePath } from "next/cache";
import { dbUsuario } from "@/lib/supabase-usuario";
import { exigirAcesso, exigirAdmin } from "@/lib/sessao";
import type { Empreendimento } from "@/lib/types";

export async function listarEmpreendimentos(): Promise<Empreendimento[]> {
  await exigirAcesso();
  const { data, error } = await dbUsuario()
    .from("empreendimentos")
    .select("*")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as Empreendimento[];
}

function limpar(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function inteiro(v: FormDataEntryValue | null): number | null {
  const s = limpar(v);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function campos(form: FormData) {
  return {
    nome: limpar(form.get("nome")),
    construtora: limpar(form.get("construtora")),
    bairro: limpar(form.get("bairro")),
    cidade: limpar(form.get("cidade")) ?? "Goiânia",
    data_entrega_prevista: limpar(form.get("data_entrega_prevista")),
    fase_obra: limpar(form.get("fase_obra")),
    total_unidades: inteiro(form.get("total_unidades")),
    financiamento_proprio: form.get("financiamento_proprio") === "on",
    fonte: limpar(form.get("fonte")),
  };
}

export type EmpreendimentoResultado = { ok: boolean; erro?: string };

export async function salvarEmpreendimento(
  _estadoAnterior: EmpreendimentoResultado | null,
  form: FormData,
): Promise<EmpreendimentoResultado> {
  await exigirAdmin();

  const id = limpar(form.get("id"));
  const dados = campos(form);

  if (!dados.nome) return { ok: false, erro: "Nome é obrigatório." };

  const sb = dbUsuario();
  const { error } = id
    ? await sb.from("empreendimentos").update(dados).eq("id", id)
    : await sb.from("empreendimentos").insert(dados);

  if (error) return { ok: false, erro: error.message };

  revalidatePath("/empreendimentos");
  return { ok: true };
}

export async function excluirEmpreendimento(id: string): Promise<void> {
  await exigirAdmin();
  const { error } = await dbUsuario().from("empreendimentos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/empreendimentos");
}

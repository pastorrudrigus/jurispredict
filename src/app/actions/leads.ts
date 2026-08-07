"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { STATUS, type Lead } from "@/lib/types";

const SELECT =
  "*, empreendimentos(id, nome, construtora, bairro, data_entrega_prevista)";

export type FiltroLeads = {
  bairro?: string;
  status?: string;
  urgenciaMinima?: number;
  busca?: string;
  incluirInvalidos?: boolean;
  limite?: number;
};

export async function listarLeads(filtro: FiltroLeads = {}): Promise<Lead[]> {
  let q = db()
    .from("anuncios_repasse")
    .select(SELECT)
    .order("score_urgencia", { ascending: false, nullsFirst: false })
    .order("criado_em", { ascending: false })
    .limit(filtro.limite ?? 300);

  if (filtro.status) {
    q = q.eq("status", filtro.status);
  } else if (!filtro.incluirInvalidos) {
    q = q.neq("status", "invalido");
  }

  if (filtro.bairro) q = q.ilike("bairro", `%${filtro.bairro}%`);
  if (filtro.urgenciaMinima) q = q.gte("score_urgencia", filtro.urgenciaMinima);
  if (filtro.busca) {
    const t = filtro.busca.replace(/[%,]/g, " ");
    q = q.or(
      `texto_bruto.ilike.%${t}%,empreendimento_texto.ilike.%${t}%,bairro.ilike.%${t}%,nome_contato.ilike.%${t}%`,
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

export async function leadsPorIds(ids: string[]): Promise<Lead[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db()
    .from("anuncios_repasse")
    .select(SELECT)
    .in("id", ids)
    .order("score_urgencia", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

export async function atualizarStatus(id: string, status: string): Promise<void> {
  if (!(STATUS as readonly string[]).includes(status)) {
    throw new Error(`Status inválido: ${status}`);
  }
  const { error } = await db()
    .from("anuncios_repasse")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/lista");
}

export async function marcarDistribuidos(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await db()
    .from("anuncios_repasse")
    .update({ status: "distribuido" }, { count: "exact" })
    .in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/lista");
  return count ?? ids.length;
}

export type Contadores = {
  total: number;
  novosHoje: number;
  urgentes: number;
};

export async function contadores(): Promise<Contadores> {
  const base = () =>
    db()
      .from("anuncios_repasse")
      .select("*", { count: "exact", head: true })
      .neq("status", "invalido");

  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const [total, hoje, urgentes] = await Promise.all([
    base(),
    base().gte("criado_em", inicioDoDia.toISOString()),
    base().gte("score_urgencia", 61),
  ]);

  return {
    total: total.count ?? 0,
    novosHoje: hoje.count ?? 0,
    urgentes: urgentes.count ?? 0,
  };
}

/** Bairros distintos já capturados, para popular o filtro. */
export async function bairrosDisponiveis(): Promise<string[]> {
  const { data, error } = await db()
    .from("anuncios_repasse")
    .select("bairro")
    .neq("status", "invalido")
    .not("bairro", "is", null)
    .limit(1000);
  if (error) return [];
  const set = new Set<string>();
  for (const linha of data ?? []) {
    const b = (linha as { bairro: string | null }).bairro;
    if (b) set.add(b.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** P1 — contagem de sinais judiciais coletados do DataJud. */
export async function totalSinaisJudiciais(): Promise<number | null> {
  const { count, error } = await db()
    .from("sinais_judiciais")
    .select("*", { count: "exact", head: true })
    .gte("data_ajuizamento", "2023-01-01");
  if (error) return null;
  return count ?? 0;
}

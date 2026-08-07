"use server";

import { dbUsuario } from "@/lib/supabase-usuario";
import { exigirAdmin } from "@/lib/sessao";

export type ContagemCategoria = { categoria: string; comarca: string | null; total: number };
export type LeadJudicialLinha = {
  id: string;
  tipo_oportunidade: string | null;
  pessoa_alvo: string | null;
  score_oportunidade: number | null;
  resumo: string | null;
  proximo_passo: string | null;
  status: string;
  criado_em: string;
  empreendimento_id: string | null;
};

export type PanoramaJudicial = {
  totalSinais: number;
  pendentesEnriquecimento: number;
  sigilosos: number;
  porCategoria: ContagemCategoria[];
  filaCaptacao: LeadJudicialLinha[];
  leiloes: LeadJudicialLinha[];
  unidadesVoltandoEstoque: LeadJudicialLinha[];
  cruzamentos: number;
};

/**
 * Panorama do Radar Judicial. Admin-only: `leads_judiciais` e
 * `partes_processo` carregam nome de pessoa física em execução, inventário e
 * busca e apreensão — o RLS já barra o corretor, isto aqui é o segundo portão.
 */
export async function panoramaJudicial(): Promise<PanoramaJudicial> {
  await exigirAdmin();
  const sb = dbUsuario();

  const contar = (filtro: (q: ReturnType<typeof base>) => unknown) => filtro;
  const base = () =>
    sb.from("sinais_judiciais").select("*", { count: "exact", head: true });
  void contar;

  const [total, pendentes, sigilosos, categorias, fila, leiloes, estoque, cruz] =
    await Promise.all([
      base(),
      base().eq("status_enriquecimento", "pendente"),
      base().eq("sigiloso", true),
      sb.from("sinais_judiciais").select("categoria, comarca").limit(5000),
      sb
        .from("leads_judiciais")
        .select("*")
        .in("tipo_oportunidade", ["vendedor_pressionado", "herdeiros_vendendo"])
        .eq("status", "novo")
        .order("score_oportunidade", { ascending: false })
        .limit(100),
      sb
        .from("leads_judiciais")
        .select("*")
        .eq("tipo_oportunidade", "leilao_agendado")
        .order("criado_em", { ascending: false })
        .limit(100),
      sb
        .from("leads_judiciais")
        .select("*")
        .eq("tipo_oportunidade", "unidade_voltando_estoque")
        .order("score_oportunidade", { ascending: false })
        .limit(100),
      sb.rpc("cruzar_anuncios_com_judiciais"),
    ]);

  // Agregação por categoria/comarca no app: o PostgREST não faz group by.
  const mapa = new Map<string, ContagemCategoria>();
  for (const linha of (categorias.data ?? []) as Array<{
    categoria: string | null;
    comarca: string | null;
  }>) {
    const chave = `${linha.categoria ?? "—"}|${linha.comarca ?? "—"}`;
    const atual = mapa.get(chave);
    if (atual) atual.total++;
    else
      mapa.set(chave, {
        categoria: linha.categoria ?? "—",
        comarca: linha.comarca,
        total: 1,
      });
  }

  return {
    totalSinais: total.count ?? 0,
    pendentesEnriquecimento: pendentes.count ?? 0,
    sigilosos: sigilosos.count ?? 0,
    porCategoria: Array.from(mapa.values()).sort((a, b) => b.total - a.total),
    filaCaptacao: (fila.data ?? []) as LeadJudicialLinha[],
    leiloes: (leiloes.data ?? []) as LeadJudicialLinha[],
    unidadesVoltandoEstoque: (estoque.data ?? []) as LeadJudicialLinha[],
    cruzamentos: Array.isArray(cruz.data) ? cruz.data.length : 0,
  };
}

export type LinhaEntrega = {
  id: string;
  nome: string;
  construtora: string | null;
  bairro: string | null;
  data_entrega_prevista: string | null;
  meses_ate_entrega: number | null;
  na_janela_critica: boolean;
  anuncios: number;
  anuncios_classe_a: number;
};

/**
 * Linha do tempo de entregas — o mapa da onda. Mostra ONDE a pressão vendedora
 * vai estourar nos próximos meses, para posicionar corretores antes.
 */
export async function linhaDoTempoEntregas(): Promise<LinhaEntrega[]> {
  await exigirAdmin();
  const sb = dbUsuario();

  const [emps, anuncios] = await Promise.all([
    sb
      .from("empreendimentos_janela")
      .select(
        "id, nome, construtora, bairro, data_entrega_prevista, meses_ate_entrega, na_janela_critica",
      )
      .not("data_entrega_prevista", "is", null)
      .order("data_entrega_prevista"),
    sb
      .from("anuncios_repasse")
      .select("empreendimento_id, anunciante_tipo, score_urgencia")
      .not("empreendimento_id", "is", null)
      .neq("status", "invalido")
      .limit(5000),
  ]);

  const porEmp = new Map<string, { total: number; classeA: number }>();
  for (const a of (anuncios.data ?? []) as Array<{
    empreendimento_id: string;
    anunciante_tipo: string | null;
    score_urgencia: number | null;
  }>) {
    const atual = porEmp.get(a.empreendimento_id) ?? { total: 0, classeA: 0 };
    atual.total++;
    if (a.anunciante_tipo === "proprietario" && (a.score_urgencia ?? 0) >= 40) {
      atual.classeA++;
    }
    porEmp.set(a.empreendimento_id, atual);
  }

  return ((emps.data ?? []) as Array<Omit<LinhaEntrega, "anuncios" | "anuncios_classe_a">>).map(
    (e) => ({
      ...e,
      anuncios: porEmp.get(e.id)?.total ?? 0,
      anuncios_classe_a: porEmp.get(e.id)?.classeA ?? 0,
    }),
  );
}

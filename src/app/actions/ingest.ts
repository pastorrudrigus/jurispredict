"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/sessao";
import { MODELO_EXTRACAO, extrairAnuncio } from "@/lib/anthropic";
import { FONTES, type Fonte, type Lead, type ResultadoItem } from "@/lib/types";

const SIM_MINIMA = 0.35;

function hashDedup(fonte: string, texto: string): string {
  const normalizado = texto.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("md5").update(`${fonte}${normalizado}`).digest("hex");
}

async function matchEmpreendimento(
  busca: string | null,
): Promise<{ id: string; nome: string; sim: number } | null> {
  if (!busca || busca.trim().length < 3) return null;
  const { data, error } = await db().rpc("match_empreendimento", { busca });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const linha = data[0] as { id: string; nome: string; sim: number };
  if (typeof linha.sim !== "number" || linha.sim < SIM_MINIMA) return null;
  return linha;
}

export type LoteInput = {
  fonte: string;
  urlOriginal?: string | null;
  textos: string[];
  offsetIndice?: number;
};

/**
 * Processa um lote de anúncios sequencialmente. Cada item é isolado: erro de
 * IA, de JSON ou de banco marca só aquele item e o lote continua.
 */
export async function ingerirLote(input: LoteInput): Promise<ResultadoItem[]> {
  // Só o operador ingere. A partir daqui usamos service_role (que ignora RLS)
  // — este gate é o que autoriza esse uso.
  await exigirAdmin();

  const fonte: Fonte = (FONTES as readonly string[]).includes(input.fonte)
    ? (input.fonte as Fonte)
    : "outro";
  const url = input.urlOriginal?.trim() || null;
  const offset = input.offsetIndice ?? 0;
  const resultados: ResultadoItem[] = [];

  for (let i = 0; i < input.textos.length; i++) {
    const texto = input.textos[i].trim();
    const indice = offset + i;
    const trecho = texto.slice(0, 140);

    if (!texto) continue;

    try {
      const hash = hashDedup(fonte, texto);

      // 1. dedup
      const { data: existente } = await db()
        .from("anuncios_repasse")
        .select("id")
        .eq("hash_dedup", hash)
        .maybeSingle();

      if (existente) {
        resultados.push({ indice, trecho, situacao: "duplicado" });
        continue;
      }

      // 2. extração via IA
      const extraido = await extrairAnuncio(texto);

      // 3. fuzzy match do empreendimento
      const match = await matchEmpreendimento(extraido.empreendimento_texto);

      // 4. insert (inclusive dos não-repasse, para auditoria)
      const { data: inserido, error } = await db()
        .from("anuncios_repasse")
        .insert({
          fonte,
          url_original: url,
          hash_dedup: hash,
          texto_bruto: texto,
          empreendimento_id: match?.id ?? null,
          empreendimento_texto: extraido.empreendimento_texto,
          bairro: extraido.bairro,
          tipologia: extraido.tipologia,
          area_m2: extraido.area_m2,
          valor_pago: extraido.valor_pago,
          valor_pedido: extraido.valor_pedido,
          saldo_devedor: extraido.saldo_devedor,
          fase_obra_mencionada: extraido.fase_obra_mencionada,
          telefone_contato: extraido.telefone_contato,
          nome_contato: extraido.nome_contato,
          score_urgencia: extraido.score_urgencia,
          sinais_urgencia: extraido.sinais_urgencia,
          status: extraido.eh_repasse ? "novo" : "invalido",
          extraido_em: new Date().toISOString(),
          modelo_extracao: MODELO_EXTRACAO,
        })
        .select(
          "*, empreendimentos(id, nome, construtora, bairro, data_entrega_prevista)",
        )
        .single();

      if (error) throw new Error(error.message);

      resultados.push({
        indice,
        trecho,
        situacao: extraido.eh_repasse ? "novo" : "nao_repasse",
        lead: inserido as Lead,
        empreendimento_match: match ? { nome: match.nome, sim: match.sim } : null,
      });
    } catch (e) {
      resultados.push({
        indice,
        trecho,
        situacao: "erro",
        mensagem: e instanceof Error ? e.message : String(e),
      });
    }
  }

  revalidatePath("/");
  return resultados;
}

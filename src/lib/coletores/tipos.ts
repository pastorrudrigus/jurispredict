import type { Fonte } from "../types";

/** Um anúncio candidato, já isolado da conversa mas ainda sem passar pela IA. */
export type AnuncioBruto = {
  texto: string;
  fonte: Fonte;
  autor: string | null;
  enviadoEm: string | null;
  urlOriginal: string | null;
};

export type MotivoDescarte =
  | "mensagem_de_sistema"
  | "midia_sem_texto"
  | "apagada"
  | "curta_demais"
  | "sem_sinal_de_repasse"
  | "duplicada_no_lote";

export type ResultadoColeta = {
  candidatos: AnuncioBruto[];
  /** Quantas mensagens caíram fora e por quê — é o que mostra se o filtro
   *  está apertado demais antes de você gastar token de IA. */
  descartes: Record<MotivoDescarte, number>;
  totalMensagens: number;
};

export function descartesZerados(): Record<MotivoDescarte, number> {
  return {
    mensagem_de_sistema: 0,
    midia_sem_texto: 0,
    apagada: 0,
    curta_demais: 0,
    sem_sinal_de_repasse: 0,
    duplicada_no_lote: 0,
  };
}

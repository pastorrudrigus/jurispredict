/**
 * Tipos do motor Crivo. As features espelham credito.features_mensais (Seção 3.1
 * da spec) mais os insumos externos consultados na hora da decisão (Receita,
 * restritivos do Ábaco).
 */

export interface FeaturesCliente {
  // relacionamento
  mesesRelacionamento: number;
  qtdPedidos12m: number;
  regularidade: number; // % de meses com compra nos últimos 12 (0-1)
  recenciaDias: number;

  // volume
  faturamento12m: number;
  faturamentoMedio3m: number;
  tendenciaVolume: number; // fat médio 3m / fat médio 12m
  ticketMedio: number;

  // pontualidade
  pctPagoEmDia: number; // 0-1
  atrasoMedioDias: number;
  piorAtraso12m: number;
  qtdRenegociacoes6m: number;

  // situação atual
  valorEmAberto: number;
  valorVencido: number;
  dpdAtual: number;

  // bureau Ábaco
  scoreAbaco: number | null; // 0-1000; null = sem consulta
  restritivoGrave: boolean; // protesto, execução fiscal relevante
  qtdRestritivosLeves: number;

  // cadastro
  cnpjAtivo: boolean; // situação cadastral na Receita
  segmento?: string;
  ticketMedioVsMedianaSegmento?: number; // razão; undefined = sem base de comparação
}

export type Decisao = "aprovado" | "negado" | "manual" | "suspenso";
export type Rating = "A" | "B" | "C" | "D" | "E";

export interface Knockout {
  regra: string;
  acao: "negar" | "manual" | "suspender";
  detalhe: string;
}

export interface BlocoScore {
  bloco: string;
  peso: number;
  pontos: number; // 0-100 dentro do bloco
  variaveis: Record<string, number>;
}

export interface ResultadoCrivo {
  decisao: Decisao;
  knockouts: Knockout[];
  score: number; // 0-1000
  rating: Rating;
  blocos: BlocoScore[];
  limiteCalculado: number;
  limiteAprovado: number;
  prazoMaximoDias: number;
  validadeDias: number;
  versaoPolitica: string;
  payloadFeatures: FeaturesCliente;
}

export interface ParametrosCarteira {
  /** Teto absoluto por cliente no MVP (Seção 4, Camada 3). */
  tetoAbsoluto?: number;
  /** Exposição total atual da carteira — habilita o cap de concentração de 5%. */
  exposicaoCarteiraTotal?: number;
}

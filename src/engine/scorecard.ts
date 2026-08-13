/**
 * Camada 2 — Score comportamental (0–1000). Seção 4 da spec.
 *
 * Scorecard de pontos por regra de negócio (não estatístico — modelo estatístico
 * só na Fase 2, com ≥ ~300 desfechos observados).
 *
 * ATENÇÃO CALIBRAGEM: as faixas abaixo são valores de PARTIDA derivados da spec
 * v1.0. Devem ser recalibradas na análise exploratória da base real (Sprint 2,
 * modo shadow) antes de valer de verdade. Toda mudança de faixa/peso gera nova
 * versao_politica.
 */

import type { BlocoScore, FeaturesCliente, Rating } from "./types.js";

type Faixa = [limite: number, pontos: number];

/** Pontua por faixas descendentes: primeiro limite satisfeito (valor >= limite) vence. */
function porFaixaDesc(valor: number, faixas: Faixa[], senao = 0): number {
  for (const [lim, pts] of faixas) if (valor >= lim) return pts;
  return senao;
}

/** Pontua por faixas ascendentes: primeiro limite satisfeito (valor <= limite) vence. */
function porFaixaAsc(valor: number, faixas: Faixa[], senao = 0): number {
  for (const [lim, pts] of faixas) if (valor <= lim) return pts;
  return senao;
}

function mediaPonderada(vs: Array<[pontos: number, peso: number]>): number {
  const somaPesos = vs.reduce((a, [, p]) => a + p, 0);
  return vs.reduce((a, [pts, p]) => a + pts * p, 0) / somaPesos;
}

export function calcularBlocos(f: FeaturesCliente): BlocoScore[] {
  // ---- Pontualidade (35%) ----
  const pctPago = porFaixaDesc(f.pctPagoEmDia, [
    [0.98, 100],
    [0.9, 70],
    [0.8, 40],
  ]);
  const atrasoMedio = porFaixaAsc(f.atrasoMedioDias, [
    [1, 100],
    [3, 80],
    [7, 50],
    [15, 20],
  ]);
  const piorAtraso = porFaixaAsc(f.piorAtraso12m, [
    [0, 100],
    [5, 85],
    [15, 60],
    [30, 25],
  ]);

  // ---- Relacionamento (20%) ----
  const meses = porFaixaDesc(f.mesesRelacionamento, [
    [36, 100],
    [24, 85],
    [12, 65],
    [6, 40],
  ], 10);
  const regularidade = porFaixaDesc(f.regularidade, [
    [0.9, 100],
    [0.75, 75],
    [0.5, 45],
  ], 15);
  const recencia = porFaixaAsc(f.recenciaDias, [
    [15, 100],
    [30, 80],
    [60, 50],
    [90, 20],
  ]);

  // ---- Volume e tendência (20%) ----
  const faturamento = porFaixaDesc(f.faturamento12m, [
    [600_000, 100],
    [300_000, 80],
    [120_000, 60],
    [50_000, 40],
  ], 20);
  const tendencia = porFaixaDesc(f.tendenciaVolume, [
    [1.15, 100],
    [1.0, 80],
    [0.85, 55],
    [0.6, 25],
  ]);

  // ---- Bureau Ábaco (20%) ----
  // score_abaco em 0-1000 normalizado para 0-100; sem consulta = neutro 50
  const abaco = f.scoreAbaco === null ? 50 : Math.max(0, Math.min(100, f.scoreAbaco / 10));
  const restritivosLeves = porFaixaAsc(f.qtdRestritivosLeves, [
    [0, 100],
    [1, 60],
    [2, 30],
  ]);

  // ---- Concentração/perfil (5%) ----
  // ticket médio vs mediana do segmento: dentro de 0.5x–2x é perfil típico
  const ratio = f.ticketMedioVsMedianaSegmento;
  const perfil = ratio === undefined ? 70 : ratio >= 0.5 && ratio <= 2.0 ? 100 : 60;

  return [
    {
      bloco: "pontualidade",
      peso: 0.35,
      pontos: mediaPonderada([[pctPago, 0.5], [atrasoMedio, 0.25], [piorAtraso, 0.25]]),
      variaveis: { pctPagoEmDia: pctPago, atrasoMedioDias: atrasoMedio, piorAtraso12m: piorAtraso },
    },
    {
      bloco: "relacionamento",
      peso: 0.2,
      pontos: mediaPonderada([[meses, 0.4], [regularidade, 0.4], [recencia, 0.2]]),
      variaveis: { mesesRelacionamento: meses, regularidade, recenciaDias: recencia },
    },
    {
      bloco: "volume_tendencia",
      peso: 0.2,
      pontos: mediaPonderada([[faturamento, 0.5], [tendencia, 0.5]]),
      variaveis: { faturamento12m: faturamento, tendenciaVolume: tendencia },
    },
    {
      bloco: "bureau_abaco",
      peso: 0.2,
      pontos: mediaPonderada([[abaco, 0.8], [restritivosLeves, 0.2]]),
      variaveis: { scoreAbaco: abaco, restritivosLeves },
    },
    {
      bloco: "perfil",
      peso: 0.05,
      pontos: perfil,
      variaveis: { ticketVsMedianaSegmento: perfil },
    },
  ];
}

export function calcularScore(blocos: BlocoScore[]): number {
  const total = blocos.reduce((acc, b) => acc + b.pontos * b.peso, 0); // 0-100
  return Math.round(total * 10); // 0-1000
}

export function ratingDoScore(score: number): Rating {
  if (score >= 800) return "A";
  if (score >= 650) return "B";
  if (score >= 500) return "C";
  if (score >= 350) return "D";
  return "E";
}

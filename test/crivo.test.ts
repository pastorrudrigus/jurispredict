/**
 * Casos exigidos no Anexo da spec: knockouts, cliente novo, cliente A,
 * cliente com atraso ativo — mais casos de borda do motor de limite.
 */

import { describe, expect, it } from "vitest";
import { decidir, VERSAO_POLITICA } from "../src/engine/index.js";
import type { FeaturesCliente } from "../src/engine/index.js";

/** Cliente saudável de base — os testes derivam variações dele. */
function clienteBase(overrides: Partial<FeaturesCliente> = {}): FeaturesCliente {
  return {
    mesesRelacionamento: 30,
    qtdPedidos12m: 24,
    regularidade: 0.92,
    recenciaDias: 10,
    faturamento12m: 480_000,
    faturamentoMedio3m: 45_000,
    tendenciaVolume: 1.05,
    ticketMedio: 20_000,
    pctPagoEmDia: 0.99,
    atrasoMedioDias: 0.5,
    piorAtraso12m: 0,
    qtdRenegociacoes6m: 0,
    valorEmAberto: 30_000,
    valorVencido: 0,
    dpdAtual: 0,
    scoreAbaco: 850,
    restritivoGrave: false,
    qtdRestritivosLeves: 0,
    cnpjAtivo: true,
    ticketMedioVsMedianaSegmento: 1.1,
    ...overrides,
  };
}

describe("camada 1 — knockouts", () => {
  it("nega CNPJ inapto na Receita, independente do score", () => {
    const r = decidir(clienteBase({ cnpjAtivo: false }));
    expect(r.decisao).toBe("negado");
    expect(r.knockouts.map((k) => k.regra)).toContain("cnpj_inapto");
    expect(r.limiteAprovado).toBe(0);
    expect(r.prazoMaximoDias).toBe(0);
  });

  it("nega restritivo grave no Ábaco", () => {
    const r = decidir(clienteBase({ restritivoGrave: true }));
    expect(r.decisao).toBe("negado");
    expect(r.knockouts.map((k) => k.regra)).toContain("restritivo_grave");
  });

  it("nega dpd_atual > 30 dias na própria JC", () => {
    const r = decidir(clienteBase({ dpdAtual: 31, valorVencido: 12_000 }));
    expect(r.decisao).toBe("negado"); // negar tem precedência sobre suspender
    expect(r.knockouts.map((k) => k.regra)).toEqual(
      expect.arrayContaining(["dpd_maior_30", "valor_vencido"])
    );
  });

  it("manda renegociação recente para mesa manual", () => {
    const r = decidir(clienteBase({ qtdRenegociacoes6m: 1 }));
    expect(r.decisao).toBe("manual");
    expect(r.limiteAprovado).toBeGreaterThan(0); // vai como sugestão para a mesa
  });
});

describe("cliente novo (sem histórico)", () => {
  it("relacionamento < 6 meses vai para mesa manual", () => {
    const r = decidir(
      clienteBase({ mesesRelacionamento: 3, qtdPedidos12m: 5, faturamentoMedio3m: 15_000 })
    );
    expect(r.decisao).toBe("manual");
    expect(r.knockouts.map((k) => k.regra)).toContain("sem_historico");
  });

  it("menos de 4 pedidos vai para mesa manual mesmo com relacionamento longo", () => {
    const r = decidir(clienteBase({ qtdPedidos12m: 3 }));
    expect(r.decisao).toBe("manual");
    expect(r.knockouts.map((k) => k.regra)).toContain("sem_historico");
  });
});

describe("cliente A (paga em dia, volume crescente)", () => {
  it("aprova com rating A, multiplicador 1.5x e prazo de 60 dias", () => {
    const r = decidir(clienteBase());
    expect(r.decisao).toBe("aprovado");
    expect(r.knockouts).toHaveLength(0);
    expect(r.score).toBeGreaterThanOrEqual(800);
    expect(r.rating).toBe("A");
    // 45.000 × 1.5 = 67.500 — abaixo do teto de 100k
    expect(r.limiteCalculado).toBeCloseTo(67_500);
    expect(r.limiteAprovado).toBe(67_500);
    expect(r.prazoMaximoDias).toBe(60);
    expect(r.validadeDias).toBe(90);
    expect(r.versaoPolitica).toBe(VERSAO_POLITICA);
  });

  it("aplica o teto absoluto de R$ 100k no MVP", () => {
    const r = decidir(clienteBase({ faturamentoMedio3m: 120_000, faturamento12m: 1_400_000 }));
    expect(r.rating).toBe("A");
    expect(r.limiteCalculado).toBeCloseTo(180_000); // 120k × 1.5
    expect(r.limiteAprovado).toBe(100_000);
  });

  it("aplica o cap de concentração de 5% da carteira quando informado", () => {
    const r = decidir(clienteBase(), { exposicaoCarteiraTotal: 1_000_000 });
    expect(r.limiteAprovado).toBe(50_000); // min(67.5k, 5% de 1M)
  });
});

describe("cliente com atraso ativo", () => {
  it("suspende novas operações com qualquer valor vencido (dpd ≤ 30)", () => {
    const r = decidir(clienteBase({ valorVencido: 800, dpdAtual: 7 }));
    expect(r.decisao).toBe("suspenso");
    expect(r.knockouts.map((k) => k.regra)).toContain("valor_vencido");
    expect(r.limiteAprovado).toBe(0);
  });

  it("cliente irregular sem knockout cai de rating e de limite", () => {
    const r = decidir(
      clienteBase({
        pctPagoEmDia: 0.82,
        atrasoMedioDias: 9,
        piorAtraso12m: 22,
        tendenciaVolume: 0.7,
        scoreAbaco: 480,
        qtdRestritivosLeves: 1,
      })
    );
    expect(r.decisao).toBe("aprovado");
    expect(["C", "D"]).toContain(r.rating);
    expect(r.limiteAprovado).toBeLessThan(45_000); // multiplicador ≤ 0.6
    expect(r.prazoMaximoDias).toBeLessThanOrEqual(35);
  });

  it("perfil péssimo cai em rating E e é negado mesmo sem knockout", () => {
    const r = decidir(
      clienteBase({
        pctPagoEmDia: 0.5,
        atrasoMedioDias: 25,
        piorAtraso12m: 28,
        recenciaDias: 120,
        regularidade: 0.3,
        mesesRelacionamento: 7,
        qtdPedidos12m: 5,
        faturamento12m: 30_000,
        faturamentoMedio3m: 1_000,
        tendenciaVolume: 0.4,
        scoreAbaco: 100,
        qtdRestritivosLeves: 3,
        ticketMedioVsMedianaSegmento: 0.2,
      })
    );
    expect(r.rating).toBe("E");
    expect(r.decisao).toBe("negado");
    expect(r.limiteAprovado).toBe(0);
  });
});

describe("auditabilidade", () => {
  it("toda decisão carrega versão de política e snapshot das features", () => {
    const f = clienteBase();
    const r = decidir(f);
    expect(r.versaoPolitica).toBe("v1.0");
    expect(r.payloadFeatures).toEqual(f);
    expect(r.blocos.reduce((a, b) => a + b.peso, 0)).toBeCloseTo(1.0);
  });
});

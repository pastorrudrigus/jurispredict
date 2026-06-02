"""Testes do motor de calculo (notas, ISF, repasse e analise de lacunas)."""

import math

import pytest

from previne.calculator import (
    ResultadoIndicador,
    avaliar_municipio,
    isf,
    nota_indicador,
)
from previne.indicators import INDICADORES


# --------------------------------------------------------------------------- #
# Nota do indicador
# --------------------------------------------------------------------------- #
def test_nota_atinge_meta_da_dez():
    assert nota_indicador(45.0, 45.0) == 10.0


def test_nota_metade_da_meta_da_cinco():
    assert nota_indicador(22.5, 45.0) == 5.0


def test_nota_acima_da_meta_e_limitada_a_dez():
    assert nota_indicador(90.0, 45.0) == 10.0


def test_nota_zero_quando_resultado_zero():
    assert nota_indicador(0.0, 45.0) == 0.0


# --------------------------------------------------------------------------- #
# ISF
# --------------------------------------------------------------------------- #
def test_isf_maximo_quando_todas_notas_dez():
    notas = {ind.codigo: 10.0 for ind in INDICADORES}
    assert isf(notas) == 10.0


def test_isf_meio_quando_todas_notas_cinco():
    notas = {ind.codigo: 5.0 for ind in INDICADORES}
    assert isf(notas) == 5.0


def test_isf_pondera_pelos_pesos():
    # Apenas I3 (peso 2) com nota 10; resto zero -> ISF = 10*2/10 = 2.0
    notas = {ind.codigo: 0.0 for ind in INDICADORES}
    notas["I3"] = 10.0
    assert isf(notas) == pytest.approx(2.0)


# --------------------------------------------------------------------------- #
# Avaliacao completa
# --------------------------------------------------------------------------- #
def _todos_no_resultado(valor_por_codigo: dict[str, float]) -> list[ResultadoIndicador]:
    return [ResultadoIndicador(c, v) for c, v in valor_por_codigo.items()]


def test_repasse_maximo_uma_equipe_esf():
    # 1 eSF (R$ 3.225/mes) x 4 meses, todas as metas atingidas -> ISF 10.
    resultados = _todos_no_resultado({ind.codigo: ind.meta for ind in INDICADORES})
    a = avaliar_municipio(
        municipio="Teste",
        uf="SP",
        ibge="0000000",
        equipes={"eSF": 1},
        resultados=resultados,
    )
    assert a.isf == 10.0
    assert a.repasse_maximo == pytest.approx(3225.0 * 4)
    assert a.repasse_atual == pytest.approx(3225.0 * 4)
    assert a.repasse_potencial == pytest.approx(0.0)


def test_repasse_zero_quando_desempenho_zero():
    resultados = _todos_no_resultado({ind.codigo: 0.0 for ind in INDICADORES})
    a = avaliar_municipio(
        municipio="Teste",
        uf="SP",
        ibge="0000000",
        equipes={"eSF": 1},
        resultados=resultados,
    )
    assert a.isf == 0.0
    assert a.repasse_atual == 0.0
    assert a.repasse_potencial == pytest.approx(3225.0 * 4)


def test_metade_da_meta_gera_metade_do_repasse():
    resultados = _todos_no_resultado({ind.codigo: ind.meta / 2 for ind in INDICADORES})
    a = avaliar_municipio(
        municipio="Teste",
        uf="SP",
        ibge="0000000",
        equipes={"eSF": 1},
        resultados=resultados,
    )
    assert a.isf == pytest.approx(5.0)
    assert a.repasse_atual == pytest.approx(3225.0 * 4 * 0.5)


def test_ganho_potencial_soma_ao_repasse_maximo():
    # A soma dos ganhos potenciais de todos os indicadores deve fechar a lacuna
    # ate o repasse maximo.
    resultados = _todos_no_resultado({ind.codigo: ind.meta / 2 for ind in INDICADORES})
    a = avaliar_municipio(
        municipio="Teste",
        uf="SP",
        ibge="0000000",
        equipes={"eSF": 1},
        resultados=resultados,
    )
    soma_ganhos = sum(i.ganho_potencial for i in a.indicadores)
    assert soma_ganhos == pytest.approx(a.repasse_potencial, abs=0.05)


def test_prioridades_ordenadas_por_ganho():
    resultados = _todos_no_resultado({ind.codigo: ind.meta / 2 for ind in INDICADORES})
    a = avaliar_municipio(
        municipio="Teste",
        uf="SP",
        ibge="0000000",
        equipes={"eSF": 10},
        resultados=resultados,
    )
    prioridades = a.prioridades()
    ganhos = [p.ganho_potencial for p in prioridades]
    assert ganhos == sorted(ganhos, reverse=True)
    # Indicadores de peso 2 devem render mais que os de peso 1 (mesma lacuna relativa).
    assert prioridades[0].peso == 2


def test_casos_adicionais_para_atingir_meta():
    # I1: meta 45%, denominador 200, numerador atual 40 (20%).
    # Numerador necessario = ceil(0.45*200) = 90 -> faltam 50.
    a = avaliar_municipio(
        municipio="Teste",
        uf="SP",
        ibge="0000000",
        equipes={"eSF": 1},
        resultados=[ResultadoIndicador("I1", 20.0, numerador=40, denominador=200)],
    )
    i1 = next(i for i in a.indicadores if i.codigo == "I1")
    assert i1.casos_adicionais == math.ceil(0.45 * 200) - 40 == 50


def test_indicador_nao_informado_conta_como_zero():
    a = avaliar_municipio(
        municipio="Teste",
        uf="SP",
        ibge="0000000",
        equipes={"eSF": 1},
        resultados=[ResultadoIndicador("I1", 45.0)],  # apenas 1 informado
    )
    # ISF = 10*1/10 = 1.0 (so I1 com peso 1 pontuou)
    assert a.isf == pytest.approx(1.0)

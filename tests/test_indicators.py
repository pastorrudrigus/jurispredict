"""Testes da definicao dos indicadores."""

from previne.indicators import INDICADORES, PESO_TOTAL, indicador


def test_existem_sete_indicadores():
    assert len(INDICADORES) == 7


def test_soma_dos_pesos_e_dez():
    # A metodologia oficial do ISF usa soma de pesos igual a 10.
    assert PESO_TOTAL == 10


def test_codigos_unicos_de_i1_a_i7():
    codigos = sorted(ind.codigo for ind in INDICADORES)
    assert codigos == [f"I{n}" for n in range(1, 8)]


def test_meta_fracao():
    ind = indicador("I1")
    assert ind.meta == 45.0
    assert ind.meta_fracao == 0.45


def test_lookup_invalido_lanca():
    import pytest

    with pytest.raises(KeyError):
        indicador("I99")

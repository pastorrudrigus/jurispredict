"""Testes da conversao de dados da API do DEMAS (sem acesso a rede)."""

from previne.datasus import (
    CODIGO_TIPO_INDICADOR,
    _resultado_de_registro,
    ibge6,
)


def test_ibge6_remove_digito_verificador():
    assert ibge6("5208707") == 520870   # Goiania, 7 -> 6 digitos
    assert ibge6(520870) == 520870      # ja com 6 digitos
    assert ibge6("3550308") == 355030   # Sao Paulo


def test_mapeamento_codigo_tipo_indicador():
    # Os 7 codigos do SISAB mapeiam para I1..I7.
    assert CODIGO_TIPO_INDICADOR[10] == "I1"
    assert CODIGO_TIPO_INDICADOR[50] == "I5"
    assert CODIGO_TIPO_INDICADOR[70] == "I7"


def test_resultado_de_registro_calcula_num_sobre_den():
    reg = {
        "codigo_tipo_indicador": 10,
        "numerador": 1483.0,
        "denominador_identificado": 2864.0,
        "visao_equipe": "homologadas",
    }
    r = _resultado_de_registro(reg)
    assert r is not None
    assert r.codigo == "I1"
    assert r.numerador == 1483
    assert r.denominador == 2864
    assert r.resultado == round(1483 / 2864 * 100, 1) == 51.8


def test_resultado_de_registro_ignora_codigo_desconhecido():
    reg = {"codigo_tipo_indicador": 999, "numerador": 1, "denominador_identificado": 2}
    assert _resultado_de_registro(reg) is None


def test_resultado_de_registro_sem_denominador_retorna_none():
    reg = {"codigo_tipo_indicador": 10, "numerador": 5, "denominador_identificado": 0}
    assert _resultado_de_registro(reg) is None

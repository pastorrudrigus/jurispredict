"""Testes do modulo CNES (estimativa de equipes e parser da base oficial)."""

from previne.cnes import (
    SIGLA_PARA_CODIGO,
    estimar_equipes,
    parse_cnes_equipes_csv,
)


# --------------------------------------------------------------------------- #
# Estimativa a partir de pessoas vinculadas (dado real)
# --------------------------------------------------------------------------- #
def test_estimar_equipes_divide_por_referencia():
    # 963.579 / 3000 = 321,2 -> 321 ; 256.568 / 3000 = 85,5 -> 86
    eq = estimar_equipes({"eSF": 963579.0, "eAP": 256568.0})
    assert eq["eSF"] == 321
    assert eq["eAP30"] == 86


def test_estimar_equipes_ignora_sigla_desconhecida_e_zeros():
    eq = estimar_equipes({"eSF": 0.0, "eCR": 781.0})
    assert eq == {}  # eSF zerado e eCR nao mapeado


def test_estimar_equipes_minimo_uma_equipe():
    eq = estimar_equipes({"eSF": 100.0})  # 100/3000 -> 0, mas minimo 1
    assert eq["eSF"] == 1


def test_parametro_configuravel():
    eq = estimar_equipes({"eSF": 8000.0}, parametro={"eSF": 4000})
    assert eq["eSF"] == 2


def test_sigla_eap_mapeia_para_eap30():
    assert SIGLA_PARA_CODIGO["eAP"] == "eAP30"


# --------------------------------------------------------------------------- #
# Parser da base oficial do CNES (contagem exata por equipes distintas)
# --------------------------------------------------------------------------- #
def test_parse_cnes_conta_equipes_distintas():
    csv = (
        "CO_MUNICIPIO_GESTOR;TP_EQUIPE;SEQ_EQUIPE;TP_CARGA_HORARIA\n"
        "520870;70;001;40\n"   # eSF
        "520870;70;001;40\n"   # mesma eSF (nao conta de novo)
        "520870;70;002;40\n"   # outra eSF
        "520870;76;010;30\n"   # eAP 30h
        "520870;76;011;20\n"   # eAP 20h
        "520870;99;020;40\n"   # tipo desconhecido (ignora)
    )
    contagem = parse_cnes_equipes_csv(csv)
    assert contagem["520870"]["eSF"] == 2
    assert contagem["520870"]["eAP30"] == 1
    assert contagem["520870"]["eAP20"] == 1


def test_parse_cnes_trunca_ibge_para_6_digitos():
    csv = "CO_MUNICIPIO_GESTOR;TP_EQUIPE;SEQ_EQUIPE;TP_CARGA_HORARIA\n5208707;70;001;40\n"
    contagem = parse_cnes_equipes_csv(csv)
    assert "520870" in contagem

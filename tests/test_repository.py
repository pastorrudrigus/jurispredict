"""Testes do repositorio de exemplo e do parser de CSV do SISAB."""

from previne.datasus import parse_csv_sisab
from previne.repository import MunicipioRepository


def test_repositorio_exemplo_carrega_municipios():
    repo = MunicipioRepository.from_exemplo()
    assert len(repo.ibges()) >= 4
    assert "2312908" in repo.ibges()  # Sobral/CE


def test_avaliar_municipio_de_exemplo():
    repo = MunicipioRepository.from_exemplo()
    a = repo.avaliar("2312908")
    assert a is not None
    assert a.municipio == "Sobral"
    assert 0.0 <= a.isf <= 10.0
    assert a.repasse_potencial >= 0.0


def test_avaliar_todos():
    repo = MunicipioRepository.from_exemplo()
    avaliacoes = repo.avaliar_todos()
    assert len(avaliacoes) == len(repo.ibges())


def test_parse_csv_sisab_reconhece_colunas():
    csv = (
        "Ibge;Municipio;Pre-natal 6 consultas;Vacinacao Polio;Diabeticos HbA1c\n"
        "2312908;Sobral;58,4;88,1;44,7\n"
        "3304557;Rio de Janeiro;32,1;79,3;35,2\n"
    )
    mapa = parse_csv_sisab(csv)
    assert set(mapa.keys()) == {"2312908", "3304557"}
    sobral = {r.codigo: r.resultado for r in mapa["2312908"]}
    assert sobral["I1"] == 58.4
    assert sobral["I5"] == 88.1
    assert sobral["I7"] == 44.7

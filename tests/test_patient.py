"""Testes da analise em nivel de paciente e geracao de instrucoes por equipe."""

from datetime import date

import pytest

from previne.convenio import Convenio, ConvenioDataSUS, pseudonimizar
from previne.patient import (
    Paciente,
    analisar_equipe_indicador,
    analisar_equipes,
    gerar_amostra_sintetica,
)


# --------------------------------------------------------------------------- #
# Regras e analise por equipe
# --------------------------------------------------------------------------- #
def _gestante(pid, **kw):
    base = dict(equipe_ine="E1", equipe_nome="ESF Teste", sexo="F", idade=28, gestante=True)
    base.update(kw)
    return Paciente(pid=pid, **base)


def test_elegibilidade_e_atendimento_odonto():
    pacientes = [
        _gestante("g1", atend_odontologico=True),   # atendida
        _gestante("g2", atend_odontologico=False),  # pendente
        _gestante("g3", atend_odontologico=False),  # pendente
        Paciente(pid="h1", equipe_ine="E1", hipertenso=True),  # nao elegivel a I3
    ]
    r = analisar_equipe_indicador(pacientes, "E1", "I3")
    assert r.elegiveis == 3
    assert r.atendidos == 1
    assert set(r.pacientes_pendentes) == {"g2", "g3"}


def test_faltam_para_meta_usa_teto_da_meta():
    # I3 meta 60%. 5 gestantes, 1 atendida -> alvo = ceil(0.6*5)=3 -> faltam 2.
    pacientes = [_gestante(f"g{i}", atend_odontologico=(i == 0)) for i in range(5)]
    r = analisar_equipe_indicador(pacientes, "E1", "I3")
    assert r.elegiveis == 5
    assert r.atendidos == 1
    assert r.faltam_para_meta == 2


def test_meta_atingida_nao_gera_pendencia_na_instrucao():
    pacientes = [_gestante(f"g{i}", atend_odontologico=True) for i in range(4)]
    r = analisar_equipe_indicador(pacientes, "E1", "I3")
    assert r.faltam_para_meta == 0
    assert "atingida" in r.instrucao.lower()


def test_prenatal_exige_seis_consultas_ate_semana_12():
    pacientes = [
        _gestante("ok", consultas_prenatal=6, primeira_consulta_semana=10),
        _gestante("poucas", consultas_prenatal=5, primeira_consulta_semana=8),
        _gestante("tarde", consultas_prenatal=8, primeira_consulta_semana=16),
    ]
    r = analisar_equipe_indicador(pacientes, "E1", "I1")
    assert r.atendidos == 1
    assert set(r.pacientes_pendentes) == {"poucas", "tarde"}


def test_analisar_equipes_so_retorna_com_elegiveis():
    pacientes = gerar_amostra_sintetica(por_equipe=80, seed=1)
    pendencias = analisar_equipes(pacientes)
    assert all(p.elegiveis > 0 for p in pendencias)
    assert len({p.equipe_ine for p in pendencias}) == 3


def test_amostra_sintetica_e_deterministica():
    a = gerar_amostra_sintetica(seed=7, por_equipe=50)
    b = gerar_amostra_sintetica(seed=7, por_equipe=50)
    assert [p.pid for p in a] == [p.pid for p in b]
    assert a[0].gestante == b[0].gestante


# --------------------------------------------------------------------------- #
# Convenio / pseudonimizacao
# --------------------------------------------------------------------------- #
def test_pseudonimizacao_estavel_e_irreversivel():
    p1 = pseudonimizar("700508564110004", "sal-secreto")
    p2 = pseudonimizar("700.508.564.110-004", "sal-secreto")  # mesmo doc, formatado
    assert p1 == p2                       # estavel/reconciliavel
    assert "700508564110004" not in p1    # nao expoe o documento
    assert pseudonimizar("700508564110004", "outro-sal") != p1  # sal muda o hash


def test_convenio_fora_de_vigencia_nega_acesso():
    conv = Convenio(
        ente="SMS Teste",
        numero_termo="001/2024",
        finalidade="monitoramento APS",
        vigencia_ate=date(2020, 1, 1),
        sal="x",
    )
    with pytest.raises(PermissionError):
        ConvenioDataSUS(conv)


def test_convenio_sem_sal_falha():
    conv = Convenio(ente="SMS", numero_termo="002", finalidade="teste")
    with pytest.raises(ValueError):
        ConvenioDataSUS(conv)

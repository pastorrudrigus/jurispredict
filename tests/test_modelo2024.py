"""Testes do modelo 2024 (Componente de Qualidade) e da exportacao."""

from datetime import date

from previne.export import linhas_para_pdf, worklist_para_csv, worklist_para_pdf
from previne.modelo2024 import (
    INICIO_CLASSIFICACAO_REAL,
    avaliar_qualidade_2024,
    classificar,
)
from previne.patient import analisar_equipes, gerar_amostra_sintetica


# --------------------------------------------------------------------------- #
# Classificacao por faixa
# --------------------------------------------------------------------------- #
def _depois():
    return date(2026, 6, 1)


def test_classificacao_excelente():
    assert classificar(9.0, em=_depois()).nome == "Excelente"


def test_classificacao_bom():
    assert classificar(6.5, em=_depois()).nome == "Bom"


def test_classificacao_suficiente():
    assert classificar(4.2, em=_depois()).nome == "Suficiente"


def test_classificacao_regular():
    assert classificar(2.0, em=_depois()).nome == "Regular"


def test_regra_de_transicao_classifica_como_bom():
    # Antes de jan/2026, mesmo ISF alto cai na faixa de transicao "Bom".
    antes = date(2025, 6, 1)
    assert antes < INICIO_CLASSIFICACAO_REAL
    assert classificar(9.5, em=antes).nome == "Bom"


# --------------------------------------------------------------------------- #
# Repasse do modelo 2024
# --------------------------------------------------------------------------- #
def test_repasse_2024_excelente_uma_esf():
    q = avaliar_qualidade_2024(isf=9.0, equipes={"eSF": 1}, em=_depois())
    assert q.faixa == "Excelente"
    assert q.repasse_mensal == 3000.0
    assert q.repasse_quadrimestre == 3000.0 * 4


def test_repasse_2024_proporcao_por_tipo_equipe():
    # eAP30 = 75% da eSF ; eAP20 = 50% da eSF (faixa Excelente = 3000).
    q = avaliar_qualidade_2024(isf=9.0, equipes={"eAP30": 1, "eAP20": 1}, em=_depois())
    assert q.repasse_mensal == 3000.0 * 0.75 + 3000.0 * 0.5


def test_teto_excelente_e_maior_ou_igual_ao_repasse():
    q = avaliar_qualidade_2024(isf=4.5, equipes={"eSF": 10}, em=_depois())
    assert q.faixa == "Suficiente"
    assert q.repasse_se_excelente >= q.repasse_quadrimestre


# --------------------------------------------------------------------------- #
# Exportacao CSV / PDF
# --------------------------------------------------------------------------- #
def test_csv_tem_cabecalho_e_linhas():
    pend = analisar_equipes(gerar_amostra_sintetica(por_equipe=60, seed=3))
    csv_txt = worklist_para_csv(pend)
    linhas = csv_txt.strip().splitlines()
    assert linhas[0].startswith("equipe_ine;equipe_nome;indicador")
    assert len(linhas) == len(pend) + 1


def test_pdf_assinatura_valida():
    pdf = linhas_para_pdf(["linha 1", "linha 2 (com parenteses)"], titulo="Teste")
    assert pdf.startswith(b"%PDF-1.4")
    assert pdf.rstrip().endswith(b"%%EOF")
    assert b"/Type /Catalog" in pdf


def test_pdf_worklist_pagina_multipla():
    # Muitas linhas devem gerar mais de uma pagina (Count > 1).
    pend = analisar_equipes(gerar_amostra_sintetica(por_equipe=120, seed=2))
    pdf = worklist_para_pdf(pend, municipio="Teste")
    assert pdf.startswith(b"%PDF-1.4")
    assert b"/Type /Page " in pdf

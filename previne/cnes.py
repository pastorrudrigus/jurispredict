"""Integracao com o CNES para obter o numero de equipes da APS por municipio.

O numero de equipes (eSF, eAP) e necessario para calcular o repasse total do
municipio. Ha tres caminhos, do mais exato ao mais acessivel:

  1. CONTAGEM EXATA (base oficial do CNES): parse_cnes_equipes_csv() conta equipes
     DISTINTAS por tipo a partir do extrato publico do CNES
     (cnes.datasus.gov.br/pages/downloads/arquivosBaseDados.jsp -> tbEquipe).
     E a contagem oficial homologada, porem exige baixar o arquivo do CNES.

  2. ESTIMATIVA FUNDAMENTADA (dado real, sem download pesado): a API do DEMAS
     expoe as PESSOAS VINCULADAS por tipo de equipe (base da Capitacao Ponderada).
     Dividindo pela populacao de referencia por equipe estima-se o nº de equipes.
     Validado em Goiania: 716.272 vinculados / 3.000 ~= 239 eSF (proximo do real).

  3. INFORMADO MANUALMENTE: o gestor digita o numero de equipes.

Observacao: a API nao distingue eAP de 30h e 20h (so "eAP"); por padrao tratamos
eAP como eAP30. A distincao de carga horaria so vem da base do CNES (carga_horaria).
"""

from __future__ import annotations

import csv
import io
from pathlib import Path

from previne.datasus import DataSUSClient


# Mapeia a sigla de equipe da API (cadastro-vinculado) -> codigo deste projeto.
# A API nao separa eAP 30h/20h; assumimos 30h por padrao (configuravel).
SIGLA_PARA_CODIGO: dict[str, str] = {
    "eSF": "eSF",
    "eAP": "eAP30",
}

# Populacao de referencia por equipe usada na ESTIMATIVA do numero de equipes.
# Valores configuraveis; ~3.000 pessoas por eSF e um parametro usual da APS.
POP_REFERENCIA_POR_EQUIPE: dict[str, int] = {
    "eSF": 3000,
    "eAP30": 3000,
    "eAP20": 2000,
}

# Codigos de tipo de equipe na base do CNES (tbEquipe.TP_EQUIPE) -> codigo do projeto.
# Validar contra o dicionario de dados do CNES vigente.
TP_EQUIPE_CNES: dict[int, str] = {
    70: "eSF",    # Equipe de Saude da Familia
    76: "eAP30",  # Equipe de Atencao Primaria (carga horaria define 30h/20h)
}


def estimar_equipes(
    pessoas_vinculadas: dict[str, float],
    *,
    parametro: dict[str, int] | None = None,
) -> dict[str, int]:
    """Estima o numero de equipes por tipo a partir das pessoas vinculadas (reais).

    Args:
        pessoas_vinculadas: mapa {sigla_api: pessoas} (ex.: de DataSUSClient.pessoas_vinculadas).
        parametro: populacao de referencia por equipe (padrao POP_REFERENCIA_POR_EQUIPE).

    Returns:
        Mapa {codigo_equipe: quantidade_estimada}, ex.: {"eSF": 239, "eAP30": 26}.
    """
    parametro = parametro or POP_REFERENCIA_POR_EQUIPE
    equipes: dict[str, int] = {}
    for sigla, pessoas in pessoas_vinculadas.items():
        codigo = SIGLA_PARA_CODIGO.get(sigla)
        if codigo is None or pessoas <= 0:
            continue
        ref = parametro.get(codigo, 3000)
        equipes[codigo] = equipes.get(codigo, 0) + max(1, round(pessoas / ref))
    return equipes


def equipes_estimadas_municipio(
    codigo_ibge: str | int,
    *,
    competencia: int | None = None,
    cliente: DataSUSClient | None = None,
) -> dict[str, int]:
    """Busca pessoas vinculadas reais na API e devolve o nº estimado de equipes."""
    fechar = cliente is None
    cliente = cliente or DataSUSClient()
    try:
        vinculados = cliente.pessoas_vinculadas(codigo_ibge, competencia=competencia)
    finally:
        if fechar:
            cliente.close()
    return estimar_equipes(vinculados)


def parse_cnes_equipes_csv(
    conteudo: str,
    *,
    delimiter: str = ";",
    col_ibge: str = "CO_MUNICIPIO_GESTOR",
    col_tipo: str = "TP_EQUIPE",
    col_id: str = "SEQ_EQUIPE",
    col_carga: str | None = "TP_CARGA_HORARIA",
) -> dict[str, dict[str, int]]:
    """Conta equipes DISTINTAS por tipo, por municipio, a partir do extrato do CNES.

    Retorna o numero EXATO (oficial) de equipes. Mapeia TP_EQUIPE via TP_EQUIPE_CNES
    e, quando ha coluna de carga horaria, separa eAP 30h/20h.

    Args:
        conteudo: texto do CSV (extrato tbEquipe do CNES).
        col_ibge: coluna com o codigo IBGE (6 ou 7 digitos) do municipio.
        col_tipo: coluna do tipo de equipe (TP_EQUIPE).
        col_id: coluna do identificador da equipe (para contar distintas).
        col_carga: coluna de carga horaria (opcional; separa eAP30/eAP20).

    Returns:
        Mapa {ibge6: {codigo_equipe: quantidade}}.
    """
    leitor = csv.DictReader(io.StringIO(conteudo), delimiter=delimiter)
    # ibge -> codigo_equipe -> set(ids) para contar equipes distintas
    vistos: dict[str, dict[str, set[str]]] = {}
    for linha in leitor:
        ibge = (linha.get(col_ibge) or "").strip()[:6]
        if not ibge:
            continue
        try:
            tp = int(float(linha.get(col_tipo) or -1))
        except ValueError:
            continue
        codigo = TP_EQUIPE_CNES.get(tp)
        if codigo is None:
            continue
        # Separa eAP por carga horaria, se disponivel (20 -> eAP20).
        if codigo == "eAP30" and col_carga:
            carga = (linha.get(col_carga) or "").strip()
            if carga.startswith("20") or carga == "20":
                codigo = "eAP20"
        ident = (linha.get(col_id) or "").strip()
        vistos.setdefault(ibge, {}).setdefault(codigo, set()).add(ident)

    return {
        ibge: {cod: len(ids) for cod, ids in por_cod.items()}
        for ibge, por_cod in vistos.items()
    }

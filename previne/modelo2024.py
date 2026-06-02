"""Modelo 2024 do cofinanciamento da APS (Portaria GM/MS no 3.493/2024).

A partir de maio/2024 o Previne Brasil foi reestruturado. O antigo "Pagamento por
Desempenho" deu lugar a um COMPONENTE DE QUALIDADE, no qual o municipio e
classificado em faixas e recebe um valor mensal por equipe conforme a faixa:

    Excelente | Bom | Suficiente | Regular

Regra de transicao: ate dezembro/2025 todos os municipios sao classificados como
"Bom", independentemente do desempenho real. A classificacao por desempenho real
passa a valer em JANEIRO/2026.

IMPORTANTE: a metodologia de pontuacao e os pontos de corte exatos das faixas
foram pactuados tripartite e podem ser ajustados por atos posteriores. Os limiares
abaixo sao VALORES DE REFERENCIA (configuraveis) sobre a escala do ISF (0-10) e
devem ser confirmados contra a norma vigente antes de uso oficial.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from previne.financing import tipo_equipe


# Data a partir da qual vale a classificacao por desempenho real.
INICIO_CLASSIFICACAO_REAL = date(2026, 1, 1)


@dataclass(frozen=True)
class Faixa:
    """Faixa de qualidade do modelo 2024."""

    nome: str
    isf_minimo: float                 # ISF minimo (inclusive) para entrar na faixa
    valor_mensal_esf: float           # valor mensal por eSF nesta faixa (R$)


# Faixas em ordem decrescente de exigencia. Valores de referencia para a eSF.
FAIXAS: tuple[Faixa, ...] = (
    Faixa("Excelente", 8.0, 3000.00),
    Faixa("Bom", 6.0, 2500.00),
    Faixa("Suficiente", 4.0, 2000.00),
    Faixa("Regular", 0.0, 1000.00),
)

# Proporcao do valor da eSF aplicada aos demais tipos de equipe (como no modelo 2022):
#   eAP 30h = 75% da eSF ; eAP 20h = 50% da eSF.
PROPORCAO_EQUIPE: dict[str, float] = {"eSF": 1.0, "eAP30": 0.75, "eAP20": 0.50}

# Faixa aplicada no periodo de transicao (ate dez/2025).
FAIXA_TRANSICAO = next(f for f in FAIXAS if f.nome == "Bom")


@dataclass
class AvaliacaoQualidade2024:
    """Resultado da avaliacao no modelo 2024 (Componente de Qualidade)."""

    isf: float
    faixa: str
    em_transicao: bool                # True se classificado como "Bom" pela regra de transicao
    repasse_mensal: float             # R$/mes somando todas as equipes
    repasse_quadrimestre: float       # R$ no quadrimestre (x meses)
    repasse_se_excelente: float       # teto: R$/quadrimestre se faixa Excelente
    valor_mensal_por_equipe: dict[str, float]


def classificar(isf: float, *, em: date | None = None) -> Faixa:
    """Classifica um municipio em uma faixa a partir do ISF.

    Antes de INICIO_CLASSIFICACAO_REAL aplica-se a regra de transicao (faixa "Bom").
    """
    referencia = em or date.today()
    if referencia < INICIO_CLASSIFICACAO_REAL:
        return FAIXA_TRANSICAO
    for faixa in FAIXAS:  # ordenadas da mais exigente para a menos
        if isf >= faixa.isf_minimo:
            return faixa
    return FAIXAS[-1]


def _valor_mensal_equipe(faixa: Faixa, codigo_equipe: str) -> float:
    """Valor mensal de uma equipe na faixa, aplicando a proporcao por tipo."""
    proporcao = PROPORCAO_EQUIPE.get(codigo_equipe, 1.0)
    return round(faixa.valor_mensal_esf * proporcao, 2)


def avaliar_qualidade_2024(
    *, isf: float, equipes: dict[str, int], meses: int = 4, em: date | None = None
) -> AvaliacaoQualidade2024:
    """Calcula o repasse do Componente de Qualidade (modelo 2024) de um municipio.

    Args:
        isf: ISF do municipio (escala 0-10), reaproveitado do calculo de indicadores.
        equipes: mapa {codigo_tipo_equipe: quantidade}.
        meses: meses do periodo (padrao = 1 quadrimestre = 4 meses).
        em: data de referencia (controla a regra de transicao).
    """
    referencia = em or date.today()
    faixa = classificar(isf, em=referencia)
    em_transicao = referencia < INICIO_CLASSIFICACAO_REAL
    excelente = FAIXAS[0]

    # Garante a presenca de todos os tipos conhecidos no detalhamento por equipe.
    valor_por_equipe = {cod: _valor_mensal_equipe(faixa, cod) for cod in PROPORCAO_EQUIPE}

    mensal = 0.0
    teto_mensal = 0.0
    for codigo, qtd in equipes.items():
        # valida o tipo de equipe (lanca KeyError se desconhecido)
        tipo_equipe(codigo)
        mensal += _valor_mensal_equipe(faixa, codigo) * qtd
        teto_mensal += _valor_mensal_equipe(excelente, codigo) * qtd

    return AvaliacaoQualidade2024(
        isf=round(isf, 2),
        faixa=faixa.nome,
        em_transicao=em_transicao,
        repasse_mensal=round(mensal, 2),
        repasse_quadrimestre=round(mensal * meses, 2),
        repasse_se_excelente=round(teto_mensal * meses, 2),
        valor_mensal_por_equipe=valor_por_equipe,
    )

"""Parametros financeiros do componente Pagamento por Desempenho.

Define os valores maximos mensais por tipo de equipe (pagos quando ISF = 10)
e os tipos de equipe elegiveis.

Fonte: Portaria GM/MS no 2.979/2019 e atos complementares (valores de referencia
do modelo 2022 do Previne Brasil).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TipoEquipe:
    """Tipo de equipe da APS e seu valor maximo mensal no Pagamento por Desempenho."""

    codigo: str
    nome: str
    valor_maximo_mensal: float  # valor pago por equipe/mes quando ISF = 10


# Valores maximos mensais por equipe (R$), pagos integralmente quando ISF = 10.
TIPOS_EQUIPE: tuple[TipoEquipe, ...] = (
    TipoEquipe("eSF", "Equipe de Saude da Familia", 3225.00),
    TipoEquipe("eAP30", "Equipe de Atencao Primaria 30h", 2418.75),
    TipoEquipe("eAP20", "Equipe de Atencao Primaria 20h", 1612.50),
)

POR_CODIGO_EQUIPE: dict[str, TipoEquipe] = {t.codigo: t for t in TIPOS_EQUIPE}

# Numero de meses em um quadrimestre de avaliacao (Previne Brasil avalia a cada 4 meses).
MESES_POR_QUADRIMESTRE: int = 4


def tipo_equipe(codigo: str) -> TipoEquipe:
    """Retorna o tipo de equipe pelo codigo (ex.: 'eSF'). Lanca KeyError se nao existir."""
    return POR_CODIGO_EQUIPE[codigo]

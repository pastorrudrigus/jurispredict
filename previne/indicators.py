"""Definicao dos 7 indicadores de Pagamento por Desempenho do Previne Brasil.

Cada indicador possui:
  - codigo curto e descricao oficial
  - meta (percentual a ser atingido para nota maxima)
  - peso (importancia relativa no calculo do ISF; a soma dos pesos = 10)
  - numerador / denominador (o que e contado, para fins de explicacao e simulacao)

Fonte: Portaria GM/MS no 102/2022 e Notas Tecnicas SAPS/MS 13-19/2022.
Todos os numeradores e denominadores sao apurados exclusivamente pelo SISAB.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Indicador:
    """Define um indicador de desempenho do Previne Brasil."""

    codigo: str
    nome: str
    descricao: str
    meta: float          # meta em percentual (0-100) para atingir nota 10
    peso: int            # peso no calculo do ISF (soma de todos = 10)
    numerador: str       # o que e contado no numerador
    denominador: str     # o universo elegivel (denominador)

    @property
    def meta_fracao(self) -> float:
        """Meta expressa como fracao (0-1)."""
        return self.meta / 100.0


# Os 7 indicadores vigentes no modelo 2022 do Previne Brasil.
# A soma dos pesos e 10, conforme metodologia oficial do ISF.
INDICADORES: tuple[Indicador, ...] = (
    Indicador(
        codigo="I1",
        nome="Pre-natal (6+ consultas)",
        descricao=(
            "Proporcao de gestantes com pelo menos 6 consultas de pre-natal, "
            "sendo a primeira ate a 12a semana de gestacao."
        ),
        meta=45.0,
        peso=1,
        numerador="Gestantes com 6+ consultas de pre-natal (1a ate a 12a semana)",
        denominador="Gestantes identificadas no periodo",
    ),
    Indicador(
        codigo="I2",
        nome="Sifilis e HIV em gestantes",
        descricao=(
            "Proporcao de gestantes com solicitacao de exame para sifilis e HIV."
        ),
        meta=60.0,
        peso=1,
        numerador="Gestantes com exames de sifilis E HIV solicitados",
        denominador="Gestantes identificadas no periodo",
    ),
    Indicador(
        codigo="I3",
        nome="Atendimento odontologico a gestantes",
        descricao=(
            "Proporcao de gestantes com atendimento odontologico realizado na APS."
        ),
        meta=60.0,
        peso=2,
        numerador="Gestantes com atendimento odontologico",
        denominador="Gestantes identificadas no periodo",
    ),
    Indicador(
        codigo="I4",
        nome="Citopatologico (cancer de colo)",
        descricao=(
            "Proporcao de mulheres de 25 a 64 anos com coleta de exame "
            "citopatologico do colo do utero a cada 3 anos."
        ),
        meta=40.0,
        peso=1,
        numerador="Mulheres (25-64 anos) com citopatologico coletado",
        denominador="Mulheres de 25 a 64 anos cadastradas",
    ),
    Indicador(
        codigo="I5",
        nome="Vacinacao infantil (Penta + Polio)",
        descricao=(
            "Proporcao de criancas de 1 ano vacinadas contra Difteria, Tetano, "
            "Coqueluche, Hepatite B, Haemophilus influenzae B e Poliomielite."
        ),
        meta=95.0,
        peso=2,
        numerador="Criancas de 1 ano com esquema vacinal completo (Penta + Polio)",
        denominador="Criancas de 1 ano cadastradas",
    ),
    Indicador(
        codigo="I6",
        nome="Hipertensos com PA aferida",
        descricao=(
            "Proporcao de pessoas com hipertensao com consulta e pressao "
            "arterial aferida no semestre."
        ),
        meta=50.0,
        peso=2,
        numerador="Hipertensos com consulta e PA aferida no semestre",
        denominador="Hipertensos cadastrados",
    ),
    Indicador(
        codigo="I7",
        nome="Diabeticos com HbA1c",
        descricao=(
            "Proporcao de pessoas com diabetes com consulta e solicitacao de "
            "hemoglobina glicada (HbA1c) no semestre."
        ),
        meta=50.0,
        peso=1,
        numerador="Diabeticos com consulta e HbA1c solicitada no semestre",
        denominador="Diabeticos cadastrados",
    ),
)


# Soma dos pesos -- usada como divisor no calculo do ISF. Deve ser 10.
PESO_TOTAL: int = sum(ind.peso for ind in INDICADORES)

# Indice rapido por codigo.
POR_CODIGO: dict[str, Indicador] = {ind.codigo: ind for ind in INDICADORES}


def indicador(codigo: str) -> Indicador:
    """Retorna o indicador pelo codigo (ex.: 'I1'). Lanca KeyError se nao existir."""
    return POR_CODIGO[codigo]

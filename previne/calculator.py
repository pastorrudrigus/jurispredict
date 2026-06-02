"""Motor de calculo do Pagamento por Desempenho do Previne Brasil.

Reproduz a metodologia oficial:

  1. Nota de cada indicador:
         nota_i = min( (resultado_i / meta_i) * 10 , 10 )
         (se resultado_i == 0  ->  nota_i = 0)

  2. Indicador Sintetico Final (ISF), escala 0-10:
         ISF = soma( nota_i * peso_i ) / soma(pesos)        [soma dos pesos = 10]

  3. Repasse do componente desempenho (por quadrimestre):
         repasse = (ISF / 10) * soma_equipes( valor_max_equipe * qtd ) * meses

Alem do calculo, este modulo faz a ANALISE DE LACUNAS: para cada indicador
mostra quanto falta para a meta, quantos casos adicionais sao necessarios e
quanto dinheiro aquilo representa -- permitindo priorizar esforcos.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from previne.indicators import INDICADORES, PESO_TOTAL, Indicador, indicador
from previne.financing import MESES_POR_QUADRIMESTRE, tipo_equipe


# --------------------------------------------------------------------------- #
# Calculos elementares
# --------------------------------------------------------------------------- #
def nota_indicador(resultado: float, meta: float) -> float:
    """Calcula a nota (0-10) de um indicador dado o resultado e a meta (em %).

    nota = min( (resultado / meta) * 10 , 10 ).  Resultado 0 => nota 0.
    """
    if resultado <= 0 or meta <= 0:
        return 0.0
    return min((resultado / meta) * 10.0, 10.0)


def isf(notas_ponderadas: dict[str, float]) -> float:
    """Calcula o ISF (0-10) a partir de um mapa {codigo_indicador: nota}."""
    soma = 0.0
    for codigo, nota in notas_ponderadas.items():
        soma += nota * indicador(codigo).peso
    return soma / PESO_TOTAL


# --------------------------------------------------------------------------- #
# Estruturas de entrada e saida
# --------------------------------------------------------------------------- #
@dataclass
class ResultadoIndicador:
    """Resultado apurado de um indicador para um municipio em um periodo."""

    codigo: str
    resultado: float                 # percentual atingido (0-100)
    numerador: int | None = None     # quantidade contada (opcional)
    denominador: int | None = None   # universo elegivel (opcional)

    @property
    def indicador(self) -> Indicador:
        return indicador(self.codigo)


@dataclass
class AnaliseIndicador:
    """Diagnostico de um indicador: nota atual, lacuna e potencial financeiro."""

    codigo: str
    nome: str
    meta: float
    peso: int
    resultado: float
    nota: float
    atingiu_meta: bool
    lacuna_pp: float                 # pontos percentuais que faltam para a meta
    casos_adicionais: int | None     # quantos casos a mais para bater a meta
    ganho_potencial: float           # R$ adicionais ao levar este indicador a meta
    reais_por_ponto: float           # R$ ganhos por ponto percentual de melhora


@dataclass
class AvaliacaoMunicipio:
    """Resultado completo da avaliacao de um municipio."""

    municipio: str
    uf: str
    ibge: str
    isf: float
    repasse_atual: float             # R$ no quadrimestre com o desempenho atual
    repasse_maximo: float            # R$ no quadrimestre se ISF = 10
    repasse_potencial: float         # R$ deixados na mesa (maximo - atual)
    base_mensal: float               # soma(valor_max * qtd) das equipes
    meses: int
    indicadores: list[AnaliseIndicador] = field(default_factory=list)

    @property
    def percentual_aproveitado(self) -> float:
        """% do repasse maximo que o municipio efetivamente captura."""
        if self.repasse_maximo == 0:
            return 0.0
        return self.repasse_atual / self.repasse_maximo * 100.0

    def prioridades(self, n: int | None = None) -> list[AnaliseIndicador]:
        """Indicadores ordenados pelo maior ganho potencial em R$ (descendente)."""
        ordenados = sorted(
            (a for a in self.indicadores if not a.atingiu_meta),
            key=lambda a: a.ganho_potencial,
            reverse=True,
        )
        return ordenados[:n] if n else ordenados


# --------------------------------------------------------------------------- #
# Avaliacao completa
# --------------------------------------------------------------------------- #
def _base_mensal(equipes: dict[str, int]) -> float:
    """Soma( valor_maximo_mensal * quantidade ) sobre as equipes do municipio."""
    total = 0.0
    for codigo, qtd in equipes.items():
        total += tipo_equipe(codigo).valor_maximo_mensal * qtd
    return total


def _casos_adicionais(res: ResultadoIndicador) -> int | None:
    """Quantos casos a mais no numerador para atingir a meta, se houver denominador."""
    if res.denominador is None or res.denominador <= 0:
        return None
    meta_fracao = res.indicador.meta_fracao
    numerador_necessario = math.ceil(meta_fracao * res.denominador)
    atual = res.numerador
    if atual is None:
        atual = round(res.resultado / 100.0 * res.denominador)
    return max(0, numerador_necessario - atual)


def avaliar_municipio(
    *,
    municipio: str,
    uf: str,
    ibge: str,
    equipes: dict[str, int],
    resultados: list[ResultadoIndicador],
    meses: int = MESES_POR_QUADRIMESTRE,
    apenas_reportados: bool = False,
) -> AvaliacaoMunicipio:
    """Avalia um municipio: calcula ISF, repasse e analise de lacunas por indicador.

    Args:
        municipio: nome do municipio.
        uf: sigla da unidade federativa.
        ibge: codigo IBGE do municipio.
        equipes: mapa {codigo_tipo_equipe: quantidade}, ex.: {"eSF": 12}.
        apenas_reportados: se True, calcula o ISF apenas sobre os indicadores
            informados, renormalizando pela soma dos pesos reportados (em vez de
            tratar os ausentes como nota 0). Util quando o dataset aberto nao
            publica todos os indicadores (ex.: I6 ausente em 2024).
        resultados: lista de ResultadoIndicador (um por indicador apurado).
        meses: meses do periodo de repasse (padrao = 1 quadrimestre = 4 meses).

    Returns:
        AvaliacaoMunicipio com ISF, repasses e prioridades.
    """
    por_codigo = {r.codigo: r for r in resultados}
    base_mensal = _base_mensal(equipes)

    # Conjunto de indicadores considerados no ISF.
    if apenas_reportados:
        considerados = [ind for ind in INDICADORES if ind.codigo in por_codigo]
    else:
        considerados = list(INDICADORES)
    peso_total = sum(ind.peso for ind in considerados) or PESO_TOTAL

    # Nota de cada indicador (0 para indicadores nao informados, no modo oficial).
    notas: dict[str, float] = {}
    for ind in considerados:
        res = por_codigo.get(ind.codigo)
        notas[ind.codigo] = nota_indicador(res.resultado, ind.meta) if res else 0.0

    isf_atual = sum(nota * indicador(c).peso for c, nota in notas.items()) / peso_total
    repasse_maximo = base_mensal * meses
    repasse_atual = (isf_atual / 10.0) * repasse_maximo

    # Analise por indicador.
    analises: list[AnaliseIndicador] = []
    for ind in considerados:
        res = por_codigo.get(ind.codigo) or ResultadoIndicador(ind.codigo, 0.0)
        nota = notas[ind.codigo]
        atingiu = nota >= 10.0
        lacuna_pp = max(0.0, ind.meta - res.resultado)

        # Ganho ao levar este indicador a meta (nota -> 10):
        #   delta_isf = (10 - nota) * peso / peso_total
        #   delta_repasse = (delta_isf / 10) * repasse_maximo
        delta_isf = (10.0 - nota) * ind.peso / peso_total
        ganho = (delta_isf / 10.0) * repasse_maximo
        reais_por_ponto = (ganho / lacuna_pp) if lacuna_pp > 0 else 0.0

        analises.append(
            AnaliseIndicador(
                codigo=ind.codigo,
                nome=ind.nome,
                meta=ind.meta,
                peso=ind.peso,
                resultado=res.resultado,
                nota=round(nota, 2),
                atingiu_meta=atingiu,
                lacuna_pp=round(lacuna_pp, 2),
                casos_adicionais=_casos_adicionais(res),
                ganho_potencial=round(ganho, 2),
                reais_por_ponto=round(reais_por_ponto, 2),
            )
        )

    return AvaliacaoMunicipio(
        municipio=municipio,
        uf=uf,
        ibge=ibge,
        isf=round(isf_atual, 2),
        repasse_atual=round(repasse_atual, 2),
        repasse_maximo=round(repasse_maximo, 2),
        repasse_potencial=round(repasse_maximo - repasse_atual, 2),
        base_mensal=round(base_mensal, 2),
        meses=meses,
        indicadores=analises,
    )

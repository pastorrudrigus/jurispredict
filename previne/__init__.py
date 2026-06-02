"""JurisPredict - Simulador de Pagamento por Desempenho do Previne Brasil.

Pacote que modela os indicadores de desempenho da Atencao Primaria a Saude (APS),
calcula o Indicador Sintetico Final (ISF) e simula o repasse financeiro federal
que um municipio recebe -- e quanto ele PODERIA receber ao atingir as metas.

Base normativa:
  - Portaria GM/MS no 2.979/2019 (institui o Previne Brasil)
  - Portaria GM/MS no 102/2022 (define metas e pesos dos indicadores)
  - Notas Tecnicas SAPS/MS 13-19/2022
"""

from previne.indicators import INDICADORES, Indicador
from previne.calculator import (
    ResultadoIndicador,
    AvaliacaoMunicipio,
    avaliar_municipio,
    nota_indicador,
    isf,
)
from previne.patient import (
    Paciente,
    PendenciaEquipe,
    analisar_equipes,
    gerar_amostra_sintetica,
)
from previne.convenio import Convenio, ConvenioDataSUS, pseudonimizar
from previne.cnes import estimar_equipes, equipes_estimadas_municipio, parse_cnes_equipes_csv

__all__ = [
    "INDICADORES",
    "Indicador",
    "ResultadoIndicador",
    "AvaliacaoMunicipio",
    "avaliar_municipio",
    "nota_indicador",
    "isf",
    "Paciente",
    "PendenciaEquipe",
    "analisar_equipes",
    "gerar_amostra_sintetica",
    "Convenio",
    "ConvenioDataSUS",
    "pseudonimizar",
    "estimar_equipes",
    "equipes_estimadas_municipio",
    "parse_cnes_equipes_csv",
]

__version__ = "0.1.0"

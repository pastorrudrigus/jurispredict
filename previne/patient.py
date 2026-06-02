"""Analise em granularidade de PACIENTE e geracao de instrucoes por equipe.

Enquanto o componente agregado (previne.calculator) diz *quanto* recurso esta na
mesa, este modulo diz *quem* precisa ser atendido e *qual equipe* deve agir.

A logica:
  1. Cada paciente tem atributos clinicos (gestante, hipertenso, idade, exames...).
  2. Para cada indicador definimos:
        - elegivel(p): o paciente entra no DENOMINADOR daquele indicador?
        - atendido(p): o paciente ja conta no NUMERADOR (criterio cumprido)?
  3. Agrupamos por equipe (codigo INE) e calculamos, por indicador:
        - cobertura atual da equipe
        - quantos pacientes faltam para a equipe bater a meta
        - a LISTA NOMINAL de pacientes pendentes (worklist acionavel)
        - uma instrucao em texto para a equipe

IMPORTANTE (LGPD): dados em nivel de paciente sao dados pessoais sensiveis de
saude. Este modulo opera sobre identificadores JA PSEUDONIMIZADOS (ver
previne.convenio). Nenhuma funcao aqui exige CPF/CNS em claro.
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable
from dataclasses import dataclass, field

from previne.indicators import INDICADORES, indicador


# --------------------------------------------------------------------------- #
# Modelo do paciente (pseudonimizado)
# --------------------------------------------------------------------------- #
@dataclass
class Paciente:
    """Registro de um cidadao acompanhado pela APS, em nivel individual.

    `pid` e um identificador PSEUDONIMIZADO (hash do CNS/CPF) -- nunca o documento
    em claro. `equipe_ine` e o codigo INE da equipe responsavel.
    """

    pid: str
    equipe_ine: str
    equipe_nome: str = ""
    idade: int | None = None
    sexo: str = ""                      # "F" / "M"
    gestante: bool = False
    hipertenso: bool = False
    diabetico: bool = False
    # Criterios de numerador (o que ja foi feito):
    consultas_prenatal: int = 0
    primeira_consulta_semana: int | None = None
    exame_sifilis: bool = False
    exame_hiv: bool = False
    atend_odontologico: bool = False
    citopatologico_em_dia: bool = False  # coleta nos ultimos 3 anos
    vacina_penta: bool = False
    vacina_polio: bool = False
    consulta_no_semestre: bool = False
    pa_aferida: bool = False
    hba1c_solicitada: bool = False


# --------------------------------------------------------------------------- #
# Regras por indicador: (elegivel, atendido)
# --------------------------------------------------------------------------- #
Regra = tuple[Callable[[Paciente], bool], Callable[[Paciente], bool]]

REGRAS: dict[str, Regra] = {
    "I1": (
        lambda p: p.gestante,
        lambda p: p.consultas_prenatal >= 6
        and p.primeira_consulta_semana is not None
        and p.primeira_consulta_semana <= 12,
    ),
    "I2": (
        lambda p: p.gestante,
        lambda p: p.exame_sifilis and p.exame_hiv,
    ),
    "I3": (
        lambda p: p.gestante,
        lambda p: p.atend_odontologico,
    ),
    "I4": (
        lambda p: p.sexo == "F" and p.idade is not None and 25 <= p.idade <= 64,
        lambda p: p.citopatologico_em_dia,
    ),
    "I5": (
        lambda p: p.idade == 1,
        lambda p: p.vacina_penta and p.vacina_polio,
    ),
    "I6": (
        lambda p: p.hipertenso,
        lambda p: p.consulta_no_semestre and p.pa_aferida,
    ),
    "I7": (
        lambda p: p.diabetico,
        lambda p: p.consulta_no_semestre and p.hba1c_solicitada,
    ),
}


# --------------------------------------------------------------------------- #
# Resultado por equipe/indicador
# --------------------------------------------------------------------------- #
@dataclass
class PendenciaEquipe:
    """Diagnostico de uma equipe em um indicador, com worklist de pacientes."""

    equipe_ine: str
    equipe_nome: str
    indicador: str
    indicador_nome: str
    meta: float
    elegiveis: int
    atendidos: int
    cobertura: float                       # % atual
    faltam_para_meta: int                  # pacientes a converter para bater a meta
    pacientes_pendentes: list[str]         # pids elegiveis e ainda nao atendidos
    instrucao: str


def _instrucao(p: PendenciaEquipe) -> str:
    """Monta a instrucao textual para a equipe."""
    ind = indicador(p.indicador)
    if p.elegiveis == 0:
        return f"Sem pacientes elegiveis para '{ind.nome}' nesta equipe."
    if p.faltam_para_meta == 0:
        return (
            f"Meta de '{ind.nome}' atingida ({p.cobertura:.0f}% >= {p.meta:.0f}%). "
            "Manter o acompanhamento."
        )
    alvo = ", ".join(p.pacientes_pendentes[: p.faltam_para_meta]) or "—"
    return (
        f"'{ind.nome}': cobertura {p.atendidos}/{p.elegiveis} ({p.cobertura:.0f}%), "
        f"meta {p.meta:.0f}%. Converter +{p.faltam_para_meta} paciente(s). "
        f"Acionar prioritariamente: {alvo}."
    )


def analisar_equipe_indicador(
    pacientes: list[Paciente], equipe_ine: str, codigo_indicador: str
) -> PendenciaEquipe:
    """Avalia uma equipe em um indicador especifico."""
    ind = indicador(codigo_indicador)
    elegivel, atendido = REGRAS[codigo_indicador]
    da_equipe = [p for p in pacientes if p.equipe_ine == equipe_ine]
    nome = next((p.equipe_nome for p in da_equipe if p.equipe_nome), equipe_ine)

    elegiveis = [p for p in da_equipe if elegivel(p)]
    atendidos = [p for p in elegiveis if atendido(p)]
    pendentes = [p.pid for p in elegiveis if not atendido(p)]

    n_eleg = len(elegiveis)
    n_atend = len(atendidos)
    cobertura = (n_atend / n_eleg * 100.0) if n_eleg else 0.0

    # Quantos converter para bater a meta da propria equipe.
    if n_eleg:
        alvo_numerador = math.ceil(ind.meta_fracao * n_eleg)
        faltam = max(0, alvo_numerador - n_atend)
    else:
        faltam = 0

    resultado = PendenciaEquipe(
        equipe_ine=equipe_ine,
        equipe_nome=nome,
        indicador=codigo_indicador,
        indicador_nome=ind.nome,
        meta=ind.meta,
        elegiveis=n_eleg,
        atendidos=n_atend,
        cobertura=round(cobertura, 1),
        faltam_para_meta=faltam,
        pacientes_pendentes=pendentes,
        instrucao="",
    )
    resultado.instrucao = _instrucao(resultado)
    return resultado


def analisar_equipes(pacientes: list[Paciente]) -> list[PendenciaEquipe]:
    """Avalia todas as equipes em todos os indicadores.

    Retorna apenas combinacoes equipe/indicador com ao menos 1 paciente elegivel,
    ordenadas por equipe e por numero de pacientes faltando (descendente).
    """
    ines = sorted({p.equipe_ine for p in pacientes})
    saida: list[PendenciaEquipe] = []
    for ine in ines:
        for ind in INDICADORES:
            pend = analisar_equipe_indicador(pacientes, ine, ind.codigo)
            if pend.elegiveis > 0:
                saida.append(pend)
    saida.sort(key=lambda x: (x.equipe_ine, -x.faltam_para_meta))
    return saida


# --------------------------------------------------------------------------- #
# Amostra sintetica para demonstracao (sem dados reais / sem PII)
# --------------------------------------------------------------------------- #
def gerar_amostra_sintetica(
    *, equipes: list[tuple[str, str]] | None = None, por_equipe: int = 120, seed: int = 42
) -> list[Paciente]:
    """Gera uma populacao sintetica de pacientes para demonstrar o modulo.

    Nenhum dado real e usado: tudo e gerado de forma aleatoria e deterministica
    (mesma seed => mesma amostra). Serve apenas para exercitar a logica.
    """
    if equipes is None:
        equipes = [
            ("0000000001", "ESF Jardim Goias"),
            ("0000000002", "ESF Setor Sul"),
            ("0000000003", "ESF Campinas"),
        ]
    rng = random.Random(seed)
    pacientes: list[Paciente] = []
    contador = 0
    for ine, nome in equipes:
        for _ in range(por_equipe):
            contador += 1
            pid = f"P-{contador:05d}"
            idade = rng.choices(
                [1, rng.randint(2, 24), rng.randint(25, 64), rng.randint(65, 90)],
                weights=[6, 25, 45, 24],
            )[0]
            sexo = rng.choice(["F", "M"])
            gestante = sexo == "F" and 15 <= idade <= 45 and rng.random() < 0.18
            hipertenso = idade >= 40 and rng.random() < 0.30
            diabetico = idade >= 40 and rng.random() < 0.18
            p = Paciente(
                pid=pid,
                equipe_ine=ine,
                equipe_nome=nome,
                idade=idade,
                sexo=sexo,
                gestante=gestante,
                hipertenso=hipertenso,
                diabetico=diabetico,
                consultas_prenatal=rng.randint(0, 9) if gestante else 0,
                primeira_consulta_semana=rng.randint(6, 20) if gestante else None,
                exame_sifilis=gestante and rng.random() < 0.7,
                exame_hiv=gestante and rng.random() < 0.7,
                atend_odontologico=gestante and rng.random() < 0.35,
                citopatologico_em_dia=(sexo == "F" and rng.random() < 0.45),
                vacina_penta=(idade == 1 and rng.random() < 0.85),
                vacina_polio=(idade == 1 and rng.random() < 0.85),
                consulta_no_semestre=rng.random() < 0.6,
                pa_aferida=rng.random() < 0.5,
                hba1c_solicitada=rng.random() < 0.5,
            )
            pacientes.append(p)
    return pacientes

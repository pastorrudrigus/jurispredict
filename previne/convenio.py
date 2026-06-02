"""Conector de dados em nivel de paciente via convenio/termo de cessao com o DataSUS.

Os dados AGREGADOS do Previne Brasil sao abertos (ver previne.datasus). Ja os
dados em NIVEL DE PACIENTE (registros individualizados do SISAB/e-SUS APS) sao
dados pessoais sensiveis de saude e NAO sao publicos: exigem instrumento formal.

Este modulo estrutura esse acesso de forma responsavel:

  - `Convenio` registra a base legal e a finalidade do tratamento (LGPD).
  - `pseudonimizar()` converte CNS/CPF em um identificador estavel e irreversivel
    (hash com sal) ANTES de qualquer processamento -- o restante do sistema nunca
    ve o documento em claro.
  - `carregar_extrato()` le um extrato individualizado (CSV/JSON) ja autorizado e
    o converte em objetos `Paciente` pseudonimizados.

Base legal tipica (Brasil):
  - LGPD (Lei 13.709/2018) art. 7, III e art. 11, II, 'b' e 'f': tratamento de
    dados de saude por orgaos publicos para execucao de politica publica.
  - Termo de cessao/convenio entre o ente municipal e o Ministerio da Saude/DataSUS.

Sem o instrumento autorizativo, use apenas dados agregados (datasus.py) ou a
amostra SINTETICA (patient.gerar_amostra_sintetica) para demonstracao.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from previne.patient import Paciente


@dataclass
class Convenio:
    """Metadados do instrumento que autoriza o acesso a dados individualizados."""

    ente: str                          # ex.: "Secretaria Municipal de Saude de Goiania"
    numero_termo: str                  # identificacao do termo de cessao/convenio
    finalidade: str                    # finalidade especifica do tratamento (LGPD)
    base_legal: str = "LGPD art. 11, II, 'b' (politica publica de saude)"
    vigencia_ate: date | None = None
    sal: str = ""                      # sal para pseudonimizacao (mantido em segredo)

    def vigente(self, em: date | None = None) -> bool:
        """Indica se o convenio esta vigente na data informada (padrao: hoje)."""
        if self.vigencia_ate is None:
            return True
        return (em or date.today()) <= self.vigencia_ate


def pseudonimizar(documento: str, sal: str) -> str:
    """Gera um pseudonimo estavel e irreversivel a partir de CNS/CPF + sal.

    Usa SHA-256(sal + documento). O mesmo documento sempre gera o mesmo pseudonimo
    (permite reconciliar o paciente entre extratos), mas o documento original nao
    pode ser recuperado a partir do pseudonimo.
    """
    documento_limpo = "".join(ch for ch in str(documento) if ch.isalnum())
    digest = hashlib.sha256((sal + documento_limpo).encode("utf-8")).hexdigest()
    return f"P-{digest[:16]}"


def _bool(valor: object) -> bool:
    """Interpreta valores comuns de extratos como booleano."""
    return str(valor).strip().lower() in {"1", "true", "sim", "s", "t", "y", "yes"}


def _int(valor: object) -> int | None:
    try:
        return int(float(str(valor).strip()))
    except (ValueError, TypeError):
        return None


class ConvenioDataSUS:
    """Carrega extratos individualizados autorizados, sempre pseudonimizando."""

    # Campo do documento que deve ser pseudonimizado e NUNCA propagado em claro.
    CAMPO_DOCUMENTO = "cns"

    def __init__(self, convenio: Convenio) -> None:
        if not convenio.vigente():
            raise PermissionError("Convenio fora de vigencia: acesso negado.")
        if not convenio.sal:
            raise ValueError("Convenio sem 'sal' configurado para pseudonimizacao.")
        self.convenio = convenio

    def _linha_para_paciente(self, linha: dict) -> Paciente:
        """Converte uma linha de extrato (dict) em Paciente pseudonimizado."""
        documento = linha.get(self.CAMPO_DOCUMENTO) or linha.get("cpf") or ""
        pid = pseudonimizar(documento, self.convenio.sal)
        return Paciente(
            pid=pid,
            equipe_ine=str(linha.get("ine", "")).strip(),
            equipe_nome=str(linha.get("equipe", "")).strip(),
            idade=_int(linha.get("idade")),
            sexo=str(linha.get("sexo", "")).strip().upper()[:1],
            gestante=_bool(linha.get("gestante")),
            hipertenso=_bool(linha.get("hipertenso")),
            diabetico=_bool(linha.get("diabetico")),
            consultas_prenatal=_int(linha.get("consultas_prenatal")) or 0,
            primeira_consulta_semana=_int(linha.get("primeira_consulta_semana")),
            exame_sifilis=_bool(linha.get("exame_sifilis")),
            exame_hiv=_bool(linha.get("exame_hiv")),
            atend_odontologico=_bool(linha.get("atend_odontologico")),
            citopatologico_em_dia=_bool(linha.get("citopatologico_em_dia")),
            vacina_penta=_bool(linha.get("vacina_penta")),
            vacina_polio=_bool(linha.get("vacina_polio")),
            consulta_no_semestre=_bool(linha.get("consulta_no_semestre")),
            pa_aferida=_bool(linha.get("pa_aferida")),
            hba1c_solicitada=_bool(linha.get("hba1c_solicitada")),
        )

    def carregar_csv(self, caminho: str | Path, *, delimiter: str = ";") -> list[Paciente]:
        """Carrega um extrato CSV individualizado, pseudonimizando documentos."""
        texto = Path(caminho).read_text(encoding="utf-8", errors="replace")
        leitor = csv.DictReader(io.StringIO(texto), delimiter=delimiter)
        return [self._linha_para_paciente(linha) for linha in leitor]

    def carregar_json(self, caminho: str | Path) -> list[Paciente]:
        """Carrega um extrato JSON individualizado (lista de objetos)."""
        dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
        return [self._linha_para_paciente(linha) for linha in dados]

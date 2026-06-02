"""Repositorio de dados de municipios.

Carrega registros de municipios (codigo, equipes, resultados dos indicadores) e
os converte em avaliacoes. Por padrao usa o arquivo de exemplo embarcado, o que
permite rodar e demonstrar a aplicacao sem depender de rede.

Em producao, alimente este repositorio com dados ingeridos do DataSUS/SISAB
(ver previne.datasus e previne.ingest).
"""

from __future__ import annotations

import json
from importlib import resources
from pathlib import Path

from previne.calculator import AvaliacaoMunicipio, ResultadoIndicador, avaliar_municipio


def _registros_de_dict(dados: list[dict]) -> dict[str, dict]:
    """Indexa registros de municipio por codigo IBGE."""
    return {str(d["ibge"]): d for d in dados}


class MunicipioRepository:
    """Acesso a dados de municipios e geracao de avaliacoes."""

    def __init__(self, registros: dict[str, dict]) -> None:
        self._registros = registros

    @classmethod
    def from_exemplo(cls) -> "MunicipioRepository":
        """Carrega o conjunto de dados de exemplo embarcado no pacote."""
        texto = (
            resources.files("previne.data")
            .joinpath("municipios_exemplo.json")
            .read_text(encoding="utf-8")
        )
        return cls(_registros_de_dict(json.loads(texto)))

    @classmethod
    def from_json(cls, caminho: str | Path) -> "MunicipioRepository":
        """Carrega dados de um arquivo JSON externo."""
        texto = Path(caminho).read_text(encoding="utf-8")
        return cls(_registros_de_dict(json.loads(texto)))

    def listar(self) -> list[dict]:
        """Lista os registros brutos (ibge, municipio, uf, ...)."""
        return list(self._registros.values())

    def ibges(self) -> list[str]:
        """Lista os codigos IBGE disponiveis."""
        return list(self._registros.keys())

    def obter(self, ibge: str) -> dict | None:
        """Retorna o registro bruto de um municipio pelo codigo IBGE."""
        return self._registros.get(str(ibge))

    def avaliar(self, ibge: str, meses: int = 4) -> AvaliacaoMunicipio | None:
        """Gera a AvaliacaoMunicipio para o codigo IBGE informado."""
        reg = self.obter(ibge)
        if reg is None:
            return None
        resultados = [
            ResultadoIndicador(
                codigo=r["codigo"],
                resultado=float(r["resultado"]),
                numerador=r.get("numerador"),
                denominador=r.get("denominador"),
            )
            for r in reg.get("resultados", [])
        ]
        return avaliar_municipio(
            municipio=reg["municipio"],
            uf=reg["uf"],
            ibge=str(reg["ibge"]),
            equipes={k: int(v) for k, v in reg.get("equipes", {}).items()},
            resultados=resultados,
            meses=meses,
        )

    def avaliar_todos(self, meses: int = 4) -> list[AvaliacaoMunicipio]:
        """Avalia todos os municipios do repositorio."""
        return [a for ibge in self.ibges() if (a := self.avaliar(ibge, meses))]

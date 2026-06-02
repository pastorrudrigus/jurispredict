"""Cliente para obter dados de desempenho da APS no DataSUS / Dados Abertos do SUS.

Duas fontes sao suportadas:

  1. API de Dados Abertos do SUS (CKAN) -- dataset "indicadores_desempenho_sisab":
         https://dadosabertos.saude.gov.br/dataset/indicadores_desempenho_sisab
         API:  https://apidadosabertos.saude.gov.br/api/3/action/...
     Contem a serie historica nacional (2018-2024) com desagregacao municipal.

  2. CSV exportado do painel publico do SISAB (Excel/CSV/ODS), sem autenticacao:
         https://sisab.saude.gov.br/.../indicadorPainel.xhtml

Observacoes importantes:
  - A atualizacao oficial e quadrimestral (defasagem de ~2 a 4 meses).
  - O acesso programatico via CKAN funciona, mas a documentacao de endpoints e
    esparsa; por isso o mapeamento de colunas e configuravel (CAMPOS_SISAB).
  - Se nao houver rede, use previne.repository (dados de exemplo) para demonstrar.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

import httpx

from previne.calculator import ResultadoIndicador


# Endpoint base da API de Dados Abertos do SUS (CKAN).
CKAN_BASE = "https://apidadosabertos.saude.gov.br"
DATASET_INDICADORES = "indicadores_desempenho_sisab"

# Mapeamento dos codigos de indicador deste projeto -> rotulos comuns no SISAB.
# Ajuste conforme o cabecalho real do arquivo baixado.
CAMPOS_SISAB: dict[str, tuple[str, ...]] = {
    "I1": ("pre-natal", "pre natal", "prenatal", "6 consultas"),
    "I2": ("sifilis", "hiv"),
    "I3": ("odontolog",),
    "I4": ("citopatolog", "colo"),
    "I5": ("vacina", "penta", "polio"),
    "I6": ("hipertens", "pressao"),
    "I7": ("diabet", "glicada", "hba1c"),
}


@dataclass
class RecursoCKAN:
    """Metadados de um recurso (arquivo) publicado em um dataset CKAN."""

    id: str
    nome: str
    formato: str
    url: str


class DataSUSClient:
    """Cliente HTTP para a API de Dados Abertos do SUS (CKAN)."""

    def __init__(self, base_url: str = CKAN_BASE, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(timeout=timeout, follow_redirects=True)

    def __enter__(self) -> "DataSUSClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _action(self, action: str, **params: object) -> dict:
        """Chama uma action da API CKAN (ex.: package_show, datastore_search)."""
        url = f"{self.base_url}/api/3/action/{action}"
        resp = self._client.get(url, params=params)
        resp.raise_for_status()
        payload = resp.json()
        if not payload.get("success", False):
            raise RuntimeError(f"CKAN action '{action}' falhou: {payload}")
        return payload["result"]

    def listar_recursos(self, dataset: str = DATASET_INDICADORES) -> list[RecursoCKAN]:
        """Lista os recursos (arquivos) de um dataset CKAN."""
        result = self._action("package_show", id=dataset)
        recursos = []
        for r in result.get("resources", []):
            recursos.append(
                RecursoCKAN(
                    id=r.get("id", ""),
                    nome=r.get("name", ""),
                    formato=(r.get("format", "") or "").upper(),
                    url=r.get("url", ""),
                )
            )
        return recursos

    def buscar_datastore(
        self, resource_id: str, *, q: str | None = None, limit: int = 1000
    ) -> list[dict]:
        """Consulta registros de um recurso via datastore_search (se indexado)."""
        params: dict[str, object] = {"resource_id": resource_id, "limit": limit}
        if q:
            params["q"] = q
        result = self._action("datastore_search", **params)
        return result.get("records", [])

    def baixar_csv(self, url: str) -> str:
        """Baixa o conteudo bruto de um arquivo (CSV) por URL."""
        resp = self._client.get(url)
        resp.raise_for_status()
        return resp.text


# --------------------------------------------------------------------------- #
# Parsing de CSV exportado do SISAB
# --------------------------------------------------------------------------- #
def _detectar_codigo(cabecalho: str) -> str | None:
    """Identifica a qual indicador (I1..I7) uma coluna pertence pelo nome."""
    texto = cabecalho.strip().lower()
    for codigo, termos in CAMPOS_SISAB.items():
        if any(t in texto for t in termos):
            return codigo
    return None


def parse_csv_sisab(
    conteudo: str, *, delimiter: str = ";"
) -> dict[str, list[ResultadoIndicador]]:
    """Converte um CSV do SISAB em {ibge: [ResultadoIndicador, ...]}.

    O parser e tolerante: localiza colunas de percentual cujo cabecalho casa com
    os termos em CAMPOS_SISAB. Espera uma coluna de codigo IBGE do municipio.

    Returns:
        Mapa de codigo IBGE -> lista de ResultadoIndicador.
    """
    leitor = csv.DictReader(io.StringIO(conteudo), delimiter=delimiter)
    if not leitor.fieldnames:
        return {}

    # Localiza a coluna de IBGE e mapeia colunas -> codigo de indicador.
    col_ibge = next(
        (c for c in leitor.fieldnames if "ibge" in c.lower() or "municipio" in c.lower()),
        None,
    )
    col_indicador = {
        c: cod for c in leitor.fieldnames if (cod := _detectar_codigo(c)) is not None
    }

    saida: dict[str, list[ResultadoIndicador]] = {}
    for linha in leitor:
        ibge = (linha.get(col_ibge, "") if col_ibge else "").strip()
        if not ibge:
            continue
        resultados: list[ResultadoIndicador] = []
        for coluna, codigo in col_indicador.items():
            bruto = (linha.get(coluna) or "").replace("%", "").replace(",", ".").strip()
            try:
                valor = float(bruto)
            except ValueError:
                continue
            resultados.append(ResultadoIndicador(codigo=codigo, resultado=valor))
        if resultados:
            saida[ibge] = resultados
    return saida

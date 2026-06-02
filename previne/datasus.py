"""Cliente para obter dados de desempenho da APS no DataSUS / Dados Abertos do SUS.

Fonte principal (VERIFICADA em 2026): API de Dados Abertos do SUS (DEMAS), que
substituiu o antigo CKAN. Endpoint REST publico, sem autenticacao:

    GET https://apidadosabertos.saude.gov.br
        /atencao-primaria/indicador-desempenho-programa-previne-brasil
        ?codigo_municipio=520870&quadrimestre=2024Q2&limit=...&offset=...

Resposta: {"sisab_indicador_desempenho": [ { ... }, ... ]}, um objeto por
indicador x visao_equipe (homologadas | validas | geral).

Detalhes importantes (observados na pratica):
  - codigo_municipio usa o IBGE de 6 DIGITOS (sem o digito verificador).
    Goiania 5208707 -> 520870. Enviar 7 digitos retorna 200 com lista VAZIA.
  - O campo `percentual` da API e ambiguo (aparece constante entre indicadores do
    mesmo grupo); por isso calculamos o resultado como numerador/denominador.
  - O mapeamento codigo_tipo_indicador -> I1..I7 e configuravel (CODIGO_TIPO_*)
    e deve ser validado contra a Nota Tecnica oficial antes de uso normativo.
  - Cobertura atual: 2024Q1..2024Q3 (serie historica do Previne Brasil ate 2024).
  - O servidor pode apresentar erro de TLS intermitente; ha retry com backoff.

Fonte alternativa: CSV exportado do painel do SISAB (parse_csv_sisab). O painel
detalhado (indicadorPainel.xhtml) exige login no e-Gestor APS e fluxo com
JSESSIONID + ViewState (JSF), portanto nao e um GET simples.
"""

from __future__ import annotations

import csv
import io
import time

import httpx

from previne.calculator import ResultadoIndicador


# Endpoint REST da API de Dados Abertos do SUS (DEMAS).
DEMAS_BASE = "https://apidadosabertos.saude.gov.br"
ENDPOINT_PREVINE = "/atencao-primaria/indicador-desempenho-programa-previne-brasil"
ENDPOINT_CADASTRO = "/atencao-primaria/cadastro-vinculado-programa-previne-brasil"

# Mapeamento codigo_tipo_indicador (SISAB) -> codigo deste projeto.
# ATENCAO: validar contra a Nota Tecnica oficial. O codigo 60 (I6 hipertensos)
# pode nao constar em todos os quadrimestres/municipios do dataset publico.
CODIGO_TIPO_INDICADOR: dict[int, str] = {
    10: "I1",  # pre-natal (6+ consultas)
    20: "I2",  # sifilis e HIV em gestantes
    30: "I3",  # odontologico em gestantes
    40: "I4",  # citopatologico
    50: "I5",  # vacinacao infantil
    60: "I6",  # hipertensos
    70: "I7",  # diabeticos
}

# Visao de equipe usada por padrao (base de pagamento usa equipes homologadas).
VISAO_PADRAO = "homologadas"

# Mapeamento de colunas para o parser de CSV do painel do SISAB (fallback).
CAMPOS_SISAB: dict[str, tuple[str, ...]] = {
    "I1": ("pre-natal", "pre natal", "prenatal", "6 consultas"),
    "I2": ("sifilis", "hiv"),
    "I3": ("odontolog",),
    "I4": ("citopatolog", "colo"),
    "I5": ("vacina", "penta", "polio"),
    "I6": ("hipertens", "pressao"),
    "I7": ("diabet", "glicada", "hba1c"),
}


def ibge6(codigo_ibge: str | int) -> int:
    """Converte um codigo IBGE de 7 digitos para os 6 digitos exigidos pela API."""
    digitos = "".join(ch for ch in str(codigo_ibge) if ch.isdigit())
    if len(digitos) == 7:
        digitos = digitos[:6]  # remove o digito verificador
    return int(digitos)


def _resultado_de_registro(reg: dict) -> ResultadoIndicador | None:
    """Converte um registro da API em ResultadoIndicador (resultado = num/den)."""
    codigo = CODIGO_TIPO_INDICADOR.get(int(reg.get("codigo_tipo_indicador", -1)))
    if codigo is None:
        return None
    numerador = reg.get("numerador")
    denominador = reg.get("denominador_identificado") or reg.get("denominador_utilizador")
    if not denominador:
        return None
    resultado = round(float(numerador) / float(denominador) * 100.0, 1)
    return ResultadoIndicador(
        codigo=codigo,
        resultado=resultado,
        numerador=int(numerador),
        denominador=int(denominador),
    )


class DataSUSClient:
    """Cliente HTTP para a API de Dados Abertos do SUS (DEMAS)."""

    def __init__(
        self, base_url: str = DEMAS_BASE, timeout: float = 30.0, tentativas: int = 4
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.tentativas = tentativas
        self._client = httpx.Client(timeout=timeout, follow_redirects=True)

    def __enter__(self) -> "DataSUSClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _get(self, path: str, params: dict) -> httpx.Response:
        """GET com retry e backoff exponencial (o servidor tem TLS intermitente)."""
        ultimo_erro: Exception | None = None
        for i in range(self.tentativas):
            try:
                resp = self._client.get(f"{self.base_url}{path}", params=params)
                resp.raise_for_status()
                return resp
            except (httpx.TransportError, httpx.HTTPStatusError) as e:
                ultimo_erro = e
                if i < self.tentativas - 1:
                    time.sleep(2 ** i)
        raise RuntimeError(f"Falha ao acessar {path}: {ultimo_erro}")

    def buscar_indicadores_previne(
        self,
        codigo_ibge: str | int,
        *,
        quadrimestre: str = "2024Q2",
        visao: str = VISAO_PADRAO,
        limit: int = 100,
    ) -> list[ResultadoIndicador]:
        """Busca os indicadores do Previne Brasil de um municipio (dados reais).

        Args:
            codigo_ibge: codigo IBGE (6 ou 7 digitos; convertido automaticamente).
            quadrimestre: ex.: "2024Q1", "2024Q2", "2024Q3".
            visao: "homologadas" (padrao), "validas" ou "geral".
            limit: maximo de registros por pagina.

        Returns:
            Lista de ResultadoIndicador (resultado = numerador/denominador*100).
        """
        resp = self._get(
            ENDPOINT_PREVINE,
            {"codigo_municipio": ibge6(codigo_ibge), "quadrimestre": quadrimestre, "limit": limit},
        )
        registros = resp.json().get("sisab_indicador_desempenho", [])
        resultados: list[ResultadoIndicador] = []
        for reg in registros:
            if reg.get("visao_equipe") != visao:
                continue
            r = _resultado_de_registro(reg)
            if r is not None:
                resultados.append(r)
        return resultados

    def pessoas_vinculadas(
        self, codigo_ibge: str | int, *, competencia: int | None = None, situacao: str = "homologadas"
    ) -> dict[str, float]:
        """Retorna as pessoas vinculadas por tipo de equipe (dado real do SISAB).

        Fonte: cadastro-vinculado (base da Capitacao Ponderada). Permite estimar o
        numero de equipes (ver previne.cnes.estimar_equipes).

        Args:
            codigo_ibge: codigo IBGE (6 ou 7 digitos).
            competencia: AAAAMM; se None, usa a competencia mais recente disponivel.
            situacao: "homologadas" (padrao), "validas" etc.

        Returns:
            Mapa {sigla_equipe: total_pessoas_vinculadas}, ex.: {"eSF": 716272.0}.
        """
        resp = self._get(
            ENDPOINT_CADASTRO, {"codigo_municipio_ibge": ibge6(codigo_ibge), "limit": 1000}
        )
        registros = resp.json().get("sisab_cadastro_vinculado", [])
        registros = [r for r in registros if r.get("situacao_equipe") == situacao]
        if not registros:
            return {}
        if competencia is None:
            competencia = max(r["competencia_referencia"] for r in registros)
        por_sigla: dict[str, float] = {}
        for r in registros:
            if r.get("competencia_referencia") != competencia:
                continue
            sigla = r.get("sigla_equipe", "")
            por_sigla[sigla] = por_sigla.get(sigla, 0.0) + float(
                r.get("pessoas_vinculadas_equipe_municipio") or 0
            )
        return por_sigla

    def baixar_csv(self, url: str) -> str:
        """Baixa o conteudo bruto de um arquivo (CSV) por URL."""
        resp = self._get_absoluto(url)
        return resp.text

    def _get_absoluto(self, url: str) -> httpx.Response:
        resp = self._client.get(url)
        resp.raise_for_status()
        return resp


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

"""API e dashboard web do JurisPredict.

Expoe:
  - GET /                      dashboard HTML (ranking de municipios)
  - GET /municipio/{ibge}      pagina detalhada de um municipio
  - GET /simulador             simulador interativo (sliders por indicador)
  - GET /equipes/{ibge}        pendencias por equipe (nivel de paciente)
  - GET /api/indicadores       definicao dos 7 indicadores
  - GET /api/municipios        avaliacao resumida de todos os municipios
  - GET /api/municipio/{ibge}  avaliacao completa de um municipio
  - POST /api/simular          simula uma avaliacao a partir de dados informados
  - GET /api/equipes/{ibge}    pendencias por equipe (amostra sintetica de pacientes)

Rode com:  uvicorn api.main:app --reload
"""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel, Field

from previne.calculator import ResultadoIndicador, avaliar_municipio
from previne.indicators import INDICADORES
from previne.financing import TIPOS_EQUIPE
from previne.repository import MunicipioRepository
from previne.patient import analisar_equipes, gerar_amostra_sintetica

app = FastAPI(
    title="JurisPredict - Previne Brasil",
    description="Simulador de Pagamento por Desempenho da APS para municipios.",
    version="0.1.0",
)

TEMPLATES = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

# Repositorio padrao: dados de exemplo embarcados (funciona offline).
repo = MunicipioRepository.from_exemplo()


def _fmt_brl(valor: float) -> str:
    """Formata um numero como moeda brasileira (R$ 1.234,56)."""
    return "R$ " + f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


TEMPLATES.env.filters["brl"] = _fmt_brl


# --------------------------------------------------------------------------- #
# Modelos de entrada da simulacao
# --------------------------------------------------------------------------- #
class ResultadoInput(BaseModel):
    codigo: str = Field(..., examples=["I1"])
    resultado: float = Field(..., ge=0, le=100)
    numerador: int | None = None
    denominador: int | None = None


class SimulacaoInput(BaseModel):
    municipio: str = "Municipio"
    uf: str = ""
    ibge: str = ""
    equipes: dict[str, int] = Field(default_factory=lambda: {"eSF": 1})
    resultados: list[ResultadoInput]
    meses: int = 4


# --------------------------------------------------------------------------- #
# Endpoints JSON
# --------------------------------------------------------------------------- #
@app.get("/api/indicadores")
def listar_indicadores() -> list[dict]:
    """Retorna a definicao dos 7 indicadores (meta, peso, descricao)."""
    return [asdict(ind) for ind in INDICADORES]


@app.get("/api/equipes")
def listar_equipes() -> list[dict]:
    """Retorna os tipos de equipe e valores maximos mensais."""
    return [asdict(t) for t in TIPOS_EQUIPE]


@app.get("/api/municipios")
def listar_municipios() -> list[dict]:
    """Avaliacao resumida de todos os municipios do repositorio."""
    avaliacoes = repo.avaliar_todos()
    avaliacoes.sort(key=lambda a: a.repasse_potencial, reverse=True)
    return [
        {
            "ibge": a.ibge,
            "municipio": a.municipio,
            "uf": a.uf,
            "isf": a.isf,
            "repasse_atual": a.repasse_atual,
            "repasse_maximo": a.repasse_maximo,
            "repasse_potencial": a.repasse_potencial,
            "percentual_aproveitado": round(a.percentual_aproveitado, 1),
        }
        for a in avaliacoes
    ]


@app.get("/api/municipio/{ibge}")
def detalhar_municipio(ibge: str) -> dict:
    """Avaliacao completa de um municipio (ISF, repasses e analise por indicador)."""
    avaliacao = repo.avaliar(ibge)
    if avaliacao is None:
        raise HTTPException(status_code=404, detail="Municipio nao encontrado")
    return asdict(avaliacao)


@app.post("/api/simular")
def simular(entrada: SimulacaoInput) -> dict:
    """Simula a avaliacao de um municipio a partir de dados informados."""
    resultados = [
        ResultadoIndicador(
            codigo=r.codigo,
            resultado=r.resultado,
            numerador=r.numerador,
            denominador=r.denominador,
        )
        for r in entrada.resultados
    ]
    avaliacao = avaliar_municipio(
        municipio=entrada.municipio,
        uf=entrada.uf,
        ibge=entrada.ibge,
        equipes=entrada.equipes,
        resultados=resultados,
        meses=entrada.meses,
    )
    return asdict(avaliacao)


@app.get("/api/equipes/{ibge}")
def pendencias_equipes(ibge: str) -> dict:
    """Pendencias por equipe em nivel de paciente.

    DEMONSTRACAO: usa uma amostra SINTETICA de pacientes (sem dados reais/PII).
    Em producao, alimente com extratos individualizados autorizados via
    previne.convenio.ConvenioDataSUS.
    """
    avaliacao = repo.avaliar(ibge)
    nome = avaliacao.municipio if avaliacao else ibge
    pacientes = gerar_amostra_sintetica()
    pendencias = analisar_equipes(pacientes)
    return {
        "ibge": ibge,
        "municipio": nome,
        "fonte": "amostra sintetica (demonstracao)",
        "pendencias": [asdict(p) for p in pendencias],
    }


# --------------------------------------------------------------------------- #
# Paginas HTML
# --------------------------------------------------------------------------- #
@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request) -> HTMLResponse:
    """Dashboard com ranking de municipios por recurso deixado na mesa."""
    avaliacoes = repo.avaliar_todos()
    avaliacoes.sort(key=lambda a: a.repasse_potencial, reverse=True)
    total_potencial = sum(a.repasse_potencial for a in avaliacoes)
    return TEMPLATES.TemplateResponse(
        request,
        "dashboard.html",
        {"avaliacoes": avaliacoes, "total_potencial": total_potencial},
    )


@app.get("/municipio/{ibge}", response_class=HTMLResponse)
def pagina_municipio(request: Request, ibge: str) -> HTMLResponse:
    """Pagina detalhada de um municipio com prioridades de esforco."""
    avaliacao = repo.avaliar(ibge)
    if avaliacao is None:
        raise HTTPException(status_code=404, detail="Municipio nao encontrado")
    return TEMPLATES.TemplateResponse(
        request,
        "municipio.html",
        {"a": avaliacao, "prioridades": avaliacao.prioridades()},
    )


@app.get("/simulador", response_class=HTMLResponse)
def pagina_simulador(request: Request, ibge: str = "5208707") -> HTMLResponse:
    """Simulador interativo com sliders por indicador, pre-carregado com um municipio."""
    avaliacao = repo.avaliar(ibge)
    registro = repo.obter(ibge)
    if avaliacao is None:  # fallback: primeiro municipio disponivel
        avaliacao = repo.avaliar_todos()[0]
        registro = repo.obter(avaliacao.ibge)
    return TEMPLATES.TemplateResponse(
        request,
        "simulador.html",
        {
            "a": avaliacao,
            "equipes_municipio": (registro or {}).get("equipes", {"eSF": 1}),
            "indicadores": [asdict(i) for i in INDICADORES],
            "equipes": [asdict(t) for t in TIPOS_EQUIPE],
        },
    )


@app.get("/equipes/{ibge}", response_class=HTMLResponse)
def pagina_equipes(request: Request, ibge: str) -> HTMLResponse:
    """Pagina com pendencias por equipe (worklists em nivel de paciente)."""
    avaliacao = repo.avaliar(ibge)
    nome = avaliacao.municipio if avaliacao else ibge
    pacientes = gerar_amostra_sintetica()
    pendencias = analisar_equipes(pacientes)
    # Agrupa por equipe para exibicao.
    por_equipe: dict[str, list] = {}
    for p in pendencias:
        por_equipe.setdefault(p.equipe_nome, []).append(p)
    return TEMPLATES.TemplateResponse(
        request,
        "equipes.html",
        {"municipio": nome, "ibge": ibge, "por_equipe": por_equipe},
    )

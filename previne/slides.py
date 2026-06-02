"""Gerador de apresentacao em PDF (deck de slides) em Python puro, sem dependencias.

Produz um PDF A4 paisagem com um slide por pagina: faixa de titulo colorida,
titulo, bullets e uma linha de destaque opcional. E uma versao imprimivel/enviavel
da apresentacao reveal.js servida em /apresentacao.

Mantido sem libs externas (auditabilidade); usa Helvetica e Helvetica-Bold.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field

from previne.calculator import AvaliacaoMunicipio

# Paleta gov.br (fracoes 0-1 para o operador rg do PDF).
AZUL = (0.075, 0.32, 0.71)
AZUL_ESCURO = (0.047, 0.196, 0.435)
VERDE = (0.086, 0.533, 0.129)
VERMELHO = (0.831, 0.208, 0.110)
PRETO = (0.1, 0.1, 0.1)
BRANCO = (1, 1, 1)
CINZA = (0.4, 0.4, 0.4)


@dataclass
class Slide:
    """Um slide do deck."""

    titulo: str
    bullets: list[str] = field(default_factory=list)
    destaque: str = ""                 # linha grande em destaque (opcional)
    capa: bool = False                 # slide de capa (fundo azul)


def _esc(texto: str) -> str:
    saida = texto.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return saida.encode("latin-1", "replace").decode("latin-1")


def _rg(cor: tuple[float, float, float]) -> str:
    return f"{cor[0]:.3f} {cor[1]:.3f} {cor[2]:.3f} rg"


def _texto(x: int, y: int, s: str, *, fonte: str = "F1", tam: int = 16,
           cor: tuple[float, float, float] = PRETO) -> str:
    return f"{_rg(cor)}\nBT /{fonte} {tam} Tf {x} {y} Td ({_esc(s)}) Tj ET"


def _retangulo(x: int, y: int, w: int, h: int, cor: tuple[float, float, float]) -> str:
    return f"{_rg(cor)}\n{x} {y} {w} {h} re f"


def _conteudo_slide(slide: Slide, w: int, h: int) -> str:
    partes: list[str] = []
    if slide.capa:
        partes.append(_retangulo(0, 0, w, h, AZUL_ESCURO))
        partes.append(_texto(60, h - 200, slide.titulo, fonte="F2", tam=44, cor=BRANCO))
        y = h - 270
        for b in slide.bullets:
            partes.append(_texto(60, y, b, fonte="F1", tam=18, cor=(0.85, 0.9, 0.98)))
            y -= 32
        if slide.destaque:
            partes.append(_texto(60, 90, slide.destaque, fonte="F2", tam=22, cor=(0.5, 0.9, 0.6)))
        return "\n".join(partes)

    # Faixa de titulo
    partes.append(_retangulo(0, h - 70, w, 70, AZUL))
    partes.append(_texto(50, h - 48, slide.titulo, fonte="F2", tam=26, cor=BRANCO))
    # Bullets
    y = h - 130
    for b in slide.bullets:
        marcador = b.startswith("  ")
        x = 80 if marcador else 50
        texto = b.strip()
        if not marcador:
            partes.append(_texto(50, y + 4, "•", fonte="F2", tam=16, cor=AZUL))
        partes.append(_texto(x, y, texto, fonte="F1", tam=16, cor=PRETO))
        y -= 34
    if slide.destaque:
        partes.append(_retangulo(40, y - 30, w - 80, 50, (0.96, 0.97, 0.99)))
        partes.append(_texto(60, y - 14, slide.destaque, fonte="F2", tam=20, cor=VERMELHO))
    # Rodape
    partes.append(_texto(50, 25, "JurisPredict - Previne Brasil", fonte="F1", tam=9, cor=CINZA))
    return "\n".join(partes)


def slides_para_pdf(slides: list[Slide]) -> bytes:
    """Renderiza uma lista de Slide em um PDF A4 paisagem (bytes)."""
    largura, altura = 842, 595  # A4 paisagem
    objetos: list[bytes] = [b"", b"", b"", b""]  # 1=Catalog,2=Pages,3=F1,4=F2

    def add(corpo: bytes) -> int:
        objetos.append(corpo)
        return len(objetos)

    page_refs: list[int] = []
    for slide in slides:
        stream = _conteudo_slide(slide, largura, altura).encode("latin-1")
        content_obj = add(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        page_obj = add(
            (
                "<< /Type /Page /Parent 2 0 R "
                f"/MediaBox [0 0 {largura} {altura}] "
                "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
                f"/Contents {content_obj} 0 R >>"
            ).encode("latin-1")
        )
        page_refs.append(page_obj)

    kids = " ".join(f"{r} 0 R" for r in page_refs)
    objetos[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objetos[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_refs)} >>".encode("latin-1")
    objetos[2] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    objetos[3] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets: list[int] = []
    for i, corpo in enumerate(objetos, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode("latin-1"))
        out.write(corpo)
        out.write(b"\nendobj\n")
    xref_pos = out.tell()
    n = len(objetos) + 1
    out.write(f"xref\n0 {n}\n".encode("latin-1"))
    out.write(b"0000000000 65535 f \n")
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode("latin-1"))
    out.write(f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode("latin-1"))
    return out.getvalue()


def _brl(v: float) -> str:
    return "R$ " + f"{v:,.0f}".replace(",", ".")


def montar_deck(goiania: AvaliacaoMunicipio, total_na_mesa_ano: float | None = None) -> list[Slide]:
    """Monta os slides do deck a partir da avaliacao real de um municipio."""
    pri = goiania.prioridades(3)
    bullets_pri = [
        f"  {p.nome}: {p.resultado:.0f}% (meta {p.meta:.0f}%) -> ganho {_brl(p.ganho_potencial)}"
        for p in pri
    ]
    return [
        Slide(
            "JurisPredict - Previne Brasil",
            ["Quanto recurso federal seu municipio deixa na mesa - e como captura-lo",
             "Do indicador agregado a acao por equipe e por paciente"],
            destaque="Recurso na mesa -> recurso capturado",
            capa=True,
        ),
        Slide("O problema", [
            "O Previne Brasil repassa recurso por desempenho em 7 indicadores da APS.",
            "Quase todo municipio fica abaixo das metas em varios indicadores.",
            "Cada ponto nao atingido e dinheiro que deixa de entrar - todo quadrimestre.",
            "O gestor raramente enxerga quanto vale fechar cada lacuna nem por onde comecar.",
        ]),
        Slide("Como funciona o repasse", [
            "Nota = min(resultado / meta x 10, 10)",
            "ISF = soma(Nota x Peso) / soma(Pesos)   (escala 0 a 10)",
            "Repasse = ISF/10 x soma(valor_max_equipe) x meses",
            "eSF ate R$ 3.225/mes - avaliacao quadrimestral - formula publica.",
        ]),
        Slide(f"A oportunidade - {goiania.municipio}/{goiania.uf}", [
            f"Dados reais 2024Q2 (API DataSUS/DEMAS). ISF {goiania.isf:.2f}.",
            f"Recebe hoje: {_brl(goiania.repasse_atual)} por quadrimestre.",
            f"Equipes (estimadas de pessoas vinculadas reais): base do calculo.",
        ], destaque=f"Na mesa: {_brl(goiania.repasse_potencial)}/quad  (~{_brl(goiania.repasse_potencial*3)}/ano)"),
        Slide("O que a aplicacao faz", [
            "1. Diagnostica - ISF, repasse atual e ranking de recurso na mesa.",
            "2. Simula - arrasta os indicadores e ve o ganho em R$ em tempo real.",
            "3. Aciona - lista nominal de pacientes por equipe para bater a meta.",
            "Do 'quanto' (gestor) ao 'quem' (equipe na ponta).",
        ]),
        Slide("Priorizacao por retorno", [
            "Para cada indicador: quanto falta, quantos casos a mais e quanto vale.",
            *bullets_pri,
            "A equipe sabe exatamente onde concentrar esforco para o maior retorno.",
        ]),
        Slide("Do agregado ao paciente", [
            "O recurso na mesa vira worklist por equipe:",
            "  Ex.: 'Hipertensos': cobertura 3/14 (21%), meta 50%. Converter +4.",
            "  Acionar: P-00005, P-00007, P-00026, P-00035.",
            "Exportavel em CSV e PDF para distribuir as equipes.",
            "Dados individualizados via convenio (pseudonimizacao, LGPD).",
        ]),
        Slide("Por que agora - urgente", [
            "Modelo 2024 (Portaria 3.493/2024): repasse por faixa de qualidade.",
            "Excelente R$ 3.000 | Bom R$ 2.500 | Suficiente R$ 2.000 | Regular R$ 1.000.",
            "Classificacao por desempenho real vale a partir de jan/2026.",
            "Subir de faixa = mais recurso por equipe, todo mes.",
        ]),
        Slide("Arquitetura (tecnico)", [
            "previne/ - nucleo puro: indicadores, ISF, analise de lacunas.",
            "patient.py + convenio.py - nivel de paciente + LGPD.",
            "modelo2024.py - Componente de Qualidade (faixas).",
            "datasus.py + cnes.py - API real do DEMAS e nº de equipes.",
            "export.py / slides.py - CSV e PDF (sem dependencias).",
            "api/ - FastAPI: JSON + dashboard + simulador + apresentacao. 57 testes.",
        ]),
        Slide("Fonte de dados - publica e real (tecnico)", [
            "API REST do DataSUS/DEMAS, sem autenticacao.",
            "indicador-desempenho-programa-previne-brasil (IBGE 6 digitos).",
            "Resultado = numerador/denominador. Cobertura 2024, quadrimestral.",
            "I6 ausente no dataset aberto -> ISF sobre indicadores disponiveis.",
            "Pessoas vinculadas (cadastro-vinculado) -> estimativa de equipes (CNES).",
        ]),
        Slide("Dados de paciente com responsabilidade (tecnico)", [
            "Dados agregados: publicos. Dados de paciente: sensiveis (LGPD).",
            "Acesso so via convenio/termo de cessao - base legal registrada.",
            "Pseudonimizacao irreversivel (hash + sal) antes de processar.",
            "O sistema nunca manipula CPF/CNS em claro.",
        ]),
        Slide("Proximos passos", [
            "Integrar contagem exata de equipes da base do CNES.",
            "Carga nacional dos ~5.570 municipios.",
            "Painel por equipe para a ponta acompanhar metas.",
        ], destaque="Recurso na mesa -> recurso capturado", capa=True),
    ]

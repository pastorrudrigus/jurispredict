"""Exportacao das worklists por equipe em CSV e PDF.

- CSV: uma linha por equipe/indicador, com cobertura, meta, pendencia e a lista
  de pacientes a acionar. Ideal para abrir em planilha ou importar em outro sistema.
- PDF: relatorio paginado, pronto para imprimir e distribuir as equipes.

O gerador de PDF e implementado em Python puro (sem dependencias externas) para
manter o projeto leve e auditavel -- gera um PDF 1.4 valido com texto em Helvetica.
"""

from __future__ import annotations

import csv
import io
from datetime import date

from previne.patient import PendenciaEquipe


# --------------------------------------------------------------------------- #
# CSV
# --------------------------------------------------------------------------- #
def worklist_para_csv(pendencias: list[PendenciaEquipe], *, delimiter: str = ";") -> str:
    """Serializa as pendencias por equipe em CSV (string)."""
    buffer = io.StringIO()
    escritor = csv.writer(buffer, delimiter=delimiter)
    escritor.writerow(
        [
            "equipe_ine",
            "equipe_nome",
            "indicador",
            "indicador_nome",
            "elegiveis",
            "atendidos",
            "cobertura_%",
            "meta_%",
            "faltam_para_meta",
            "pacientes_a_acionar",
        ]
    )
    for p in pendencias:
        acionar = p.pacientes_pendentes[: p.faltam_para_meta] if p.faltam_para_meta else []
        escritor.writerow(
            [
                p.equipe_ine,
                p.equipe_nome,
                p.indicador,
                p.indicador_nome,
                p.elegiveis,
                p.atendidos,
                f"{p.cobertura:.1f}",
                f"{p.meta:.0f}",
                p.faltam_para_meta,
                " ".join(acionar),
            ]
        )
    return buffer.getvalue()


# --------------------------------------------------------------------------- #
# PDF (gerador minimo, sem dependencias)
# --------------------------------------------------------------------------- #
def _escape_pdf(texto: str) -> str:
    """Escapa caracteres especiais de strings literais PDF e remove nao-latin1."""
    saida = texto.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return saida.encode("latin-1", "replace").decode("latin-1")


def _paginar(linhas: list[str], por_pagina: int) -> list[list[str]]:
    return [linhas[i : i + por_pagina] for i in range(0, len(linhas), por_pagina)] or [[]]


def linhas_para_pdf(
    linhas: list[str], *, titulo: str = "", fonte_pt: int = 10, linhas_por_pagina: int = 52
) -> bytes:
    """Gera um PDF (bytes) a partir de uma lista de linhas de texto.

    PDF A4 retrato, fonte Helvetica. Quebra automaticamente em paginas.
    """
    paginas = _paginar(linhas, linhas_por_pagina)
    altura, largura = 842, 595  # A4 em pontos
    margem_x, topo = 40, 800
    avanco = 14

    objetos: list[bytes] = []

    def add(corpo: bytes) -> int:
        objetos.append(corpo)
        return len(objetos)  # numero do objeto (1-based)

    # Reservamos: 1=Catalog, 2=Pages, 3=Font; paginas e conteudos vem depois.
    font_obj = 3
    page_refs: list[int] = []
    content_for_page: list[tuple[int, int]] = []  # (page_obj, content_obj)

    # Placeholders para Catalog/Pages/Font (preenchidos no fim, posicoes fixas).
    objetos.extend([b"", b"", b""])

    for pag in paginas:
        partes = ["BT", f"/F1 {fonte_pt} Tf", f"{margem_x} {topo} Td", f"{avanco} TL"]
        primeiro = True
        if titulo:
            partes.append(f"({_escape_pdf(titulo)}) Tj")
            partes.append("T*")
            primeiro = False
        for ln in pag:
            if not primeiro:
                partes.append("T*")
            partes.append(f"({_escape_pdf(ln)}) Tj")
            primeiro = False
        partes.append("ET")
        stream = "\n".join(partes).encode("latin-1")
        content_obj = add(
            b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)
        )
        page_obj = add(
            (
                "<< /Type /Page /Parent 2 0 R "
                f"/MediaBox [0 0 {largura} {altura}] "
                f"/Resources << /Font << /F1 {font_obj} 0 R >> >> "
                f"/Contents {content_obj} 0 R >>"
            ).encode("latin-1")
        )
        page_refs.append(page_obj)
        content_for_page.append((page_obj, content_obj))

    kids = " ".join(f"{r} 0 R" for r in page_refs)
    objetos[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objetos[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_refs)} >>".encode("latin-1")
    objetos[2] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

    # Montagem do arquivo com tabela xref.
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
    out.write(
        f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode(
            "latin-1"
        )
    )
    return out.getvalue()


def worklist_para_pdf(
    pendencias: list[PendenciaEquipe], *, municipio: str = ""
) -> bytes:
    """Gera um PDF de relatorio das worklists por equipe, agrupado por equipe."""
    titulo = f"Previne Brasil - Worklist por equipe{' - ' + municipio if municipio else ''}"
    linhas: list[str] = [f"Emitido em {date.today():%d/%m/%Y}", ""]

    por_equipe: dict[str, list[PendenciaEquipe]] = {}
    for p in pendencias:
        por_equipe.setdefault(p.equipe_nome or p.equipe_ine, []).append(p)

    for equipe, itens in por_equipe.items():
        linhas.append(f"== {equipe} ==")
        for p in itens:
            status = (
                f"faltam {p.faltam_para_meta}" if p.faltam_para_meta else "meta OK"
            )
            linhas.append(
                f"  {p.indicador} {p.indicador_nome[:34]:34} "
                f"{p.atendidos}/{p.elegiveis} ({p.cobertura:.0f}%) "
                f"meta {p.meta:.0f}% | {status}"
            )
            if p.faltam_para_meta:
                alvo = ", ".join(p.pacientes_pendentes[: p.faltam_para_meta])
                linhas.append(f"      acionar: {alvo}")
        linhas.append("")
    return linhas_para_pdf(linhas, titulo=titulo)

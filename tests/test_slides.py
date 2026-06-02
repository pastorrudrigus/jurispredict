"""Testes do gerador de apresentacao em PDF (slides)."""

from previne.repository import MunicipioRepository
from previne.slides import Slide, montar_deck, slides_para_pdf


def test_pdf_de_slides_valido():
    slides = [
        Slide("Capa", ["linha"], destaque="x", capa=True),
        Slide("Titulo", ["a", "  sub", "b"], destaque="destaque"),
    ]
    pdf = slides_para_pdf(slides)
    assert pdf.startswith(b"%PDF-1.4")
    assert pdf.rstrip().endswith(b"%%EOF")
    assert pdf.count(b"/Type /Page ") == 2          # uma pagina por slide
    assert b"Helvetica-Bold" in pdf                  # fonte bold incluida


def test_montar_deck_usa_dados_do_municipio():
    g = MunicipioRepository.from_exemplo().avaliar("5208707")
    deck = montar_deck(g)
    assert len(deck) >= 10
    assert deck[0].capa  # primeiro slide e a capa
    # O nome do municipio aparece em algum slide.
    assert any("Goiania" in s.titulo for s in deck)


def test_caracteres_especiais_escapados():
    # Parenteses no texto nao podem quebrar o PDF.
    pdf = slides_para_pdf([Slide("Teste (x)", ["a (b) c", "d \\ e"])])
    assert pdf.startswith(b"%PDF-1.4")
    assert pdf.rstrip().endswith(b"%%EOF")

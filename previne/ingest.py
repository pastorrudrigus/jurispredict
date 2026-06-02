"""CLI de ingestao de dados do DataSUS / Dados Abertos do SUS.

Uso:
    python -m previne.ingest recursos
        Lista os arquivos disponiveis no dataset de indicadores do SISAB.

    python -m previne.ingest csv CAMINHO.csv --saida data/municipios.json
        Converte um CSV exportado do painel do SISAB para o formato do projeto.

Observacao: a ingestao via rede depende da disponibilidade da API publica do SUS.
Se nao houver acesso, use o conjunto de exemplo (previne.repository.from_exemplo()).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from previne.datasus import DataSUSClient, parse_csv_sisab


def _cmd_recursos(_: argparse.Namespace) -> int:
    """Lista os recursos do dataset de indicadores do SISAB."""
    with DataSUSClient() as cli:
        recursos = cli.listar_recursos()
    if not recursos:
        print("Nenhum recurso encontrado (ou API indisponivel).")
        return 1
    for r in recursos:
        print(f"[{r.formato:5}] {r.nome}\n        id={r.id}\n        {r.url}")
    return 0


def _cmd_csv(args: argparse.Namespace) -> int:
    """Converte um CSV do SISAB no JSON consumido pelo repositorio."""
    conteudo = Path(args.arquivo).read_text(encoding="utf-8", errors="replace")
    mapa = parse_csv_sisab(conteudo, delimiter=args.delimiter)
    if not mapa:
        print("Nenhum registro reconhecido no CSV.", file=sys.stderr)
        return 1

    registros = [
        {
            "ibge": ibge,
            "municipio": ibge,
            "uf": "",
            "equipes": {},
            "resultados": [
                {"codigo": r.codigo, "resultado": r.resultado} for r in resultados
            ],
        }
        for ibge, resultados in mapa.items()
    ]
    Path(args.saida).write_text(
        json.dumps(registros, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"{len(registros)} municipios gravados em {args.saida}")
    print("Atencao: complete os campos 'municipio', 'uf' e 'equipes' (via CNES).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="previne.ingest", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("recursos", help="lista recursos do dataset SISAB").set_defaults(
        func=_cmd_recursos
    )

    p_csv = sub.add_parser("csv", help="converte CSV do SISAB para JSON do projeto")
    p_csv.add_argument("arquivo", help="caminho do CSV exportado do SISAB")
    p_csv.add_argument("--saida", default="data/municipios.json", help="JSON de saida")
    p_csv.add_argument("--delimiter", default=";", help="delimitador do CSV (padrao ';')")
    p_csv.set_defaults(func=_cmd_csv)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

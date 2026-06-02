"""CLI de ingestao de dados do DataSUS / Dados Abertos do SUS.

Uso:
    python -m previne.ingest municipio 5208707 --quadrimestre 2024Q2
        Busca os indicadores reais de um municipio na API do DEMAS e imprime/grava.

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


def _cmd_municipio(args: argparse.Namespace) -> int:
    """Busca os indicadores reais de um municipio na API do DEMAS."""
    with DataSUSClient() as cli:
        resultados = cli.buscar_indicadores_previne(
            args.ibge, quadrimestre=args.quadrimestre, visao=args.visao
        )
    if not resultados:
        print("Nenhum indicador retornado (verifique IBGE/quadrimestre ou a rede).")
        return 1
    for r in sorted(resultados, key=lambda x: x.codigo):
        print(
            f"{r.codigo}  resultado={r.resultado:5.1f}%  "
            f"({r.numerador}/{r.denominador})  meta={r.indicador.meta:.0f}%"
        )
    if args.saida:
        registro = {
            "ibge": str(args.ibge),
            "municipio": str(args.ibge),
            "uf": "",
            "equipes": {},
            "resultados": [
                {
                    "codigo": r.codigo,
                    "resultado": r.resultado,
                    "numerador": r.numerador,
                    "denominador": r.denominador,
                }
                for r in resultados
            ],
        }
        Path(args.saida).write_text(
            json.dumps([registro], ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\nGravado em {args.saida}. Complete 'municipio', 'uf' e 'equipes' (CNES).")
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

    p_mun = sub.add_parser("municipio", help="busca indicadores reais de um municipio")
    p_mun.add_argument("ibge", help="codigo IBGE (6 ou 7 digitos)")
    p_mun.add_argument("--quadrimestre", default="2024Q2", help="ex.: 2024Q1, 2024Q2")
    p_mun.add_argument("--visao", default="homologadas", help="homologadas|validas|geral")
    p_mun.add_argument("--saida", default="", help="grava o resultado em JSON (opcional)")
    p_mun.set_defaults(func=_cmd_municipio)

    p_csv = sub.add_parser("csv", help="converte CSV do SISAB para JSON do projeto")
    p_csv.add_argument("arquivo", help="caminho do CSV exportado do SISAB")
    p_csv.add_argument("--saida", default="data/municipios.json", help="JSON de saida")
    p_csv.add_argument("--delimiter", default=";", help="delimitador do CSV (padrao ';')")
    p_csv.set_defaults(func=_cmd_csv)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

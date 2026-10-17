#!/usr/bin/env python3
"""
Demonstração reproduzível da arena pela API HTTP (somente dados sintéticos; nenhuma compra externa).

Uso: com `pnpm dev` (ou `npm run dev:api`) saudável, execute
    MIXCERTO_EMAIL=... MIXCERTO_PASSWORD=... python3 scripts/competition-http-smoke.py [--base http://localhost:3001/api]
O usuário precisa do perfil comprador ou administrador (e já ter trocado a senha temporária).
"""
import argparse
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

steps = 0
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(base, method, path, body=None, expect=None):
    global steps
    steps += 1
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={"content-type": "application/json", "x-mixcerto": "1"})
    try:
        with opener.open(req) as r:
            status, payload = r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        status, payload = e.code, json.loads(e.read() or b"{}")
    ok = expect is None or status == expect
    tag = "OK " if ok else "FALHA"
    extra = f" [{payload.get('code')}]" if isinstance(payload, dict) and payload.get("code") else ""
    print(f"{steps:2d}. {tag} {method} {path} -> {status}{extra}")
    if not ok:
        print(json.dumps(payload, ensure_ascii=False, indent=2)[:2000])
        sys.exit(1)
    return payload


def brl(c):
    return ("R$ {:,.2f}".format(c / 100)).replace(",", "X").replace(".", ",").replace("X", ".")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3001/api")
    base = ap.parse_args().base

    call(base, "GET", "/health", expect=200)
    call(base, "GET", "/arenas", expect=401)  # sem login
    call(base, "POST", "/auth/login", {"email": os.environ.get("MIXCERTO_EMAIL", "admin@mixcerto.local"),
                                       "password": os.environ.get("MIXCERTO_PASSWORD", "")}, expect=200)
    a = call(base, "POST", "/arenas", {}, expect=201)
    aid, v = a["id"], a["version"]
    print(f"    cesta: {len(a['basket'])} itens; indisponível: {', '.join(u['productName'] for u in a['unavailable'])}")
    best0 = min(r["disbursementCents"] for r in a["ranking"] if r["position"])

    for _ in range(3):
        a = call(base, "POST", f"/arenas/{aid}/rodadas", {"expectedVersion": v}, expect=200)
        v = a["version"]
        lead = a["ranking"][0]
        print(f"    líder: {lead['supplierName']} — econômico {brl(lead['economicCents'])}")

    call(base, "POST", f"/arenas/{aid}/rodadas", {"expectedVersion": v}, expect=409)        # limite de rodadas
    call(base, "POST", f"/arenas/{aid}/lances", {"supplierId": "s3", "reductionPct": 1, "expectedVersion": v - 1}, expect=409)  # versão
    call(base, "POST", f"/cotacoes/{aid}/pedido", {"expectedVersion": v, "acknowledgeShortage": True}, expect=409)  # cotação não contorna
    a = call(base, "POST", f"/arenas/{aid}/encerrar", {"expectedVersion": v}, expect=200)
    v = a["version"]
    call(base, "POST", f"/arenas/{aid}/lances", {"supplierId": "s2", "reductionPct": 5, "expectedVersion": v}, expect=409)  # bloqueio pós-encerramento
    call(base, "POST", f"/arenas/{aid}/pedido", {"expectedVersion": v}, expect=422)          # falta não reconhecida
    o1 = call(base, "POST", f"/arenas/{aid}/pedido", {"expectedVersion": v, "acknowledgeShortage": True}, expect=201)  # aceite parcial
    o2 = call(base, "POST", f"/arenas/{aid}/pedido", {"expectedVersion": v, "acknowledgeShortage": True}, expect=200)  # idempotência
    assert o1["order"]["id"] == o2["order"]["id"] and o2["replayed"]
    order = o1["order"]
    assert order["disbursementCents"] == order["merchandiseCents"] + order["logisticsCents"]  # pedido reconciliado

    print()
    print(f"Fornecedor selecionado: {order['supplierName']} ({order['origin']['city']}/{order['origin']['uf']})")
    print(f"Desembolso: {brl(order['disbursementCents'])} · custo econômico: {brl(order['economicCents'])}")
    print(f"Melhoria nominal vs. melhor proposta inicial: {brl(best0 - order['disbursementCents'])} (mesma cesta de {len(order['lines'])} itens)")
    print(f"{steps} passos HTTP executados. Valores sintéticos — não são economia medida em compras reais.")


if __name__ == "__main__":
    main()

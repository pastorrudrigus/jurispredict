import { Router, type NextFunction, type Request, type Response } from "express";
import { computeBasket, evaluateProposal, rankProposals } from "../../shared/competition.js";
import {
  audit,
  closeArena,
  createArena,
  createOrder,
  DomainError,
  getArena,
  simulateRound,
  submitBid,
  updateLogistics,
  viewArena,
} from "../domain/competition.js";
import { INITIAL_LOGISTICS } from "../seed.js";
import type { Store } from "../store.js";
import { requirePermission } from "../auth.js";

type Handler = (req: Request, res: Response) => unknown;

/** Executa a operação, persiste e converte DomainError em resposta HTTP. */
const wrap = (store: Store, h: Handler, mutates = false) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = h(req, res);
    if (mutates) store.save();
    if (!res.headersSent) res.json(out);
  } catch (e) {
    if (e instanceof DomainError) res.status(e.status).json({ error: e.message, code: e.code, details: e.details });
    else next(e);
  }
};

export function competitionRoutes(store: Store): Router {
  const r = Router();
  const db = () => store.db;
  const now = () => store.now();
  const negociar = requirePermission("negociar");
  const catalogo = requirePermission("catalogo");

  r.get("/arenas", wrap(store, () =>
    [...db().arenas].reverse().map((a) => {
      const v = viewArena(db(), a, now());
      const lead = v.ranking.find((x) => x.position === 1);
      return { id: a.id, seq: a.seq, title: a.title, items: a.basket.length, createdAt: a.createdAt, status: a.status, version: a.version,
               leader: lead?.supplierName ?? null, bestEconomicCents: lead?.economicCents ?? null, orderId: a.orderId ?? null };
    })));

  r.post("/arenas", negociar, wrap(store, (req, res) => {
    const a = createArena(db(), { budgetId: req.body?.budgetId, mix: req.body?.mix, title: req.body?.title }, now());
    res.status(201);
    return viewArena(db(), a, now());
  }, true));

  r.get("/arenas/:id", wrap(store, (req) => viewArena(db(), getArena(db(), req.params.id), now())));

  r.post("/arenas/:id/rodadas", negociar, wrap(store, (req) =>
    viewArena(db(), simulateRound(db(), req.params.id, req.body?.expectedVersion, now()), now()), true));

  r.post("/arenas/:id/lances", negociar, wrap(store, (req) =>
    viewArena(db(), submitBid(db(), req.params.id, req.body ?? {}, now()), now()), true));

  r.put("/arenas/:id/propostas/:supplierId/logistica", negociar, wrap(store, (req) =>
    viewArena(db(), updateLogistics(db(), req.params.id, req.params.supplierId, req.body ?? {}, now()), now()), true));

  r.post("/arenas/:id/encerrar", negociar, wrap(store, (req) =>
    viewArena(db(), closeArena(db(), req.params.id, req.body?.expectedVersion, now()), now()), true));

  r.post("/arenas/:id/pedido", negociar, wrap(store, (req, res) => {
    const out = createOrder(db(), req.params.id, req.body ?? {}, now(), "arena");
    res.status(out.replayed ? 200 : 201);
    return out;
  }, true));

  // ---- Cotação-base: tabela inicial, sem negociação. Não contorna as regras da arena.
  r.get("/cotacoes", wrap(store, () =>
    db().arenas.map((a) => {
      const today = now().slice(0, 10);
      const base = rankProposals(
        a.proposals.map((p) =>
          evaluateProposal({ supplierId: p.supplierId, reductionPct: 0, logistics: INITIAL_LOGISTICS[p.supplierId] ?? p.logistics },
            a.basket, db().catalog, a.params, today)),
      );
      return { arenaId: a.id, createdAt: a.createdAt, status: a.status, version: a.version, unavailable: a.unavailable, ranking: base };
    })));

  r.post("/cotacoes/:arenaId/pedido", negociar, wrap(store, (req, res) => {
    const out = createOrder(db(), req.params.arenaId, req.body ?? {}, now(), "cotacao");
    res.status(out.replayed ? 200 : 201);
    return out;
  }, true));

  // ---- Pedidos, catálogo, verbas e auditoria
  r.get("/pedidos", wrap(store, () => [...db().orders].reverse()));
  r.get("/pedidos/:id", wrap(store, (req) => {
    const o = db().orders.find((x) => x.id === req.params.id);
    if (!o) throw new DomainError(404, "ORDER_NOT_FOUND", "Pedido não encontrado.");
    return o;
  }));

  r.get("/catalogo", wrap(store, () => ({ ...db().catalog, ...computeBasket(db().catalog, now().slice(0, 10)) })));

  r.patch("/catalogo/ofertas/:supplierId/:productId", catalogo, wrap(store, (req) => {
    const o = db().catalog.offers.find((x) => x.supplierId === req.params.supplierId && x.productId === req.params.productId);
    if (!o) throw new DomainError(404, "OFFER_NOT_FOUND", "Oferta não encontrada.");
    const { stock, expiry, unitPriceCents } = req.body ?? {};
    if (stock !== undefined) {
      if (!Number.isInteger(stock) || stock < 0) throw new DomainError(400, "INVALID_STOCK", "Estoque inválido.");
      o.stock = stock;
    }
    if (expiry !== undefined) {
      if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new DomainError(400, "INVALID_EXPIRY", "Validade inválida.");
      o.expiry = expiry;
    }
    if (unitPriceCents !== undefined) {
      if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) throw new DomainError(400, "INVALID_PRICE", "Preço inválido.");
      o.unitPriceCents = unitPriceCents;
    }
    audit(db(), now(), "catalogo.oferta", `${o.supplierId}/${o.productId}`, JSON.stringify(req.body));
    return o;
  }, true));

  r.patch("/catalogo/produtos/:id", catalogo, wrap(store, (req) => {
    const p = db().catalog.products.find((x) => x.id === req.params.id);
    if (!p) throw new DomainError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    const v = req.body?.minShelfLifeDays;
    if (!Number.isInteger(v) || v < 0) throw new DomainError(400, "INVALID_SHELF_LIFE", "Vida mínima inválida.");
    p.minShelfLifeDays = v;
    audit(db(), now(), "catalogo.produto", p.id, `vida mínima ${v}d`);
    return p;
  }, true));

  r.get("/verbas", wrap(store, () => db().catalog.budgets));
  r.patch("/verbas/:id", requirePermission("verbas"), wrap(store, (req) => {
    const b = db().catalog.budgets.find((x) => x.id === req.params.id);
    if (!b) throw new DomainError(404, "BUDGET_NOT_FOUND", "Verba não encontrada.");
    const { ceilingCents, maxLeadTimeDays } = req.body ?? {};
    if (ceilingCents !== undefined) {
      if (!Number.isInteger(ceilingCents) || ceilingCents <= 0) throw new DomainError(400, "INVALID_CEILING", "Teto inválido.");
      b.ceilingCents = ceilingCents;
    }
    if (maxLeadTimeDays !== undefined) {
      if (!Number.isInteger(maxLeadTimeDays) || maxLeadTimeDays <= 0) throw new DomainError(400, "INVALID_LEAD", "Prazo inválido.");
      b.maxLeadTimeDays = maxLeadTimeDays;
    }
    audit(db(), now(), "verba.alterada", b.id, "Vale para novas arenas.");
    return b;
  }, true));

  // ---- Fornecedores: scorecard a partir das arenas e pedidos registrados
  r.get("/fornecedores", wrap(store, () => {
    const t = now();
    return db().catalog.suppliers.map((s) => {
      let participations = 0, aptCount = 0, positions = 0, firsts = 0;
      const reasons = new Map<string, number>();
      for (const a of db().arenas) {
        const ranking = viewArena(db(), a, t).ranking;
        const r = ranking.find((x) => x.supplierId === s.id);
        if (!r) continue;
        participations++;
        if (r.position !== null) {
          aptCount++;
          positions += r.position;
          if (r.position === 1) firsts++;
        } else for (const reason of r.reasons) {
          const k = reason.split(":")[0];
          reasons.set(k, (reasons.get(k) ?? 0) + 1);
        }
      }
      const offers = db().catalog.offers.filter((o) => o.supplierId === s.id);
      const orders = db().orders.filter((o) => o.supplierId === s.id);
      return {
        ...s,
        offersCount: offers.length,
        productsCovered: offers.filter((o) => o.stock > 0).length,
        logistics: INITIAL_LOGISTICS[s.id] ?? null,
        participations,
        aptRate: participations ? aptCount / participations : null,
        avgPosition: aptCount ? positions / aptCount : null,
        leaderships: firsts,
        ordersWon: orders.length,
        ordersValueCents: orders.reduce((x, o) => x + o.disbursementCents, 0),
        topInaptReasons: [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ reason: k, count: n })),
      };
    });
  }));

  r.get("/auditoria", wrap(store, () => [...db().audit].reverse()));

  r.post("/demo/reset", requirePermission("demo"), wrap(store, () => {
    store.reset();
    return { ok: true };
  }));

  return r;
}

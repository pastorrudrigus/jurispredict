import {
  basketKey,
  computeBasket,
  evaluateProposal,
  explainSelection,
  itemMatrix,
  rankProposals,
  type BasketItem,
  type Arena,
  type ArenaView,
  type Catalog,
  type Order,
  type ProposalEvaluation,
  type RankedProposal,
  type TimelinePoint,
} from "../../shared/competition";
import { DEFAULT_DESTINATION, type AuditEvent, type LogisticsTerms } from "../../shared/contracts";
import { validateLogistics } from "../../shared/transport";
import { INITIAL_LOGISTICS } from "../seed";
import type { Role } from "../../shared/auth";
import { currentActor } from "../context";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  /** scrypt: "salt:hash" em hex. */
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string | null;
  failedLogins: number;
  lockedUntil: string | null;
}

export interface SessionRecord {
  /** SHA-256 do token — o token em si só existe no cookie do navegador. */
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface Db {
  catalog: Catalog;
  arenas: Arena[];
  orders: Order[];
  audit: AuditEvent[];
  users: UserRecord[];
  sessions: SessionRecord[];
  seq: { arena: number; order: number; audit: number; user: number };
}

export class DomainError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const dateOf = (now: string) => now.slice(0, 10);

export function audit(db: Db, now: string, action: string, entity: string, detail: string, actor = currentActor()) {
  db.audit.push({ id: ++db.seq.audit, at: now, actor, action, entity, detail });
}

export function getArena(db: Db, id: string): Arena {
  const a = db.arenas.find((x) => x.id === id);
  if (!a) throw new DomainError(404, "ARENA_NOT_FOUND", "Arena não encontrada.");
  return a;
}

function requireVersion(a: Arena, expected: unknown) {
  if (typeof expected !== "number")
    throw new DomainError(400, "VERSION_REQUIRED", "Informe a versão da arena (expectedVersion).");
  if (expected !== a.version)
    throw new DomainError(409, "VERSION_CONFLICT", `Versão ${expected} desatualizada; a arena está na versão ${a.version}. Recarregue antes de continuar.`, { currentVersion: a.version });
}

function requireOpen(a: Arena) {
  if (a.status !== "aberta")
    throw new DomainError(409, "ARENA_CLOSED", "Arena encerrada: novos lances ou mudanças logísticas estão bloqueados.");
}

export function evaluateArena(db: Db, a: Arena, now: string): RankedProposal[] {
  const today = dateOf(now);
  return rankProposals(a.proposals.map((p) => evaluateProposal(p, a.basket, db.catalog, a.params, today)));
}

export function viewArena(db: Db, a: Arena, now: string): ArenaView {
  const ranking = evaluateArena(db, a, now);
  const current = computeBasket(db.catalog, dateOf(now), a.mix);
  return {
    ...a,
    ranking,
    matrix: itemMatrix(ranking, db.catalog),
    explanation: explainSelection(ranking),
    basketDrift: basketKey(current.basket) !== basketKey(a.basket),
    simulatedRoundsUsed: a.rounds.filter((r) => r.kind === "simulada").length,
  };
}

const leaderOf = (r: RankedProposal[]) => r.find((x) => x.position === 1) ?? null;

function pushTimeline(db: Db, a: Arena, now: string, label: string) {
  const ranking = evaluateArena(db, a, now);
  const economic: TimelinePoint["economic"] = {};
  const disbursement: TimelinePoint["disbursement"] = {};
  for (const r of ranking) {
    economic[r.supplierId] = r.apt ? r.economicCents : null;
    disbursement[r.supplierId] = r.apt ? r.disbursementCents : null;
  }
  const lead = leaderOf(ranking);
  a.timeline.push({
    step: a.timeline.length,
    at: now,
    label,
    economic,
    disbursement,
    bestEconomicCents: lead?.economicCents ?? null,
    leaderId: lead?.supplierId ?? null,
  });
}

/** Valida e normaliza o mix informado (Nova cotação / Importar mix). Sem mix, usa o mix original. */
export function normalizeMix(db: Db, raw: unknown): BasketItem[] {
  if (raw === undefined || raw === null) return db.catalog.products.map((p) => ({ productId: p.id, quantity: p.quantity }));
  if (!Array.isArray(raw) || !raw.length) throw new DomainError(400, "INVALID_MIX", "Informe ao menos um item no mix.");
  if (raw.length > 500) throw new DomainError(400, "INVALID_MIX", "Mix grande demais.");
  const merged = new Map<string, number>();
  for (const it of raw) {
    const id = (it as BasketItem)?.productId;
    const q = Number((it as BasketItem)?.quantity);
    if (!db.catalog.products.some((p) => p.id === id)) throw new DomainError(400, "UNKNOWN_PRODUCT", `Produto desconhecido: ${String(id)}.`);
    if (!Number.isInteger(q) || q <= 0 || q > 1_000_000) throw new DomainError(400, "INVALID_QUANTITY", `Quantidade inválida para ${id}.`);
    merged.set(id, (merged.get(id) ?? 0) + q);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

export function createArena(db: Db, opts: { budgetId?: string; mix?: unknown; title?: unknown }, now: string): Arena {
  const budget = db.catalog.budgets.find((b) => b.id === (opts.budgetId ?? db.catalog.budgets[0]?.id));
  if (!budget) throw new DomainError(400, "BUDGET_NOT_FOUND", "Verba não encontrada.");
  const mix = normalizeMix(db, opts.mix);
  const title = typeof opts.title === "string" && opts.title.trim() ? opts.title.trim().slice(0, 80) : opts.mix ? "Mix personalizado" : "Mix padrão";
  const { basket, unavailable } = computeBasket(db.catalog, dateOf(now), mix);
  if (!basket.length) throw new DomainError(409, "EMPTY_BASKET", "Nenhum item do mix pode ser atendido.");
  const seq = ++db.seq.arena;
  const a: Arena = {
    id: `arena-${seq}`,
    seq,
    createdAt: now,
    today: dateOf(now),
    status: "aberta",
    version: 1,
    title,
    mix,
    params: {
      destination: { ...DEFAULT_DESTINATION },
      budgetId: budget.id,
      ceilingCents: budget.ceilingCents,
      maxLeadTimeDays: budget.maxLeadTimeDays,
      annualRatePct: 12,
      maxRounds: 3,
      roundStepPct: 0.5,
      maxReductionPct: 12,
    },
    basket,
    unavailable,
    proposals: db.catalog.suppliers.map((s) => ({
      supplierId: s.id,
      reductionPct: 0,
      logistics: structuredClone(INITIAL_LOGISTICS[s.id] ?? INITIAL_LOGISTICS.s1),
    })),
    rounds: [],
    timeline: [],
  };
  pushTimeline(db, a, now, "Orçamento inicial");
  db.arenas.push(a);
  audit(db, now, "arena.criada", a.id, `Cesta com ${basket.length} itens; ${unavailable.length} indisponível(is).`);
  return a;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rodada simulada (determinística): o desafiante apto mais próximo do líder melhora sua tabela
 * em `roundStepPct` pontos percentuais, respeitando o limite de redução. Não é previsão de comportamento.
 */
export function simulateRound(db: Db, arenaId: string, expectedVersion: unknown, now: string): Arena {
  const a = getArena(db, arenaId);
  requireOpen(a);
  requireVersion(a, expectedVersion);
  const used = a.rounds.filter((r) => r.kind === "simulada").length;
  if (used >= a.params.maxRounds)
    throw new DomainError(409, "ROUND_LIMIT", `Limite de ${a.params.maxRounds} rodadas simuladas atingido.`);
  const ranking = evaluateArena(db, a, now);
  const lead = leaderOf(ranking);
  if (!lead) throw new DomainError(409, "NO_APT_PROPOSAL", "Não há proposta apta para competir.");
  const challenger = ranking
    .filter((r) => r.position !== null && r.supplierId !== lead.supplierId)
    .filter((r) => r.reductionPct + a.params.roundStepPct <= a.params.maxReductionPct + 1e-9)
    .sort((x, y) => x.economicCents - lead.economicCents - (y.economicCents - lead.economicCents) || x.supplierId.localeCompare(y.supplierId))[0];
  if (!challenger) throw new DomainError(409, "NO_CHALLENGER", "Não há desafiante apto com margem dentro do limite hipotético.");
  const p = a.proposals.find((x) => x.supplierId === challenger.supplierId)!;
  const from = p.reductionPct;
  p.reductionPct = round2(from + a.params.roundStepPct);
  a.version++;
  const after = leaderOf(evaluateArena(db, a, now));
  a.rounds.push({
    number: a.rounds.length + 1, at: now, kind: "simulada", supplierId: p.supplierId,
    fromPct: from, toPct: p.reductionPct, leaderBefore: lead.supplierId, leaderAfter: after?.supplierId ?? null,
  });
  pushTimeline(db, a, now, `Rodada ${used + 1}: ${challenger.supplierName} −${p.reductionPct}%`);
  audit(db, now, "arena.rodada", a.id, `${challenger.supplierName}: ${from}% → ${p.reductionPct}%`, `${currentActor()} (simulador)`);
  return a;
}

/** Redução acumulada manual apresentada pelo comprador em nome de um fornecedor. */
export function submitBid(db: Db, arenaId: string, body: { supplierId?: unknown; reductionPct?: unknown; expectedVersion?: unknown }, now: string): Arena {
  const a = getArena(db, arenaId);
  requireOpen(a);
  requireVersion(a, body.expectedVersion);
  const p = a.proposals.find((x) => x.supplierId === body.supplierId);
  if (!p) throw new DomainError(404, "SUPPLIER_NOT_IN_ARENA", "Fornecedor não participa da arena.");
  const r = Number(body.reductionPct);
  if (!Number.isFinite(r)) throw new DomainError(400, "INVALID_REDUCTION", "Redução inválida.");
  if (r > a.params.maxReductionPct)
    throw new DomainError(422, "REDUCTION_ABOVE_LIMIT", `Redução acumulada acima do limite hipotético de ${a.params.maxReductionPct}% da tabela inicial.`);
  if (r <= p.reductionPct)
    throw new DomainError(422, "REDUCTION_NOT_IMPROVING", `A redução acumulada precisa superar a atual (${p.reductionPct}%).`);
  const lead = leaderOf(evaluateArena(db, a, now));
  const from = p.reductionPct;
  p.reductionPct = round2(r);
  a.version++;
  const after = leaderOf(evaluateArena(db, a, now));
  const name = db.catalog.suppliers.find((s) => s.id === p.supplierId)!.name;
  a.rounds.push({
    number: a.rounds.length + 1, at: now, kind: "manual", supplierId: p.supplierId,
    fromPct: from, toPct: p.reductionPct, leaderBefore: lead?.supplierId ?? null, leaderAfter: after?.supplierId ?? null,
  });
  pushTimeline(db, a, now, `Lance manual: ${name} −${p.reductionPct}%`);
  audit(db, now, "arena.lance", a.id, `${name}: ${from}% → ${p.reductionPct}%`);
  return a;
}

export function updateLogistics(db: Db, arenaId: string, supplierId: string, body: { terms?: unknown; expectedVersion?: unknown }, now: string): Arena {
  const a = getArena(db, arenaId);
  requireOpen(a);
  requireVersion(a, body.expectedVersion);
  const p = a.proposals.find((x) => x.supplierId === supplierId);
  if (!p) throw new DomainError(404, "SUPPLIER_NOT_IN_ARENA", "Fornecedor não participa da arena.");
  const t = sanitizeTerms(body.terms);
  const errors = validateLogistics(t, a.params.destination.uf);
  if (errors.length) throw new DomainError(422, "INVALID_LOGISTICS", errors.join(" "), errors);
  p.logistics = t;
  a.version++;
  const name = db.catalog.suppliers.find((s) => s.id === supplierId)!.name;
  pushTimeline(db, a, now, `Frete ajustado: ${name}`);
  audit(db, now, "arena.frete", a.id, `${name}: ${JSON.stringify(t)}`);
  return a;
}

function sanitizeTerms(raw: unknown): LogisticsTerms {
  if (!raw || typeof raw !== "object") throw new DomainError(400, "INVALID_LOGISTICS", "Condições logísticas ausentes.");
  const r = raw as Record<string, unknown>;
  const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);
  const party = (v: unknown) => (v === "comprador" ? "comprador" : "vendedor") as LogisticsTerms["paidBy"];
  const allowed = ["rodoviario", "ferroviario", "aereo", "cabotagem"];
  const modals = Array.isArray(r.modals) ? (r.modals.filter((m) => allowed.includes(m as string)) as LogisticsTerms["modals"]) : [];
  return {
    sellerDelivers: Boolean(r.sellerDelivers),
    contractedBy: party(r.contractedBy),
    paidBy: party(r.paidBy),
    freightIncluded: Boolean(r.freightIncluded),
    modals: [...new Set(modals)],
    freightCents: int(r.freightCents),
    insuranceCents: int(r.insuranceCents),
    expensesCents: int(r.expensesCents),
    leadTimeDays: int(r.leadTimeDays),
    paymentTermDays: int(r.paymentTermDays),
  };
}

function requireSameBasket(db: Db, a: Arena, now: string) {
  const current = computeBasket(db.catalog, dateOf(now), a.mix);
  if (basketKey(current.basket) !== basketKey(a.basket))
    throw new DomainError(409, "BASKET_CHANGED",
      "A cesta atendível mudou (estoque, validade ou vida mínima). Crie uma nova arena: retirar itens da base não pode parecer economia de negociação.",
      { arenaItems: a.basket.length, currentItems: current.basket.length });
}

/** Encerrar e selecionar: revalida a cesta e as ofertas e congela o vencedor. */
export function closeArena(db: Db, arenaId: string, expectedVersion: unknown, now: string): Arena {
  const a = getArena(db, arenaId);
  requireOpen(a);
  requireVersion(a, expectedVersion);
  requireSameBasket(db, a, now);
  const lead = leaderOf(evaluateArena(db, a, now));
  if (!lead) throw new DomainError(409, "NO_APT_PROPOSAL", "Nenhuma proposta apta: não é possível selecionar vencedor.");
  const initialBest = a.timeline[0];
  const initialBestDisb = initialBest
    ? Math.min(...Object.values(initialBest.disbursement).filter((v): v is number => v !== null))
    : null;
  const { position: _p, ...evaluation } = lead;
  a.status = "encerrada";
  a.version++;
  a.closing = {
    at: now,
    winnerSupplierId: lead.supplierId,
    basketKey: basketKey(a.basket),
    evaluation,
    initialBestDisbursementCents: Number.isFinite(initialBestDisb) ? initialBestDisb : null,
  };
  pushTimeline(db, a, now, `Encerrada: ${lead.supplierName}`);
  audit(db, now, "arena.encerrada", a.id, `Vencedor ${lead.supplierName} — desembolso ${lead.disbursementCents}c, econômico ${lead.economicCents}c`);
  return a;
}

function sameOffer(a: ProposalEvaluation, b: ProposalEvaluation): string[] {
  const diffs: string[] = [];
  if (!b.apt) diffs.push(`proposta deixou de ser apta: ${b.reasons.join("; ")}`);
  if (a.disbursementCents !== b.disbursementCents) diffs.push("desembolso alterado");
  if (a.economicCents !== b.economicCents) diffs.push("custo econômico alterado");
  if (JSON.stringify(a.logistics) !== JSON.stringify(b.logistics)) diffs.push("condições logísticas alteradas");
  for (const l of a.lines) {
    const n = b.lines.find((x) => x.productId === l.productId);
    if (!n || n.tableUnitCents !== l.tableUnitCents || n.totalCents !== l.totalCents) diffs.push(`preço alterado em ${l.productId}`);
  }
  return diffs;
}

/**
 * Gera o pedido interno do vencedor. Exige reconhecimento explícito da falta, versão atual e
 * revalida preço, estoque, condições e cesta. Idempotente: repetir não duplica o pedido.
 * É o ÚNICO caminho de criação de pedido — a cotação-base delega para cá.
 */
export function createOrder(
  db: Db,
  arenaId: string,
  body: { expectedVersion?: unknown; acknowledgeShortage?: unknown },
  now: string,
  via: "arena" | "cotacao" = "arena",
): { order: Order; replayed: boolean } {
  const a = getArena(db, arenaId);
  if (a.orderId) {
    const existing = db.orders.find((o) => o.id === a.orderId)!;
    audit(db, now, "pedido.repetido", existing.id, `Confirmação repetida via ${via}; nenhum pedido novo criado.`);
    return { order: existing, replayed: true };
  }
  if (a.status !== "encerrada" || !a.closing)
    throw new DomainError(409, "ARENA_NOT_CLOSED", "Encerre e selecione o vencedor antes de gerar o pedido.");
  requireVersion(a, body.expectedVersion);
  if (a.unavailable.length && body.acknowledgeShortage !== true)
    throw new DomainError(422, "SHORTAGE_NOT_ACKNOWLEDGED",
      `Reconheça explicitamente a falta de ${a.unavailable.map((u) => u.productName).join(", ")} para gerar o pedido parcial.`,
      a.unavailable);
  requireSameBasket(db, a, now);
  const current = evaluateProposal(
    a.proposals.find((p) => p.supplierId === a.closing!.winnerSupplierId)!,
    a.basket, db.catalog, a.params, dateOf(now),
  );
  const diffs = sameOffer(a.closing.evaluation, current);
  if (diffs.length)
    throw new DomainError(409, "OFFER_CHANGED", `A oferta vencedora mudou desde o encerramento: ${diffs.join("; ")}. Crie nova arena.`, diffs);

  const seq = ++db.seq.order;
  const order: Order = {
    id: `PED-${String(seq).padStart(5, "0")}`,
    arenaId: a.id,
    arenaVersion: a.version,
    createdAt: now,
    supplierId: current.supplierId,
    supplierName: current.supplierName,
    origin: current.origin,
    destination: a.params.destination,
    lines: current.lines.map((l) => {
      const p = db.catalog.products.find((x) => x.id === l.productId)!;
      return { productId: l.productId, productName: p.name, unit: p.unit, quantity: l.quantity,
               unitCents: Math.round(l.totalCents / l.quantity), totalCents: l.totalCents };
    }),
    shortages: a.unavailable,
    shortageAcknowledged: a.unavailable.length > 0,
    logistics: current.logistics,
    merchandiseCents: current.merchandiseCents,
    logisticsCents: current.logisticsCents,
    freightCents: current.freightCents,
    insuranceCents: current.insuranceCents,
    expensesCents: current.expensesCents,
    disbursementCents: current.disbursementCents,
    economicCents: current.economicCents,
    reductionPct: current.reductionPct,
    improvementVsInitialCents:
      a.closing.initialBestDisbursementCents !== null ? a.closing.initialBestDisbursementCents - current.disbursementCents : null,
    status: "interno",
  };
  db.orders.push(order);
  a.orderId = order.id;
  a.version++;
  audit(db, now, "pedido.criado", order.id, `Arena ${a.id} via ${via}; ${current.supplierName}; desembolso ${order.disbursementCents}c`);
  return { order, replayed: false };
}

export function newDb(catalog: Catalog): Db {
  return { catalog, arenas: [], orders: [], audit: [], users: [], sessions: [], seq: { arena: 0, order: 0, audit: 0, user: 0 } };
}

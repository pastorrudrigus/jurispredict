import type { Budget, Location, LogisticsTerms, Product, Supplier, SupplierOffer } from "./contracts";
import { daysBetween, presentValue, type Cents } from "./money";
import { incrementalFreight, logisticsTotal, validateLogistics } from "./transport";

export interface ArenaParams {
  destination: Location;
  budgetId: string;
  ceilingCents: Cents;
  maxLeadTimeDays: number;
  /** Taxa anual (%) para trazer o desembolso a valor presente pelo prazo de pagamento. */
  annualRatePct: number;
  maxRounds: number;
  /** Melhoria por rodada simulada (pontos percentuais da tabela). */
  roundStepPct: number;
  /** Limite hipotético de redução acumulada sobre a tabela inicial. */
  maxReductionPct: number;
}

export interface BasketItem {
  productId: string;
  quantity: number;
}

export interface UnavailableItem {
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
}

export interface ProposalState {
  supplierId: string;
  /** Redução acumulada (pp) sobre a tabela inicial do fornecedor. */
  reductionPct: number;
  logistics: LogisticsTerms;
}

export interface EvaluatedLine {
  productId: string;
  quantity: number;
  tableUnitCents: Cents;
  totalCents: Cents;
  ok: boolean;
  issue?: string;
}

export interface ProposalEvaluation {
  supplierId: string;
  supplierName: string;
  origin: Location;
  apt: boolean;
  reasons: string[];
  reductionPct: number;
  lines: EvaluatedLine[];
  merchandiseCents: Cents;
  freightCents: Cents;
  freightAbsorbed: boolean;
  insuranceCents: Cents;
  expensesCents: Cents;
  logisticsCents: Cents;
  disbursementCents: Cents;
  economicCents: Cents;
  leadTimeDays: number;
  paymentTermDays: number;
  logistics: LogisticsTerms;
}

export interface RankedProposal extends ProposalEvaluation {
  /** Posição no ranking (somente aptas); null para inaptas. */
  position: number | null;
}

export interface Catalog {
  products: Product[];
  suppliers: Supplier[];
  offers: SupplierOffer[];
  budgets: Budget[];
}

const offerOf = (c: Catalog, supplierId: string, productId: string) =>
  c.offers.find((o) => o.supplierId === supplierId && o.productId === productId);

/** Problema de uma oferta para atender o item, ou null se atende. */
export function offerIssue(offer: SupplierOffer | undefined, product: Product, today: string, quantity = product.quantity): string | null {
  if (!offer) return "sem oferta na tabela";
  if (offer.stock < quantity) return `estoque ${offer.stock} < ${quantity}`;
  const life = daysBetween(today, offer.expiry);
  if (life < product.minShelfLifeDays) return `vida útil ${life}d < mínima ${product.minShelfLifeDays}d`;
  return null;
}

/**
 * Cesta atendível: itens do mix que ao menos um fornecedor consegue atender
 * (estoque, validade e vida mínima). Os demais ficam explícitos como indisponíveis.
 */
export function computeBasket(c: Catalog, today: string, mix?: BasketItem[]): { basket: BasketItem[]; unavailable: UnavailableItem[] } {
  const basket: BasketItem[] = [];
  const unavailable: UnavailableItem[] = [];
  const wanted = mix ?? c.products.map((p) => ({ productId: p.id, quantity: p.quantity }));
  for (const item of wanted) {
    const p = c.products.find((x) => x.id === item.productId);
    if (!p) continue;
    const issues = c.suppliers.map((s) => ({ s, issue: offerIssue(offerOf(c, s.id, p.id), p, today, item.quantity) }));
    if (issues.some((i) => i.issue === null)) basket.push({ productId: p.id, quantity: item.quantity });
    else
      unavailable.push({
        productId: p.id,
        productName: p.name,
        quantity: item.quantity,
        reason: issues.map((i) => `${i.s.name}: ${i.issue}`).join("; "),
      });
  }
  return { basket, unavailable };
}

export const basketKey = (b: BasketItem[]) =>
  b.map((i) => `${i.productId}x${i.quantity}`).sort().join("|");

export const lineTotal = (unitCents: Cents, qty: number, reductionPct: number): Cents =>
  Math.round(unitCents * qty * (1 - reductionPct / 100));

export function evaluateProposal(
  p: ProposalState,
  basket: BasketItem[],
  c: Catalog,
  params: ArenaParams,
  today: string,
): ProposalEvaluation {
  const supplier = c.suppliers.find((s) => s.id === p.supplierId);
  if (!supplier) throw new Error(`Fornecedor desconhecido: ${p.supplierId}`);
  const reasons: string[] = [];
  const lines: EvaluatedLine[] = basket.map((item) => {
    const product = c.products.find((x) => x.id === item.productId)!;
    const offer = offerOf(c, p.supplierId, item.productId);
    const issue = offerIssue(offer, product, today, item.quantity);
    if (issue) reasons.push(`${product.name}: ${issue}`);
    const unit = offer?.unitPriceCents ?? 0;
    return {
      productId: item.productId,
      quantity: item.quantity,
      tableUnitCents: unit,
      totalCents: offer ? lineTotal(unit, item.quantity, p.reductionPct) : 0,
      ok: issue === null,
      issue: issue ?? undefined,
    };
  });
  const merchandiseCents = lines.reduce((s, l) => s + l.totalCents, 0);
  const t = p.logistics;
  const logisticsCents = logisticsTotal(t);
  const disbursementCents = merchandiseCents + logisticsCents;
  const economicCents = presentValue(disbursementCents, params.annualRatePct, t.paymentTermDays);

  for (const e of validateLogistics(t, params.destination.uf)) reasons.push(`Logística: ${e}`);
  if (disbursementCents > params.ceilingCents) reasons.push("Desembolso acima do teto da verba");
  if (t.leadTimeDays > params.maxLeadTimeDays)
    reasons.push(`Prazo ${t.leadTimeDays}d acima do máximo ${params.maxLeadTimeDays}d`);

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    origin: supplier.origin,
    apt: reasons.length === 0,
    reasons,
    reductionPct: p.reductionPct,
    lines,
    merchandiseCents,
    freightCents: incrementalFreight(t),
    freightAbsorbed: t.freightIncluded,
    insuranceCents: t.insuranceCents,
    expensesCents: t.expensesCents,
    logisticsCents,
    disbursementCents,
    economicCents,
    leadTimeDays: t.leadTimeDays,
    paymentTermDays: t.paymentTermDays,
    logistics: t,
  };
}

/**
 * Ranking somente entre aptas: custo econômico, desembolso, prazo e identificador estável.
 * Inaptas aparecem ao final, sem posição.
 */
export function rankProposals(evals: ProposalEvaluation[]): RankedProposal[] {
  const apt = evals
    .filter((e) => e.apt)
    .sort(
      (a, b) =>
        a.economicCents - b.economicCents ||
        a.disbursementCents - b.disbursementCents ||
        a.leadTimeDays - b.leadTimeDays ||
        a.supplierId.localeCompare(b.supplierId),
    );
  const inapt = evals.filter((e) => !e.apt).sort((a, b) => a.supplierId.localeCompare(b.supplierId));
  return [...apt.map((e, i) => ({ ...e, position: i + 1 })), ...inapt.map((e) => ({ ...e, position: null }))];
}

/** Explica, em linguagem simples, por que o líder está à frente. */
export function explainSelection(ranking: RankedProposal[]): string[] {
  const apt = ranking.filter((r) => r.position !== null);
  const out: string[] = [];
  if (!apt.length) return ["Nenhuma proposta apta: não há vencedor possível com a cesta e as restrições atuais."];
  const [lead, second] = apt;
  out.push(
    `${lead.supplierName} lidera com custo econômico ${fmt(lead.economicCents)} (desembolso ${fmt(lead.disbursementCents)}, prazo ${lead.leadTimeDays}d, pagamento em ${lead.paymentTermDays}d).`,
  );
  if (second) {
    const diff = second.economicCents - lead.economicCents;
    out.push(`Vantagem de ${fmt(diff)} sobre ${second.supplierName} no custo econômico.`);
  }
  const cheapestNominal = [...apt].sort((a, b) => a.merchandiseCents - b.merchandiseCents)[0];
  if (cheapestNominal.supplierId !== lead.supplierId)
    out.push(
      `${cheapestNominal.supplierName} tem a menor mercadoria (${fmt(cheapestNominal.merchandiseCents)}), mas frete/condições tornam a compra mais cara: preço nominal mais baixo não vence automaticamente.`,
    );
  for (const r of ranking.filter((x) => x.position === null))
    out.push(`${r.supplierName} está inapta: ${r.reasons.slice(0, 2).join("; ")}${r.reasons.length > 2 ? "…" : ""}`);
  out.push("Não há média entre produtos distintos nem desconto de rebate futuro no cálculo.");
  return out;
}

const fmt = (c: Cents) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Matriz por item: preço unitário de cada fornecedor e o melhor preço apto do item.
 * Serve de diagnóstico — a arena compara a cesta inteira; dividir o pedido gera fretes adicionais.
 */
export interface ItemMatrixRow {
  productId: string;
  productName: string;
  quantity: number;
  cells: { supplierId: string; unitCents: Cents | null; ok: boolean; issue?: string }[];
  bestSupplierId: string | null;
  bestUnitCents: Cents | null;
}

export function itemMatrix(evals: ProposalEvaluation[], c: Catalog): ItemMatrixRow[] {
  if (!evals.length) return [];
  return evals[0].lines.map((l) => {
    const cells = evals.map((e) => {
      const line = e.lines.find((x) => x.productId === l.productId)!;
      return {
        supplierId: e.supplierId,
        unitCents: line.totalCents ? Math.round(line.totalCents / line.quantity) : null,
        ok: line.ok,
        issue: line.issue,
      };
    });
    const best = cells.filter((x) => x.ok && x.unitCents !== null).sort((a, b) => a.unitCents! - b.unitCents! || a.supplierId.localeCompare(b.supplierId))[0];
    return {
      productId: l.productId,
      productName: c.products.find((p) => p.id === l.productId)?.name ?? l.productId,
      quantity: l.quantity,
      cells,
      bestSupplierId: best?.supplierId ?? null,
      bestUnitCents: best?.unitCents ?? null,
    };
  });
}

// ---------- Estado da arena (persistido) ----------

export type ArenaStatus = "aberta" | "encerrada";

export interface RoundRecord {
  number: number;
  at: string;
  kind: "simulada" | "manual";
  supplierId: string;
  fromPct: number;
  toPct: number;
  leaderBefore: string | null;
  leaderAfter: string | null;
}

export interface TimelinePoint {
  step: number;
  at: string;
  label: string;
  economic: Record<string, Cents | null>;
  disbursement: Record<string, Cents | null>;
  bestEconomicCents: Cents | null;
  leaderId: string | null;
}

export interface ClosingSnapshot {
  at: string;
  winnerSupplierId: string;
  basketKey: string;
  evaluation: ProposalEvaluation;
  initialBestDisbursementCents: Cents | null;
}

export interface Arena {
  id: string;
  seq: number;
  createdAt: string;
  /** Data de referência para validade/vida útil (yyyy-mm-dd). */
  today: string;
  status: ArenaStatus;
  version: number;
  /** Nome da cotação (ex.: “Mix padrão”, “Importado: reposição março”). */
  title: string;
  /** Mix solicitado (itens e quantidades) — base para recalcular a cesta. */
  mix: BasketItem[];
  params: ArenaParams;
  basket: BasketItem[];
  unavailable: UnavailableItem[];
  proposals: ProposalState[];
  rounds: RoundRecord[];
  timeline: TimelinePoint[];
  closing?: ClosingSnapshot;
  orderId?: string;
}

export interface ArenaView extends Arena {
  ranking: RankedProposal[];
  matrix: ItemMatrixRow[];
  explanation: string[];
  /** A cesta atual (catálogo vivo) diverge da cesta congelada na arena? */
  basketDrift: boolean;
  simulatedRoundsUsed: number;
}

export interface OrderLine {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitCents: Cents;
  totalCents: Cents;
}

export interface Order {
  id: string;
  arenaId: string;
  arenaVersion: number;
  createdAt: string;
  supplierId: string;
  supplierName: string;
  origin: Location;
  destination: Location;
  lines: OrderLine[];
  shortages: UnavailableItem[];
  shortageAcknowledged: boolean;
  logistics: LogisticsTerms;
  merchandiseCents: Cents;
  logisticsCents: Cents;
  freightCents: Cents;
  insuranceCents: Cents;
  expensesCents: Cents;
  disbursementCents: Cents;
  economicCents: Cents;
  reductionPct: number;
  /** Melhoria nominal vs. melhor proposta inicial (mesma cesta). */
  improvementVsInitialCents: Cents | null;
  status: "interno";
}

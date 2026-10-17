import type { Budget, LogisticsTerms, Product, Supplier, SupplierOffer } from "../shared/contracts";
import { addDays, toCents } from "../shared/money";
import type { Catalog } from "../shared/competition";

/**
 * Mix original de vinte produtos e cinco fornecedores FICTÍCIOS.
 * Valores sintéticos para demonstração — não são preços, estoques ou localizações reais.
 */
export const PRODUCTS: Product[] = [
  { id: "p01", name: "Papel toalha interfolhado (fardo 1.000 fls)", unit: "fardo", quantity: 30, ncm: "4818.20.00", minShelfLifeDays: 0 },
  { id: "p02", name: "Papel higiênico rolão 300 m (fardo 8)", unit: "fardo", quantity: 25, ncm: "4818.10.00", minShelfLifeDays: 0 },
  { id: "p03", name: "Sabonete líquido 5 L", unit: "galão", quantity: 12, ncm: "3401.30.00", minShelfLifeDays: 180 },
  { id: "p04", name: "Detergente neutro 5 L", unit: "galão", quantity: 10, ncm: "3402.50.00", cest: "11.001.00", minShelfLifeDays: 180 },
  { id: "p05", name: "Desinfetante 5 L", unit: "galão", quantity: 12, ncm: "3808.94.19", minShelfLifeDays: 180 },
  { id: "p06", name: "Água sanitária 5 L", unit: "galão", quantity: 15, ncm: "2828.90.11", cest: "11.004.00", minShelfLifeDays: 90 },
  { id: "p07", name: "Álcool 70% 1 L", unit: "frasco", quantity: 40, ncm: "2207.10.10", minShelfLifeDays: 180 },
  { id: "p08", name: "Limpa-vidros 500 mL", unit: "frasco", quantity: 12, ncm: "3405.40.00", minShelfLifeDays: 180 },
  { id: "p09", name: "Saco para lixo 100 L (pct 100)", unit: "pacote", quantity: 20, ncm: "3923.21.90", minShelfLifeDays: 0 },
  { id: "p10", name: "Saco para lixo reforçado 200 L (pct 100)", unit: "pacote", quantity: 15, ncm: "3923.21.90", minShelfLifeDays: 0 },
  { id: "p11", name: "Luva de látex (par)", unit: "par", quantity: 60, ncm: "4015.19.00", minShelfLifeDays: 180 },
  { id: "p12", name: "Pano de microfibra", unit: "unidade", quantity: 50, ncm: "6307.10.00", minShelfLifeDays: 0 },
  { id: "p13", name: "Esponja dupla face (pct 10)", unit: "pacote", quantity: 20, ncm: "3921.13.90", minShelfLifeDays: 0 },
  { id: "p14", name: "Copo descartável 200 mL (cx 2.500)", unit: "caixa", quantity: 4, ncm: "3924.10.00", minShelfLifeDays: 0 },
  { id: "p15", name: "Café torrado e moído 500 g", unit: "pacote", quantity: 30, ncm: "0901.21.00", cest: "17.096.00", minShelfLifeDays: 120 },
  { id: "p16", name: "Açúcar refinado 1 kg", unit: "pacote", quantity: 25, ncm: "1701.99.00", minShelfLifeDays: 180 },
  { id: "p17", name: "Filtro de papel 103 (cx 30)", unit: "caixa", quantity: 20, ncm: "4823.20.00", minShelfLifeDays: 0 },
  { id: "p18", name: "Guardanapo de papel (pct 50)", unit: "pacote", quantity: 30, ncm: "4818.30.00", minShelfLifeDays: 0 },
  { id: "p19", name: "Rodo 60 cm", unit: "unidade", quantity: 6, ncm: "9603.90.00", minShelfLifeDays: 0 },
  { id: "p20", name: "Vassoura de pelo", unit: "unidade", quantity: 6, ncm: "9603.10.00", minShelfLifeDays: 0 },
];

/** Preço unitário de referência (R$) usado para derivar as tabelas sintéticas. */
const REF_PRICE: Record<string, number> = {
  p01: 22.9, p02: 54.0, p03: 38.5, p04: 24.9, p05: 21.4, p06: 14.8, p07: 9.9, p08: 11.2, p09: 49.9, p10: 89.0,
  p11: 6.4, p12: 4.3, p13: 12.5, p14: 135.0, p15: 19.9, p16: 4.9, p17: 5.2, p18: 3.8, p19: 24.0, p20: 27.5,
};

export const SUPPLIERS: Supplier[] = [
  { id: "s1", name: "Abastece Minas", origin: { city: "Contagem", uf: "MG" } },
  { id: "s2", name: "Paulista Distribuidora", origin: { city: "Campinas", uf: "SP" } },
  { id: "s3", name: "Cerrado Atacado", origin: { city: "Anápolis", uf: "GO" } },
  { id: "s4", name: "Sul Suprimentos", origin: { city: "Curitiba", uf: "PR" } },
  { id: "s5", name: "Baía Comercial", origin: { city: "Feira de Santana", uf: "BA" } },
];

/** Fator de preço de tabela de cada fornecedor sobre a referência. */
const FACTOR: Record<string, number> = { s1: 1.0, s2: 1.0545, s3: 1.045, s4: 0.97, s5: 0.985 };

/** Variação determinística por item (±1,5%) para que as tabelas não sejam proporcionais. */
function wiggle(supplierId: string, productId: string): number {
  let h = 0;
  for (const ch of supplierId + productId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 31) - 15) / 1000;
}

export function buildOffers(today: string): SupplierOffer[] {
  const offers: SupplierOffer[] = [];
  for (const s of SUPPLIERS) {
    for (const p of PRODUCTS) {
      if (p.id === "p10" && s.id === "s4") continue; // sem o item na tabela
      let stock = p.quantity * 4;
      if (p.id === "p10") stock = { s1: 0, s2: 5, s3: 8, s5: 3 }[s.id] ?? 0; // ninguém atende o reforçado
      if (p.id === "p15" && s.id === "s5") stock = 10; // Baía não tem café suficiente
      const lifeDays = p.minShelfLifeDays > 0 ? p.minShelfLifeDays + 120 : 720;
      offers.push({
        supplierId: s.id,
        productId: p.id,
        unitPriceCents: toCents(REF_PRICE[p.id] * (FACTOR[s.id] + wiggle(s.id, p.id))),
        stock,
        expiry: addDays(today, lifeDays),
      });
    }
  }
  return offers;
}

export const BUDGETS: Budget[] = [
  { id: "v1", name: "Verba de limpeza e copa — Brasília/DF", ceilingCents: toCents(9000), maxLeadTimeDays: 10 },
];

/** Condições logísticas iniciais declaradas por fornecedor (editáveis em “Ajustar frete”). */
export const INITIAL_LOGISTICS: Record<string, LogisticsTerms> = {
  s1: { sellerDelivers: true, contractedBy: "vendedor", paidBy: "comprador", freightIncluded: false, modals: ["rodoviario"],
        freightCents: toCents(390), insuranceCents: toCents(22), expensesCents: toCents(25), leadTimeDays: 4, paymentTermDays: 28 },
  s2: { sellerDelivers: true, contractedBy: "vendedor", paidBy: "vendedor", freightIncluded: true, modals: ["rodoviario"],
        freightCents: toCents(450), insuranceCents: 0, expensesCents: 0, leadTimeDays: 6, paymentTermDays: 21 },
  s3: { sellerDelivers: false, contractedBy: "comprador", paidBy: "comprador", freightIncluded: false, modals: ["rodoviario"],
        freightCents: toCents(180), insuranceCents: 0, expensesCents: toCents(35), leadTimeDays: 2, paymentTermDays: 14 },
  s4: { sellerDelivers: true, contractedBy: "vendedor", paidBy: "comprador", freightIncluded: false, modals: ["rodoviario"],
        freightCents: toCents(720), insuranceCents: toCents(40), expensesCents: toCents(60), leadTimeDays: 9, paymentTermDays: 28 },
  s5: { sellerDelivers: true, contractedBy: "vendedor", paidBy: "comprador", freightIncluded: false, modals: ["cabotagem", "rodoviario"],
        freightCents: toCents(560), insuranceCents: toCents(30), expensesCents: toCents(45), leadTimeDays: 14, paymentTermDays: 30 },
};

export function seedCatalog(today: string): Catalog {
  return {
    products: structuredClone(PRODUCTS),
    suppliers: structuredClone(SUPPLIERS),
    offers: buildOffers(today),
    budgets: structuredClone(BUDGETS),
  };
}

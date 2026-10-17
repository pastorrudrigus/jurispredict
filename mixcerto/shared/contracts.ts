import type { Cents } from "./money";

export type UF =
  | "AC" | "AL" | "AM" | "AP" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MG" | "MS" | "MT"
  | "PA" | "PB" | "PE" | "PI" | "PR" | "RJ" | "RN" | "RO" | "RR" | "RS" | "SC" | "SE" | "SP" | "TO";

export interface Location {
  city: string;
  uf: UF;
}

export const DEFAULT_DESTINATION: Location = { city: "Brasília", uf: "DF" };

export interface Product {
  id: string;
  name: string;
  unit: string;
  /** Quantidade pedida no mix. */
  quantity: number;
  ncm: string;
  cest?: string;
  /** Vida útil mínima exigida na entrega (dias até o vencimento). */
  minShelfLifeDays: number;
}

export interface Supplier {
  id: string;
  name: string;
  /** Origem fictícia — não prova localização real nem atendimento territorial. */
  origin: Location;
}

/** Linha da tabela de um fornecedor para um produto. */
export interface SupplierOffer {
  supplierId: string;
  productId: string;
  unitPriceCents: Cents;
  stock: number;
  /** Data de validade do lote ofertado (ISO yyyy-mm-dd). */
  expiry: string;
}

export type Modal = "rodoviario" | "ferroviario" | "aereo" | "cabotagem";
export type Party = "vendedor" | "comprador";

export const MODAL_LABEL: Record<Modal, string> = {
  rodoviario: "Rodoviário",
  ferroviario: "Ferroviário",
  aereo: "Aéreo",
  cabotagem: "Cabotagem",
};

/** Condições logísticas declaradas em uma proposta. */
export interface LogisticsTerms {
  /** O vendedor entrega no destino? false = retirada / transportadora do comprador. */
  sellerDelivers: boolean;
  contractedBy: Party;
  paidBy: Party;
  /** Frete absorvido/incluído no preço pelo vendedor (sem cobrança incremental). */
  freightIncluded: boolean;
  modals: Modal[];
  freightCents: Cents;
  insuranceCents: Cents;
  expensesCents: Cents;
  /** Prazo total porta a porta (dias). */
  leadTimeDays: number;
  /** Prazo de pagamento concedido (dias) — afeta o custo econômico. */
  paymentTermDays: number;
}

export interface Budget {
  id: string;
  name: string;
  /** Teto de desembolso para uma compra do mix. */
  ceilingCents: Cents;
  /** Prazo máximo de entrega aceito (dias). */
  maxLeadTimeDays: number;
}

export interface AuditEvent {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
}

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

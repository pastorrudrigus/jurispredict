export function brl(valor: number | null | undefined): string | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valor);
}

/** Δ% do pedido em relação ao pago. Negativo = pedindo abaixo do que pagou. */
export function delta(
  pago: number | null | undefined,
  pedido: number | null | undefined,
): number | null {
  if (!pago || !pedido || pago <= 0) return null;
  return ((pedido - pago) / pago) * 100;
}

export function deltaTexto(
  pago: number | null | undefined,
  pedido: number | null | undefined,
): string | null {
  const d = delta(pago, pedido);
  if (d === null) return null;
  const sinal = d > 0 ? "+" : "";
  return `${sinal}${d.toFixed(0)}%`;
}

export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const meses = Math.floor(d / 30);
  return `há ${meses}mes${meses > 1 ? "es" : ""}`;
}

export function dataBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return null;
  return `${dia}/${mes}/${ano}`;
}

export function corScore(score: number | null | undefined): string {
  const s = score ?? 0;
  if (s >= 61) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (s >= 31) return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/40";
}

/** Separador de anúncios: uma linha contendo apenas `---` (3+ hífens). */
export function separarAnuncios(bruto: string): string[] {
  return bruto
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Quebra a lista em lotes de tamanho fixo, para dar feedback de progresso. */
export function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

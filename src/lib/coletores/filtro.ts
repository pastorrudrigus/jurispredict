/** Normaliza para comparar sem acento e sem variação de caixa. */
export function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Sinais de que a mensagem é um anúncio de repasse/cessão. Este é um
 * PRÉ-FILTRO barato, não a decisão final: quem decide `eh_repasse` é a IA.
 * O papel dele é não gastar token com as ~90% de mensagens de grupo que são
 * conversa fiada, bom dia e figurinha.
 *
 * Erra para o lado da inclusão de propósito — perder um lead custa mais caro
 * que gastar um token à toa.
 */
const SINAIS_REPASSE = [
  "repasse",
  "repassar",
  "repasso",
  "agio",
  "cessao de direito",
  "cedo os direito",
  "cedo direito",
  "cessao",
  "transfiro",
  "transferir contrato",
  "passo o contrato",
  "contrato de gaveta",
  "assumir financiamento",
  "assumo financiamento",
  "assumir as parcela",
  "assumir a divida",
  "na planta",
  "saldo devedor",
  "quitado com a construtora",
  "entrega em",
  "chave em",
];

/** Coisas que quase sempre indicam outro tipo de anúncio. */
const SINAIS_CONTRARIOS = [
  "alugo",
  "aluguel",
  "para alugar",
  "temporada",
  "vaga de emprego",
  "procuro emprego",
  "vendo carro",
  "vendo moto",
  "rifa",
];

export function pareceRepasse(texto: string): boolean {
  const t = normalizar(texto);
  if (SINAIS_CONTRARIOS.some((s) => t.includes(s))) {
    // Só descarta se não houver também um sinal forte de repasse: um anúncio
    // pode dizer "não é aluguel, é repasse".
    const forte = t.includes("repasse") || t.includes("agio") || t.includes("cessao");
    if (!forte) return false;
  }
  return SINAIS_REPASSE.some((s) => t.includes(s));
}

/** Chave de deduplicação dentro de um mesmo lote (o dedup definitivo é no banco). */
export function chaveDedup(texto: string): string {
  return normalizar(texto).replace(/\s+/g, " ").trim();
}

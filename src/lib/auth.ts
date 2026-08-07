export const SESSION_COOKIE = "radar_session";

const SALT = "radar-imob-goiania|v1";

/**
 * Deriva o valor do cookie de sessão a partir da senha do painel.
 * A senha em si nunca vai para o client — só este digest.
 * Usa Web Crypto para funcionar tanto no middleware (edge) quanto no Node.
 */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}|${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparação em tempo constante para não vazar o token por timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

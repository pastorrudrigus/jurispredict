import { AsyncLocalStorage } from "node:async_hooks";

/** Contexto da requisição: identifica o usuário autenticado para a trilha de auditoria. */
export const requestContext = new AsyncLocalStorage<{ actor: string }>();

export const currentActor = (fallback = "sistema") => requestContext.getStore()?.actor ?? fallback;

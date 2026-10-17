export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Disparado quando a sessão expira ou a senha precisa ser trocada — o App reage. */
export const AUTH_EVENT = "mixcerto:auth";

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "x-mixcerto": "1", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if ((res.status === 401 && path !== "/auth/login") || data.code === "PASSWORD_CHANGE_REQUIRED")
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: data.code }));
    throw new ApiFailure(res.status, data.code ?? "HTTP", data.error ?? `Erro HTTP ${res.status}`, data.details);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof ApiFailure ? e.message : String(e));

export function download(filename: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n");
}

export const SUPPLIER_COLORS: Record<string, string> = {
  s1: "#2f6fd6",
  s2: "#e08a1e",
  s3: "#16a34a",
  s4: "#7c3aed",
  s5: "#db2777",
};
export const ORIGIN_COLORS = ["#2f6fd6", "#e08a1e", "#16a34a", "#7c3aed", "#db2777"];

/** Navegação por hash com parâmetros: #/arena?id=arena-2 */
export const go = (path: string) => {
  location.hash = path;
};
export const hashParam = (k: string) => new URLSearchParams(location.hash.split("?")[1] ?? "").get(k);

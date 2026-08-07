"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

export type LoginEstado = { erro?: string };

export async function login(
  _anterior: LoginEstado | null,
  form: FormData,
): Promise<LoginEstado> {
  const senha = String(form.get("senha") ?? "");
  const destinoBruto = String(form.get("next") ?? "/");
  // só aceita caminho interno — evita open redirect
  const destino = destinoBruto.startsWith("/") && !destinoBruto.startsWith("//")
    ? destinoBruto
    : "/";

  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada) return { erro: "ADMIN_PASSWORD não configurada no servidor." };

  if (senha.length !== esperada.length || !safeEqual(senha, esperada)) {
    return { erro: "Senha incorreta." };
  }

  cookies().set(SESSION_COOKIE, await sessionToken(esperada), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(destino);
}

export async function logout(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}

"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { entrar, type AuthEstado } from "./actions";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

function Formulario() {
  const params = useSearchParams();
  const [estado, action] = useFormState<AuthEstado | null, FormData>(entrar, null);

  return (
    <form action={action} className="card w-full max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">📡 Radar Imob Goiânia</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Repasses de imóveis na planta, estruturados e prontos para trabalhar.
        </p>
      </div>

      <input type="hidden" name="next" value={params.get("next") ?? "/"} />

      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>

      <div>
        <label className="label" htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>

      {estado?.erro ? (
        <p className="text-sm text-red-400" role="alert">
          {estado.erro}
        </p>
      ) : null}

      <Botao />

      <p className="text-center text-sm text-zinc-500">
        Ainda não tem conta?{" "}
        <Link href="/cadastrar" className="text-sky-300 hover:underline">
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}

export default function EntrarPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense>
        <Formulario />
      </Suspense>
    </div>
  );
}

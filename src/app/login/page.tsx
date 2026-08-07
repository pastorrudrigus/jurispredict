"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { login, type LoginEstado } from "./actions";

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
  const [estado, action] = useFormState<LoginEstado | null, FormData>(login, null);

  return (
    <form action={action} className="card w-full max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">📡 Radar Imob Goiânia</h1>
        <p className="mt-1 text-sm text-zinc-500">Ferramenta interna. Acesso por senha.</p>
      </div>

      <input type="hidden" name="next" value={params.get("next") ?? "/"} />

      <div>
        <label className="label" htmlFor="senha">
          Senha do painel
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          autoFocus
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
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense>
        <Formulario />
      </Suspense>
    </div>
  );
}

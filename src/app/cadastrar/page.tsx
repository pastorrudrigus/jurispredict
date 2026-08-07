"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { cadastrar, type AuthEstado } from "@/app/entrar/actions";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
      {pending ? "Criando conta…" : "Criar conta"}
    </button>
  );
}

export default function CadastrarPage() {
  const [estado, action] = useFormState<AuthEstado | null, FormData>(cadastrar, null);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Criar conta de corretor</h1>
          <p className="mt-1 text-sm text-zinc-500">
            O cadastro é livre. O acesso ao pool de leads passa por uma aprovação
            manual antes de liberar.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="nome">
            Nome *
          </label>
          <input id="nome" name="nome" required className="input" />
        </div>

        <div>
          <label className="label" htmlFor="email">
            E-mail *
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="telefone">
              WhatsApp
            </label>
            <input id="telefone" name="telefone" inputMode="tel" placeholder="62999990000" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="creci">
              CRECI
            </label>
            <input id="creci" name="creci" className="input" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="senha">
            Senha * <span className="normal-case text-zinc-600">(mín. 8 caracteres)</span>
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="input"
          />
        </div>

        {estado?.erro ? (
          <p className="text-sm text-red-400" role="alert">
            {estado.erro}
          </p>
        ) : null}
        {estado?.aviso ? (
          <p className="text-sm text-emerald-300" role="status">
            {estado.aviso}
          </p>
        ) : null}

        <Botao />

        <p className="text-center text-sm text-zinc-500">
          Já tem conta?{" "}
          <Link href="/entrar" className="text-sky-300 hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}

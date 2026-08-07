"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirAcesso, definirPapel } from "@/app/actions/corretores";
import { tempoRelativo } from "@/lib/format";
import { PAPEIS, STATUS_ACESSO, type Perfil } from "@/lib/types";

const COR_ACESSO: Record<string, string> = {
  ativo: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  pendente: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  suspenso: "border-red-500/40 bg-red-500/10 text-red-300",
};

export default function TabelaCorretores({
  perfis,
  meuId,
}: {
  perfis: Perfil[];
  meuId: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function executar(fn: () => Promise<void>) {
    setErro(null);
    iniciar(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <>
      {erro ? <p className="text-sm text-red-400">{erro}</p> : null}

      <div className={`card overflow-x-auto ${pendente ? "opacity-60" : ""}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2">WhatsApp</th>
              <th className="px-3 py-2">CRECI</th>
              <th className="px-3 py-2">Cadastro</th>
              <th className="px-3 py-2">Papel</th>
              <th className="px-3 py-2">Acesso</th>
            </tr>
          </thead>
          <tbody>
            {perfis.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  Nenhuma conta ainda.
                </td>
              </tr>
            ) : (
              perfis.map((p) => (
                <tr key={p.id} className="border-b border-edge/50">
                  <td className="px-3 py-2 text-zinc-100">
                    {p.nome ?? "—"}
                    {p.id === meuId ? (
                      <span className="ml-2 text-xs text-zinc-600">(você)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{p.email ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {p.telefone ? (
                      <a
                        className="text-emerald-300 hover:underline"
                        href={`https://wa.me/55${p.telefone}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {p.telefone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{p.creci ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {tempoRelativo(p.criado_em)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input w-auto py-1 text-xs"
                      value={p.papel}
                      disabled={pendente || p.id === meuId}
                      onChange={(e) => executar(() => definirPapel(p.id, e.target.value))}
                    >
                      {PAPEIS.map((papel) => (
                        <option key={papel} value={papel}>
                          {papel}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-xs ${COR_ACESSO[p.status_acesso] ?? ""}`}
                      >
                        {p.status_acesso}
                      </span>
                      <select
                        className="input w-auto py-1 text-xs"
                        value={p.status_acesso}
                        disabled={pendente}
                        onChange={(e) => executar(() => definirAcesso(p.id, e.target.value))}
                      >
                        {STATUS_ACESSO.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

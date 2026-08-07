"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  excluirEmpreendimento,
  salvarEmpreendimento,
  type EmpreendimentoResultado,
} from "@/app/actions/empreendimentos";
import { dataBR } from "@/lib/format";
import type { Empreendimento } from "@/lib/types";

function BotaoSalvar({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Salvando…" : editando ? "Salvar alterações" : "Adicionar"}
    </button>
  );
}

export default function GerenciadorEmpreendimentos({
  empreendimentos,
}: {
  empreendimentos: Empreendimento[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Empreendimento | null>(null);
  const [pendente, iniciar] = useTransition();
  const [estado, action] = useFormState<EmpreendimentoResultado | null, FormData>(
    async (anterior, form) => {
      const r = await salvarEmpreendimento(anterior, form);
      if (r.ok) {
        setEditando(null);
        router.refresh();
      }
      return r;
    },
    null,
  );

  // key força o React a recriar o form (e resetar os defaultValue) ao trocar de item
  const chaveForm = editando?.id ?? "novo";

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="card h-fit p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          {editando ? "Editar empreendimento" : "Novo empreendimento"}
        </h2>

        <form key={chaveForm} action={action} className="space-y-3">
          <input type="hidden" name="id" value={editando?.id ?? ""} />

          <div>
            <label className="label" htmlFor="nome">
              Nome *
            </label>
            <input
              id="nome"
              name="nome"
              required
              className="input"
              defaultValue={editando?.nome ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="construtora">
                Construtora
              </label>
              <input
                id="construtora"
                name="construtora"
                className="input"
                defaultValue={editando?.construtora ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="bairro">
                Bairro
              </label>
              <input
                id="bairro"
                name="bairro"
                className="input"
                defaultValue={editando?.bairro ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="cidade">
                Cidade
              </label>
              <input
                id="cidade"
                name="cidade"
                className="input"
                defaultValue={editando?.cidade ?? "Goiânia"}
              />
            </div>
            <div>
              <label className="label" htmlFor="data_entrega_prevista">
                Entrega prevista
              </label>
              <input
                id="data_entrega_prevista"
                name="data_entrega_prevista"
                type="date"
                className="input"
                defaultValue={editando?.data_entrega_prevista ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="fase_obra">
                Fase da obra
              </label>
              <input
                id="fase_obra"
                name="fase_obra"
                className="input"
                placeholder="fundação, estrutura, acabamento…"
                defaultValue={editando?.fase_obra ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="total_unidades">
                Total de unidades
              </label>
              <input
                id="total_unidades"
                name="total_unidades"
                type="number"
                min="0"
                className="input"
                defaultValue={editando?.total_unidades ?? ""}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="fonte">
              Fonte do dado (URL)
            </label>
            <input
              id="fonte"
              name="fonte"
              className="input"
              placeholder="https://construtora.com.br/empreendimento"
              defaultValue={editando?.fonte ?? ""}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              name="financiamento_proprio"
              defaultChecked={editando?.financiamento_proprio ?? false}
            />
            Financiamento próprio da construtora
          </label>

          {estado?.erro ? (
            <p className="text-sm text-red-400">{estado.erro}</p>
          ) : null}

          <div className="flex gap-2">
            <BotaoSalvar editando={Boolean(editando)} />
            {editando ? (
              <button type="button" className="btn" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Construtora</th>
              <th className="px-3 py-2">Bairro</th>
              <th className="px-3 py-2">Entrega</th>
              <th className="px-3 py-2 text-right">Unid.</th>
              <th className="px-3 py-2">Fin. próprio</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {empreendimentos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  Nenhum empreendimento cadastrado. Rode{" "}
                  <code>scripts/seed.sql</code> ou use o formulário ao lado.
                </td>
              </tr>
            ) : (
              empreendimentos.map((e) => (
                <tr key={e.id} className="border-b border-edge/50">
                  <td className="px-3 py-2 text-zinc-100">{e.nome}</td>
                  <td className="px-3 py-2 text-zinc-400">{e.construtora ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{e.bairro ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {dataBR(e.data_entrega_prevista) ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                    {e.total_unidades ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {e.financiamento_proprio ? "sim" : "não"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-sky-300 hover:underline"
                      onClick={() => setEditando(e)}
                    >
                      editar
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-xs text-red-400 hover:underline disabled:opacity-50"
                      disabled={pendente}
                      onClick={() => {
                        if (!confirm(`Excluir "${e.nome}"?`)) return;
                        iniciar(async () => {
                          await excluirEmpreendimento(e.id);
                          router.refresh();
                        });
                      }}
                    >
                      excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl, corScore, deltaTexto, idadeLead } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { COR_CLASSE, ROTULO_CLASSE, classeLead } from "@/lib/classe";
import DrawerLead from "./DrawerLead";

const CORES_STATUS: Record<string, string> = {
  novo: "text-sky-300",
  validado: "text-emerald-300",
  distribuido: "text-violet-300",
  vendido: "text-teal-300",
  expirado: "text-zinc-500",
  invalido: "text-red-400",
};

export default function TabelaLeads({
  leads,
  admin = false,
}: {
  leads: Lead[];
  admin?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Lead | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function alternarTodos() {
    setSelecionados((atual) =>
      atual.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)),
    );
  }

  if (leads.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-zinc-500">
        {admin ? (
          <>
            Nenhum lead com esse filtro. Cole anúncios em{" "}
            <a href="/ingerir" className="text-sky-300 hover:underline">
              /ingerir
            </a>
            .
          </>
        ) : (
          "Nenhuma oportunidade com esse filtro no momento."
        )}
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-zinc-500">
              {admin ? (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={selecionados.size === leads.length && leads.length > 0}
                    onChange={alternarTodos}
                  />
                </th>
              ) : null}
              <th className="px-3 py-2 text-center">Classe</th>
              <th className="px-3 py-2">Empreendimento</th>
              <th className="px-3 py-2">Bairro</th>
              <th className="px-3 py-2">Tipologia</th>
              <th className="px-3 py-2 text-right">Pedido</th>
              <th className="px-3 py-2 text-right">Pago</th>
              <th className="px-3 py-2 text-right">Δ%</th>
              <th className="px-3 py-2 text-center">Urgência</th>
              <th className="px-3 py-2">Fonte</th>
              <th className="px-3 py-2">Idade</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const d = deltaTexto(lead.valor_pago, lead.valor_pedido);
              const dNum = d ? Number.parseFloat(d) : null;
              return (
                <tr
                  key={lead.id}
                  onClick={() => setAberto(lead)}
                  className="cursor-pointer border-b border-edge/50 transition hover:bg-zinc-800/40"
                >
                  {admin ? (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${lead.empreendimento_texto ?? lead.id}`}
                        checked={selecionados.has(lead.id)}
                        onChange={() => alternar(lead.id)}
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-xs font-bold ${COR_CLASSE[classeLead(lead)]}`}
                      title={
                        lead.anunciante_tipo
                          ? `${lead.anunciante_tipo} (confiança ${lead.anunciante_confianca ?? 0})`
                          : "anunciante não classificado"
                      }
                    >
                      {ROTULO_CLASSE[classeLead(lead)]}
                    </span>
                  </td>
                  <td className="max-w-[280px] px-3 py-2">
                    <span className="block truncate text-zinc-100">
                      {lead.empreendimentos?.nome ??
                        lead.empreendimento_texto ??
                        "— não identificado"}
                    </span>
                    {lead.empreendimentos && lead.empreendimento_texto ? (
                      <span className="block truncate text-xs text-zinc-600">
                        “{lead.empreendimento_texto}”
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {lead.bairro ?? lead.empreendimentos?.bairro ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {lead.tipologia ?? "—"}
                    {lead.area_m2 ? (
                      <span className="text-zinc-600"> · {lead.area_m2}m²</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-100">
                    {brl(lead.valor_pedido) ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {brl(lead.valor_pago) ?? "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      dNum === null
                        ? "text-zinc-600"
                        : dNum < 0
                          ? "text-emerald-300"
                          : "text-zinc-400"
                    }`}
                  >
                    {d ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${corScore(lead.score_urgencia)}`}
                    >
                      {lead.score_urgencia ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{lead.fonte}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {idadeLead(lead)}
                  </td>
                  <td
                    className={`px-3 py-2 text-xs ${CORES_STATUS[lead.status] ?? "text-zinc-400"}`}
                  >
                    {lead.status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {admin && selecionados.size > 0 ? (
        <div className="sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-3 rounded-full border border-edge bg-panel px-4 py-2 shadow-lg">
          <span className="text-sm text-zinc-300">
            {selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              router.push(`/lista?ids=${Array.from(selecionados).join(",")}`)
            }
          >
            Gerar lista →
          </button>
          <button type="button" className="btn" onClick={() => setSelecionados(new Set())}>
            Limpar
          </button>
        </div>
      ) : null}

      {aberto ? (
        <DrawerLead lead={aberto} admin={admin} aoFechar={() => setAberto(null)} />
      ) : null}
    </>
  );
}

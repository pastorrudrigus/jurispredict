"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarDistribuidos } from "@/app/actions/leads";
import BotaoCopiar from "@/components/BotaoCopiar";
import { brl, corScore, tempoRelativo } from "@/lib/format";
import { linkWhatsApp, pitchLista } from "@/lib/pitch";
import type { Lead } from "@/lib/types";

export default function GeradorLista({
  leads,
  preSelecionados,
}: {
  leads: Lead[];
  preSelecionados: string[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(preSelecionados.length ? preSelecionados : []),
  );
  const [ofertaVisivel, setOfertaVisivel] = useState(false);
  const [marcados, setMarcados] = useState<number | null>(null);

  const escolhidos = useMemo(
    () => leads.filter((l) => selecionados.has(l.id)),
    [leads, selecionados],
  );

  const mensagem = useMemo(
    () => (escolhidos.length ? pitchLista(escolhidos) : ""),
    [escolhidos],
  );

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
    setOfertaVisivel(false);
    setMarcados(null);
  }

  function distribuir() {
    const ids = escolhidos.map((l) => l.id);
    iniciar(async () => {
      const n = await marcarDistribuidos(ids);
      setMarcados(n);
      setOfertaVisivel(false);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-edge px-3 py-2 text-xs text-zinc-500">
          <span>
            {escolhidos.length} de {leads.length} selecionado
            {escolhidos.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              className="hover:text-zinc-200"
              onClick={() => setSelecionados(new Set(leads.map((l) => l.id)))}
            >
              marcar todos
            </button>
            <button
              type="button"
              className="hover:text-zinc-200"
              onClick={() => setSelecionados(new Set())}
            >
              limpar
            </button>
          </div>
        </div>

        {leads.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">
            Nenhum lead disponível com esse filtro.
          </p>
        ) : (
          <ul className="divide-y divide-edge/60">
            {leads.map((lead) => (
              <li key={lead.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 transition hover:bg-zinc-800/40">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selecionados.has(lead.id)}
                    onChange={() => alternar(lead.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm text-zinc-100">
                        {lead.empreendimentos?.nome ??
                          lead.empreendimento_texto ??
                          "— não identificado"}
                      </span>
                      <span
                        className={`rounded border px-1.5 text-xs font-semibold ${corScore(lead.score_urgencia)}`}
                      >
                        {lead.score_urgencia ?? 0}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {lead.bairro ?? lead.empreendimentos?.bairro ?? "sem bairro"}
                      {lead.tipologia ? ` · ${lead.tipologia}` : ""}
                      {lead.valor_pedido ? ` · ${brl(lead.valor_pedido)}` : ""} ·{" "}
                      {lead.status} · {tempoRelativo(lead.criado_em)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="label mb-0">Mensagem gerada</h2>

        <pre className="min-h-[300px] flex-1 overflow-auto whitespace-pre-wrap rounded border border-edge bg-ink p-3 text-sm text-zinc-300">
          {mensagem || "Selecione ao menos um lead para gerar a mensagem."}
        </pre>

        <div className="flex flex-wrap gap-2">
          <BotaoCopiar
            texto={mensagem}
            rotulo="Copiar mensagem"
            className="btn btn-primary"
            aoCopiar={() => setOfertaVisivel(escolhidos.length > 0)}
          />
          <a
            className={`btn btn-wa ${escolhidos.length === 0 ? "pointer-events-none opacity-50" : ""}`}
            href={linkWhatsApp(mensagem)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOfertaVisivel(escolhidos.length > 0)}
          >
            Abrir no WhatsApp
          </a>
        </div>

        {ofertaVisivel ? (
          <div className="rounded border border-sky-600/40 bg-sky-500/10 p-3 text-sm">
            <p className="text-zinc-200">
              Marcar {escolhidos.length} lead{escolhidos.length === 1 ? "" : "s"} como{" "}
              <strong>distribuído</strong>?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={distribuir}
                disabled={pendente}
              >
                {pendente ? "Marcando…" : "Sim, marcar"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setOfertaVisivel(false)}
              >
                Agora não
              </button>
            </div>
          </div>
        ) : null}

        {marcados !== null ? (
          <p className="text-sm text-emerald-300">
            {marcados} lead{marcados === 1 ? "" : "s"} marcado
            {marcados === 1 ? "" : "s"} como distribuído.
          </p>
        ) : null}
      </section>
    </div>
  );
}

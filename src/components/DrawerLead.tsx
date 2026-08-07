"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarStatus } from "@/app/actions/leads";
import { brl, corScore, dataBR, deltaTexto, tempoRelativo } from "@/lib/format";
import { linkWhatsApp, pitchIndividual } from "@/lib/pitch";
import { STATUS, type Lead } from "@/lib/types";
import BotaoCopiar from "./BotaoCopiar";

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  if (valor === null || valor === undefined || valor === "") return null;
  return (
    <div className="flex gap-3 border-b border-edge/60 py-1.5 text-sm">
      <span className="w-40 shrink-0 text-zinc-500">{rotulo}</span>
      <span className="text-zinc-200">{valor}</span>
    </div>
  );
}

export default function DrawerLead({
  lead,
  aoFechar,
}: {
  lead: Lead;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [status, setStatus] = useState(lead.status);
  const pitch = pitchIndividual(lead);

  function mudarStatus(novo: string) {
    setStatus(novo);
    iniciar(async () => {
      await atualizarStatus(lead.id, novo);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/60"
        onClick={aoFechar}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-edge bg-panel">
        <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-edge bg-panel px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {lead.empreendimentos?.nome ??
                lead.empreendimento_texto ??
                "Empreendimento não identificado"}
            </h2>
            <p className="text-xs text-zinc-500">
              {lead.bairro ?? lead.empreendimentos?.bairro ?? "bairro não informado"} ·{" "}
              {lead.fonte} · captado {tempoRelativo(lead.criado_em)}
            </p>
          </div>
          <button type="button" className="btn" onClick={aoFechar}>
            Fechar
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-1 text-sm font-semibold ${corScore(lead.score_urgencia)}`}
            >
              🔥 {lead.score_urgencia ?? 0}/100
            </span>
            <select
              className="input w-auto"
              value={status}
              onChange={(e) => mudarStatus(e.target.value)}
              disabled={pendente}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <BotaoCopiar texto={pitch} rotulo="Copiar pitch" />
            <a
              className="btn btn-wa"
              href={linkWhatsApp(pitch)}
              target="_blank"
              rel="noreferrer"
            >
              Enviar via WhatsApp
            </a>
          </div>

          <section>
            <h3 className="label">Dados extraídos</h3>
            <Linha rotulo="Empreendimento (texto)" valor={lead.empreendimento_texto} />
            <Linha rotulo="Empreendimento (vinculado)" valor={lead.empreendimentos?.nome} />
            <Linha rotulo="Construtora" valor={lead.empreendimentos?.construtora} />
            <Linha rotulo="Bairro" valor={lead.bairro} />
            <Linha rotulo="Tipologia" valor={lead.tipologia} />
            <Linha rotulo="Área" valor={lead.area_m2 ? `${lead.area_m2} m²` : null} />
            <Linha rotulo="Valor pedido" valor={brl(lead.valor_pedido)} />
            <Linha rotulo="Valor pago" valor={brl(lead.valor_pago)} />
            <Linha
              rotulo="Δ% pedido vs pago"
              valor={deltaTexto(lead.valor_pago, lead.valor_pedido)}
            />
            <Linha rotulo="Saldo devedor" valor={brl(lead.saldo_devedor)} />
            <Linha rotulo="Fase da obra (anúncio)" valor={lead.fase_obra_mencionada} />
            <Linha
              rotulo="Entrega prevista"
              valor={dataBR(lead.empreendimentos?.data_entrega_prevista ?? null)}
            />
            <Linha rotulo="Contato" valor={lead.nome_contato} />
            <Linha
              rotulo="Telefone"
              valor={
                lead.telefone_contato ? (
                  <a
                    className="text-emerald-300 hover:underline"
                    href={`https://wa.me/55${lead.telefone_contato}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {lead.telefone_contato}
                  </a>
                ) : null
              }
            />
            <Linha
              rotulo="Sinais de urgência"
              valor={(lead.sinais_urgencia ?? []).join(", ") || null}
            />
            <Linha
              rotulo="URL de origem"
              valor={
                lead.url_original ? (
                  <a
                    className="text-sky-300 hover:underline"
                    href={lead.url_original}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {lead.url_original}
                  </a>
                ) : null
              }
            />
            <Linha rotulo="Modelo de extração" valor={lead.modelo_extracao} />
          </section>

          <section>
            <h3 className="label">Pitch gerado</h3>
            <pre className="whitespace-pre-wrap rounded border border-edge bg-ink p-3 text-sm text-zinc-300">
              {pitch}
            </pre>
          </section>

          <section>
            <h3 className="label">Texto bruto do anúncio</h3>
            <pre className="whitespace-pre-wrap rounded border border-edge bg-ink p-3 text-[13px] leading-relaxed text-zinc-400">
              {lead.texto_bruto}
            </pre>
          </section>
        </div>
      </aside>
    </div>
  );
}

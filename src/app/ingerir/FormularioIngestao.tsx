"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ingerirLote } from "@/app/actions/ingest";
import { emLotes, separarAnuncios } from "@/lib/split";
import { brl } from "@/lib/format";
import { FONTES, type ResultadoItem } from "@/lib/types";

const TAMANHO_LOTE = 20;

const BADGE: Record<ResultadoItem["situacao"], { rotulo: string; classe: string }> = {
  novo: { rotulo: "✅ novo", classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  duplicado: { rotulo: "⚠️ duplicado", classe: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  nao_repasse: { rotulo: "❌ não é repasse", classe: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400" },
  erro: { rotulo: "💥 erro", classe: "border-red-500/40 bg-red-500/10 text-red-300" },
};

function Campo({ rotulo, valor }: { rotulo: string; valor: string | number | null }) {
  if (valor === null || valor === undefined || valor === "") return null;
  return (
    <span className="text-xs text-zinc-400">
      <span className="text-zinc-600">{rotulo}:</span> {valor}
    </span>
  );
}

export default function FormularioIngestao() {
  const [texto, setTexto] = useState("");
  const [fonte, setFonte] = useState<string>("whatsapp");
  const [url, setUrl] = useState("");
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultados, setResultados] = useState<ResultadoItem[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const anuncios = useMemo(() => separarAnuncios(texto), [texto]);

  const resumo = useMemo(() => {
    const c = { novo: 0, duplicado: 0, nao_repasse: 0, erro: 0 };
    for (const r of resultados) c[r.situacao]++;
    return c;
  }, [resultados]);

  async function processar() {
    if (anuncios.length === 0 || processando) return;
    setProcessando(true);
    setErroGeral(null);
    setResultados([]);
    setProgresso({ feitos: 0, total: anuncios.length });

    try {
      let offset = 0;
      for (const lote of emLotes(anuncios, TAMANHO_LOTE)) {
        const parciais = await ingerirLote({
          fonte,
          urlOriginal: url,
          textos: lote,
          offsetIndice: offset,
        });
        offset += lote.length;
        setResultados((atual) => [...atual, ...parciais]);
        setProgresso({ feitos: offset, total: anuncios.length });
      }
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  const pct = progresso.total
    ? Math.round((progresso.feitos / progresso.total) * 100)
    : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fonte">
              Fonte
            </label>
            <select
              id="fonte"
              className="input"
              value={fonte}
              onChange={(e) => setFonte(e.target.value)}
              disabled={processando}
            >
              {FONTES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="url">
              URL de origem (opcional)
            </label>
            <input
              id="url"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://olx.com.br/..."
              disabled={processando}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="anuncios">
            Anúncios brutos — {anuncios.length} detectado
            {anuncios.length === 1 ? "" : "s"}
          </label>
          <textarea
            id="anuncios"
            className="input h-[420px] font-mono text-[13px] leading-relaxed"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={processando}
            placeholder={
              "Repasse apto 2/4 no [empreendimento], 62m², Setor Bueno.\nPaguei 90 mil, quero 80 mil, saldo 320 mil com a construtora.\nPreciso vender rápido, vou mudar de estado. (62) 99999-0000\n\n---\n\nSegundo anúncio aqui..."
            }
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            onClick={processar}
            disabled={processando || anuncios.length === 0}
          >
            {processando ? `Processando ${progresso.feitos}/${progresso.total}…` : "Processar lote"}
          </button>
          {resultados.length > 0 && !processando ? (
            <Link href="/" className="btn">
              Ver no painel →
            </Link>
          ) : null}
        </div>

        {processando ? (
          <div className="h-1.5 w-full overflow-hidden rounded bg-edge">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}

        {erroGeral ? (
          <p className="text-sm text-red-400">Falha no lote: {erroGeral}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        {resultados.length > 0 ? (
          <div className="card flex flex-wrap gap-4 p-3 text-sm">
            <span className="text-emerald-300">✅ {resumo.novo} novos</span>
            <span className="text-amber-300">⚠️ {resumo.duplicado} duplicados</span>
            <span className="text-zinc-400">❌ {resumo.nao_repasse} não-repasse</span>
            <span className="text-red-300">💥 {resumo.erro} erros</span>
          </div>
        ) : (
          <div className="card p-4 text-sm text-zinc-500">
            Os resultados do lote aparecem aqui, item a item, para conferência.
          </div>
        )}

        <ol className="space-y-2">
          {resultados.map((r) => {
            const badge = BADGE[r.situacao];
            const l = r.lead;
            return (
              <li key={r.indice} className="card p-3">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${badge.classe}`}
                  >
                    {badge.rotulo}
                  </span>
                  <span className="text-xs text-zinc-600">#{r.indice + 1}</span>
                </div>

                <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{r.trecho}</p>

                {r.mensagem ? (
                  <p className="mt-2 text-xs text-red-400">{r.mensagem}</p>
                ) : null}

                {l ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <Campo rotulo="Empreend." valor={l.empreendimento_texto} />
                    <Campo
                      rotulo="Vinculado"
                      valor={
                        r.empreendimento_match
                          ? `${r.empreendimento_match.nome} (${r.empreendimento_match.sim.toFixed(2)})`
                          : null
                      }
                    />
                    <Campo rotulo="Bairro" valor={l.bairro} />
                    <Campo rotulo="Tipologia" valor={l.tipologia} />
                    <Campo rotulo="Área" valor={l.area_m2 ? `${l.area_m2} m²` : null} />
                    <Campo rotulo="Pedido" valor={brl(l.valor_pedido)} />
                    <Campo rotulo="Pago" valor={brl(l.valor_pago)} />
                    <Campo rotulo="Saldo" valor={brl(l.saldo_devedor)} />
                    <Campo rotulo="Contato" valor={l.nome_contato} />
                    <Campo rotulo="Tel" valor={l.telefone_contato} />
                    <Campo rotulo="Urgência" valor={`${l.score_urgencia ?? 0}/100`} />
                    <Campo
                      rotulo="Sinais"
                      valor={(l.sinais_urgencia ?? []).join(", ") || null}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

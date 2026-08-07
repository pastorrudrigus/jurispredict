"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ingerirLote } from "@/app/actions/ingest";
import { coletarDeExportWhatsApp } from "@/lib/coletores/whatsapp";
import type { AnuncioBruto, ResultadoColeta } from "@/lib/coletores/tipos";
import { emLotes } from "@/lib/split";
import { tempoRelativo } from "@/lib/format";
import type { ResultadoItem } from "@/lib/types";

const TAMANHO_LOTE = 20;

const ROTULO_DESCARTE: Record<string, string> = {
  mensagem_de_sistema: "avisos do WhatsApp",
  midia_sem_texto: "mídia sem texto",
  apagada: "mensagens apagadas",
  curta_demais: "curtas demais",
  sem_sinal_de_repasse: "sem sinal de repasse",
  duplicada_no_lote: "repetidas no arquivo",
};

const BADGE: Record<ResultadoItem["situacao"], { rotulo: string; classe: string }> = {
  novo: { rotulo: "✅ novo", classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  duplicado: { rotulo: "⚠️ duplicado", classe: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  nao_repasse: { rotulo: "❌ não é repasse", classe: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400" },
  erro: { rotulo: "💥 erro", classe: "border-red-500/40 bg-red-500/10 text-red-300" },
};

export default function ColetorWhatsApp() {
  const [conteudo, setConteudo] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [ignorados, setIgnorados] = useState<Set<number>>(new Set());
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultados, setResultados] = useState<ResultadoItem[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const coleta: ResultadoColeta | null = useMemo(
    () => (conteudo.trim() ? coletarDeExportWhatsApp(conteudo) : null),
    [conteudo],
  );

  const selecionados: AnuncioBruto[] = useMemo(
    () => (coleta?.candidatos ?? []).filter((_, i) => !ignorados.has(i)),
    [coleta, ignorados],
  );

  async function carregarArquivo(arquivo: File) {
    setNomeArquivo(arquivo.name);
    setIgnorados(new Set());
    setResultados([]);
    setConteudo(await arquivo.text());
  }

  function alternar(i: number) {
    setIgnorados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(i)) proximo.delete(i);
      else proximo.add(i);
      return proximo;
    });
  }

  async function ingerir() {
    if (selecionados.length === 0 || processando) return;
    setProcessando(true);
    setErroGeral(null);
    setResultados([]);
    setProgresso({ feitos: 0, total: selecionados.length });

    try {
      let offset = 0;
      for (const lote of emLotes(selecionados, TAMANHO_LOTE)) {
        const parciais = await ingerirLote({
          fonte: "whatsapp",
          itens: lote.map((c) => ({ texto: c.texto, anunciadoEm: c.enviadoEm })),
          offsetIndice: offset,
        });
        offset += lote.length;
        setResultados((atual) => [...atual, ...parciais]);
        setProgresso({ feitos: offset, total: selecionados.length });
      }
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  const descartados = coleta
    ? coleta.totalMensagens - coleta.candidatos.length
    : 0;
  const pct = coleta?.totalMensagens
    ? Math.round((descartados / coleta.totalMensagens) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="arquivo">
              Arquivo do export (.txt)
            </label>
            <input
              id="arquivo"
              type="file"
              accept=".txt,text/plain"
              className="input w-auto file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-2 file:py-1 file:text-zinc-200"
              disabled={processando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void carregarArquivo(f);
              }}
            />
          </div>
          {nomeArquivo ? (
            <span className="pb-2 text-xs text-zinc-500">{nomeArquivo}</span>
          ) : null}
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
            ou colar o conteúdo direto
          </summary>
          <textarea
            className="input mt-2 h-40 font-mono text-[13px]"
            value={conteudo}
            disabled={processando}
            onChange={(e) => {
              setConteudo(e.target.value);
              setIgnorados(new Set());
            }}
            placeholder="07/08/2026 09:02 - Fulano: REPASSE apto 2/4 ..."
          />
        </details>
      </section>

      {coleta ? (
        <>
          <section className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-3 text-sm">
            <span className="text-zinc-300">
              <strong className="text-zinc-100">{coleta.totalMensagens}</strong> mensagens
            </span>
            <span className="text-emerald-300">
              <strong>{coleta.candidatos.length}</strong> candidatos a anúncio
            </span>
            <span className="text-zinc-500">
              {descartados} descartados ({pct}% de economia de token)
            </span>
            <span className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
              {Object.entries(coleta.descartes)
                .filter(([, n]) => n > 0)
                .map(([motivo, n]) => (
                  <span key={motivo}>
                    {ROTULO_DESCARTE[motivo] ?? motivo}: {n}
                  </span>
                ))}
            </span>
          </section>

          <section className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={ingerir}
              disabled={processando || selecionados.length === 0}
            >
              {processando
                ? `Extraindo ${progresso.feitos}/${progresso.total}…`
                : `Ingerir ${selecionados.length} anúncio${selecionados.length === 1 ? "" : "s"}`}
            </button>
            {ignorados.size > 0 ? (
              <button type="button" className="btn" onClick={() => setIgnorados(new Set())}>
                Restaurar {ignorados.size} ignorado{ignorados.size === 1 ? "" : "s"}
              </button>
            ) : null}
            {resultados.length > 0 && !processando ? (
              <Link href="/" className="btn">
                Ver no painel →
              </Link>
            ) : null}
          </section>

          {processando ? (
            <div className="h-1.5 w-full overflow-hidden rounded bg-edge">
              <div
                className="h-full bg-sky-500 transition-all"
                style={{
                  width: `${Math.round((progresso.feitos / Math.max(progresso.total, 1)) * 100)}%`,
                }}
              />
            </div>
          ) : null}

          {erroGeral ? <p className="text-sm text-red-400">{erroGeral}</p> : null}

          {resultados.length > 0 ? (
            <ol className="space-y-2">
              {resultados.map((r) => (
                <li key={r.indice} className="card flex items-start gap-3 p-3">
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${BADGE[r.situacao].classe}`}
                  >
                    {BADGE[r.situacao].rotulo}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-xs text-zinc-500">
                      {r.trecho}
                    </span>
                    {r.mensagem ? (
                      <span className="mt-1 block text-xs text-red-400">{r.mensagem}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="space-y-2">
              {coleta.candidatos.map((c, i) => {
                const fora = ignorados.has(i);
                return (
                  <li key={i} className={`card p-3 ${fora ? "opacity-40" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs text-zinc-500">
                        {c.autor} ·{" "}
                        {c.enviadoEm
                          ? `${new Date(c.enviadoEm).toLocaleString("pt-BR")} (${tempoRelativo(c.enviadoEm)})`
                          : "sem data"}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-zinc-500 hover:text-zinc-200"
                        onClick={() => alternar(i)}
                        disabled={processando}
                      >
                        {fora ? "incluir" : "ignorar"}
                      </button>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">
                      {c.texto}
                    </pre>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, ListChecks, Sparkles, Upload } from "lucide-react";
import type { ArenaView, BasketItem, Catalog, RankedProposal, UnavailableItem } from "../../../shared/competition";
import type { Product } from "../../../shared/contracts";
import { brl } from "../../../shared/money";
import { api, errorText, go, hashParam } from "../api";
import { useAuth } from "../auth";
import { Alert, ErrorBox, PageHead, useToast } from "../components/ui";

interface BaseQuote { arenaId: string; createdAt: string; status: string; version: number; unavailable: UnavailableItem[]; ranking: RankedProposal[] }
type Tab = "base" | "nova" | "importar";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Casa uma linha importada com o catálogo por id, NCM (único) ou nome. */
function matchProduct(key: string, products: Product[]): Product | undefined {
  const k = norm(key);
  return (
    products.find((p) => p.id === k) ??
    (products.filter((p) => p.ncm.replace(/\D/g, "") === k.replace(/\D/g, "") && k.replace(/\D/g, "").length >= 8).length === 1
      ? products.find((p) => p.ncm.replace(/\D/g, "") === k.replace(/\D/g, ""))
      : undefined) ??
    products.find((p) => norm(p.name) === k) ??
    products.find((p) => norm(p.name).includes(k) && k.length >= 4)
  );
}

export interface ParsedLine { raw: string; key: string; quantity: number; product?: Product; error?: string }

export function parseMix(text: string, products: Product[]): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(produto|item|id|codigo|código)[;,\t]/i.test(l))
    .map((raw) => {
      const parts = raw.split(/[;\t]|,(?=\s*\d+\s*$)/).map((s) => s.trim()).filter(Boolean);
      const qty = Number((parts[parts.length - 1] ?? "").replace(/\./g, "").replace(",", "."));
      const key = parts.slice(0, -1).join(" ");
      if (parts.length < 2 || !Number.isInteger(qty) || qty <= 0) return { raw, key: key || raw, quantity: 0, error: "Use o formato produto;quantidade (inteiro positivo)." };
      const product = matchProduct(key, products);
      return { raw, key, quantity: qty, product, error: product ? undefined : "Produto não encontrado no catálogo." };
    });
}

export default function Cotacoes() {
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>((hashParam("tab") as Tab) ?? "base");
  const [quotes, setQuotes] = useState<BaseQuote[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Nova cotação
  const [title, setTitle] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  // Importar
  const [csv, setCsv] = useState("");
  const [importTitle, setImportTitle] = useState("");

  const load = () => api<BaseQuote[]>("GET", "/cotacoes").then(setQuotes).catch((e) => setError(errorText(e)));
  useEffect(() => {
    load();
    api<Catalog>("GET", "/catalogo").then((c) => {
      setCatalog(c);
      setQty(Object.fromEntries(c.products.map((p) => [p.id, p.quantity])));
      setSel(Object.fromEntries(c.products.map((p) => [p.id, true])));
    });
  }, []);

  const parsed = useMemo(() => (catalog ? parseMix(csv, catalog.products) : []), [csv, catalog]);
  const validImport = parsed.filter((l) => l.product);

  const createArena = async (mix: BasketItem[], t: string) => {
    setBusy(true);
    setError(null);
    try {
      const a = await api<ArenaView>("POST", "/arenas", { mix, title: t || undefined });
      toast(`Cotação criada: ${a.basket.length} itens atendíveis${a.unavailable.length ? `, ${a.unavailable.length} indisponível(is)` : ""}.`);
      go(`/arena?id=${a.id}`);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const orderFromQuote = async (q: BaseQuote) => {
    setError(null);
    try {
      const out = await api<{ order: { id: string }; replayed: boolean }>("POST", `/cotacoes/${q.arenaId}/pedido`, { expectedVersion: q.version, acknowledgeShortage: true });
      toast(`Pedido ${out.order.id} ${out.replayed ? "já existia (sem duplicação)" : "gerado"} com as mesmas regras da arena.`);
    } catch (e) { setError(`Cotação-base não contorna as regras: ${errorText(e)}`); }
    load();
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 500_000) return setError("Arquivo grande demais (máx. 500 KB).");
    setCsv(await f.text());
    if (!importTitle) setImportTitle(`Importado: ${f.name.replace(/\.[^.]+$/, "")}`);
  };

  const novaItems = catalog?.products.filter((p) => sel[p.id] && (qty[p.id] ?? 0) > 0).map((p) => ({ productId: p.id, quantity: qty[p.id] })) ?? [];

  return (
    <>
      <PageHead eyebrow="Cotações de mix" title="Monte, importe e compare." sub="Cada cotação vira uma arena com cinco fornecedores e as mesmas regras de seleção." />
      <ErrorBox error={error} onClose={() => setError(null)} />
      <div className="tabs">
        <button className={tab === "base" ? "on" : ""} onClick={() => setTab("base")}><ListChecks size={15} /> Cotações-base</button>
        {can("negociar") && <button className={tab === "nova" ? "on" : ""} onClick={() => setTab("nova")}><Sparkles size={15} /> Nova cotação</button>}
        {can("negociar") && <button className={tab === "importar" ? "on" : ""} onClick={() => setTab("importar")}><Upload size={15} /> Importar mix</button>}
      </div>

      {tab === "base" && (
        <>
          <Alert tone="info">Tabela inicial de cada arena, sem negociação. Pedir pela cotação passa pelas <b>mesmas regras</b> da arena: encerramento, reconhecimento da falta, versão e revalidação.</Alert>
          {!quotes.length && <div className="card muted">Nenhuma cotação ainda. Crie uma em “Nova cotação” ou ative a competição na Visão inteligente.</div>}
          {quotes.map((q) => (
            <div className="card" key={q.arenaId}>
              <div className="card-head">
                <h2>{q.arenaId} <span className={`pill ${q.status === "aberta" ? "info" : "neutral"}`}>{q.status}</span></h2>
                <div className="row">
                  <a className="btn" href={`#/arena?id=${q.arenaId}`}>Abrir arena</a>
                  {can("negociar") && <button onClick={() => orderFromQuote(q)}>Gerar pedido pela cotação</button>}
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Fornecedor</th><th className="n">Mercadorias</th><th className="n">Logística</th><th className="n">Desembolso</th><th className="n">Custo econômico</th><th>Situação</th></tr></thead>
                  <tbody>{q.ranking.map((r) => (
                    <tr key={r.supplierId}><td>{r.position ?? "—"}</td><td>{r.supplierName}</td><td className="n">{brl(r.merchandiseCents)}</td><td className="n">{brl(r.logisticsCents)}</td>
                      <td className="n">{brl(r.disbursementCents)}</td><td className="n">{brl(r.economicCents)}</td><td>{r.apt ? <span className="pill ok">apta</span> : <span className="pill bad" title={r.reasons.join("; ")}>inapta</span>}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "nova" && catalog && (
        <div className="card">
          <div className="card-head">
            <h2>Nova cotação a partir do catálogo</h2>
            <div className="row">
              <button className="link" onClick={() => setSel(Object.fromEntries(catalog.products.map((p) => [p.id, true])))}>marcar todos</button>
              <button className="link" onClick={() => setSel({})}>limpar</button>
            </div>
          </div>
          <label className="f" style={{ maxWidth: 420, marginBottom: 14 }}>Nome da cotação<input value={title} placeholder="Ex.: Reposição quinzenal — copa" onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="table-wrap">
            <table>
              <thead><tr><th></th><th>Produto</th><th>NCM</th><th>Unidade</th><th className="n">Quantidade</th></tr></thead>
              <tbody>
                {catalog.products.map((p) => (
                  <tr key={p.id}>
                    <td><input type="checkbox" checked={!!sel[p.id]} onChange={(e) => setSel({ ...sel, [p.id]: e.target.checked })} aria-label={`Incluir ${p.name}`} /></td>
                    <td>{p.name}</td><td className="muted">{p.ncm}</td><td className="muted">{p.unit}</td>
                    <td className="n"><input style={{ width: 100, textAlign: "right" }} type="number" min={1} value={qty[p.id] ?? 0} disabled={!sel[p.id]}
                      onChange={(e) => setQty({ ...qty, [p.id]: Math.max(0, Math.round(Number(e.target.value))) })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
            <span className="muted small">{novaItems.length} itens selecionados. Itens que nenhum fornecedor atende ficarão explícitos como indisponíveis.</span>
            <button className="primary lg" disabled={busy || !novaItems.length} onClick={() => createArena(novaItems, title)}><Sparkles size={16} /> Criar cotação e abrir arena</button>
          </div>
        </div>
      )}

      {tab === "importar" && catalog && (
        <div className="grid g2">
          <div className="card">
            <h2><FileSpreadsheet size={18} style={{ verticalAlign: -3 }} /> Importar mix (CSV)</h2>
            <p className="small muted">Uma linha por item: <code>produto;quantidade</code>. O produto pode ser o código (p01), o NCM ou o nome. Aceita arquivo .csv/.txt ou colar o conteúdo.</p>
            <label className="f" style={{ marginBottom: 10 }}>Nome da cotação<input value={importTitle} placeholder="Importado: reposição" onChange={(e) => setImportTitle(e.target.value)} /></label>
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} style={{ marginBottom: 10, width: "100%" }} />
            <textarea rows={12} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"produto;quantidade\nCafé torrado e moído 500 g;40\np16;30\n4818.10.00;12"} />
            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={() => setCsv("produto;quantidade\nCafé torrado e moído 500 g;40\nAçúcar refinado 1 kg;30\nFiltro de papel 103;25\nCopo descartável 200 mL;6\nGuardanapo;40\nSaco para lixo reforçado;10")}>Carregar exemplo</button>
              <button className="primary" disabled={busy || !validImport.length} onClick={() => createArena(validImport.map((l) => ({ productId: l.product!.id, quantity: l.quantity })), importTitle || "Mix importado")}>
                <Upload size={16} /> Importar {validImport.length} item(ns) e abrir arena
              </button>
            </div>
          </div>
          <div className="card">
            <h2>Pré-visualização</h2>
            {!parsed.length ? <p className="muted small">Cole ou carregue um arquivo para ver a correspondência com o catálogo.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Linha</th><th>Produto no catálogo</th><th className="n">Qtd</th><th></th></tr></thead>
                  <tbody>
                    {parsed.map((l, i) => (
                      <tr key={i}>
                        <td className="small muted" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{l.raw}</td>
                        <td>{l.product?.name ?? <span style={{ color: "var(--bad)" }}>{l.error}</span>}</td>
                        <td className="n">{l.quantity || "—"}</td>
                        <td>{l.product ? <span className="pill ok">ok</span> : <span className="pill bad">ignorada</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {parsed.some((l) => !l.product) && <p className="small" style={{ color: "var(--warn)" }}>Linhas ignoradas não entram na cotação. Itens repetidos são somados.</p>}
          </div>
        </div>
      )}
    </>
  );
}

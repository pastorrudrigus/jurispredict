import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LogisticsTerms, Product, UF } from "../../../shared/contracts";
import { MODAL_LABEL } from "../../../shared/contracts";
import { brl } from "../../../shared/money";
import { describeResponsibility, incrementalFreight, logisticsTotal, validateLogistics } from "../../../shared/transport";
import { api } from "../api";
import { LogisticsForm } from "../components/LogisticsForm";
import { PageHead } from "../components/ui";

interface TransportOption { id: string; label: string; originUf: UF; unitCents: number; terms: LogisticsTerms }
interface LabState { productId: string; quantity: number; destinationUf: UF; options: TransportOption[] }

const KEY = "mixcerto.transporte.v1";
const base = (p: Partial<LogisticsTerms>): LogisticsTerms => ({
  sellerDelivers: true, contractedBy: "vendedor", paidBy: "comprador", freightIncluded: false, modals: ["rodoviario"],
  freightCents: 0, insuranceCents: 0, expensesCents: 0, leadTimeDays: 5, paymentTermDays: 0, ...p,
});
const DEFAULT_OPTIONS: TransportOption[] = [
  { id: "t1", label: "Rodoviário direto (vendedor entrega)", originUf: "SP", unitCents: 2620, terms: base({ freightCents: 42000, insuranceCents: 1800, leadTimeDays: 5 }) },
  { id: "t2", label: "Ferroviário + rodoviário final", originUf: "SP", unitCents: 2620, terms: base({ modals: ["ferroviario", "rodoviario"], freightCents: 31000, insuranceCents: 1800, expensesCents: 4500, leadTimeDays: 9 }) },
  { id: "t3", label: "Cabotagem + rodoviário final", originUf: "BA", unitCents: 2410, terms: base({ modals: ["cabotagem", "rodoviario"], freightCents: 38000, insuranceCents: 2500, expensesCents: 6000, leadTimeDays: 16 }) },
  { id: "t4", label: "Aéreo (urgência)", originUf: "SP", unitCents: 2620, terms: base({ modals: ["aereo", "rodoviario"], freightCents: 165000, insuranceCents: 2000, expensesCents: 3500, leadTimeDays: 2 }) },
  { id: "t5", label: "Retirada pelo comprador", originUf: "GO", unitCents: 2520, terms: base({ sellerDelivers: false, contractedBy: "comprador", freightCents: 16000, leadTimeDays: 2 }) },
];

const load = (): LabState | null => {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as LabState) : null; } catch { return null; }
};

export default function TransportLab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [st, setSt] = useState<LabState>(() => load() ?? { productId: "p04", quantity: 200, destinationUf: "DF", options: DEFAULT_OPTIONS });
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => { api<{ products: Product[] }>("GET", "/catalogo").then((c) => setProducts(c.products)).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* armazenamento indisponível */ } }, [st]);

  const product = products.find((p) => p.id === st.productId);
  const rows = useMemo(() => st.options.map((o) => {
    const merch = o.unitCents * st.quantity;
    const logistics = logisticsTotal(o.terms);
    return { o, merch, freight: incrementalFreight(o.terms), logistics, posto: merch + logistics,
             perUnit: st.quantity ? Math.round((merch + logistics) / st.quantity) : 0, errors: validateLogistics(o.terms, st.destinationUf) };
  }).sort((a, b) => (a.errors.length ? 1 : 0) - (b.errors.length ? 1 : 0) || a.posto - b.posto || a.o.terms.leadTimeDays - b.o.terms.leadTimeDays), [st]);

  const update = (id: string, patch: Partial<TransportOption>) => setSt((s) => ({ ...s, options: s.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const add = () => setSt((s) => ({ ...s, options: [...s.options, { id: `t${Date.now()}`, label: "Nova opção", originUf: "MG", unitCents: 2500, terms: base({}) }] }));
  const remove = (id: string) => setSt((s) => ({ ...s, options: s.options.filter((o) => o.id !== id) }));

  return (
    <>
      <PageHead eyebrow="Inteligência logística" title="Frete pago ou absorvido." sub={<>Laboratório local para comparar o custo posto por produto. <b>Não altera</b> a arena, pedidos ou condições comerciais — para isso use “Ajustar frete” na arena.</>} />
      <div className="alert info small">
        Rodoviário, ferroviário, aéreo e cabotagem são possibilidades declaradas. Não foram consultadas rotas, capacidades ou transportadoras reais.
        Cabotagem até Brasília precisa de trecho terrestre final: valor e prazo devem abranger a combinação.
      </div>

      <div className="card">
        <div className="form">
          <label className="f">Produto
            <select value={st.productId} onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              setSt((s) => ({ ...s, productId: e.target.value, quantity: p?.quantity ?? s.quantity }));
            }}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              {!products.length && <option value={st.productId}>{st.productId}</option>}
            </select>
          </label>
          <label className="f">Quantidade<input type="number" min={1} value={st.quantity} onChange={(e) => setSt((s) => ({ ...s, quantity: Math.max(1, Math.round(Number(e.target.value))) }))} /></label>
          <label className="f">Destino (UF)<input value={st.destinationUf} maxLength={2} onChange={(e) => setSt((s) => ({ ...s, destinationUf: e.target.value.toUpperCase() as UF }))} /></label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={add}>Adicionar opção</button>
          <button onClick={() => setSt((s) => ({ ...s, options: DEFAULT_OPTIONS }))}>Restaurar exemplos</button>
        </div>
      </div>

      <div className="card">
        <h2>Custo posto em {st.destinationUf} {product ? `— ${product.name}` : ""}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Opção</th><th>Origem</th><th>Modal</th><th className="n">Mercadoria</th><th className="n">Frete</th><th className="n">Seg.+desp.</th><th className="n">Custo posto</th><th className="n">Por unidade</th><th className="n">Prazo</th><th>Responsabilidade</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ o, merch, freight, posto, perUnit, errors }) => (
                <tr key={o.id}>
                  <td>{o.label}{errors.length > 0 && <div className="small" style={{ color: "var(--bad)", whiteSpace: "normal" }}>{errors.join(" ")}</div>}</td>
                  <td>{o.originUf}</td>
                  <td>{o.terms.modals.map((m) => MODAL_LABEL[m]).join(" + ")}</td>
                  <td className="n">{brl(merch)}</td>
                  <td className="n">{o.terms.freightIncluded ? <span className="pill info">absorvido</span> : brl(freight)}</td>
                  <td className="n">{brl(o.terms.insuranceCents + o.terms.expensesCents)}</td>
                  <td className="n"><b>{errors.length ? "—" : brl(posto)}</b></td>
                  <td className="n">{errors.length ? "—" : brl(perUnit)}</td>
                  <td className="n">{o.terms.leadTimeDays}d</td>
                  <td className="small wrap">{describeResponsibility(o.terms)}</td>
                  <td><button className="link" onClick={() => setEditing(editing === o.id ? null : o.id)}>editar</button><button className="link danger" onClick={() => remove(o.id)}>remover</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (() => {
        const o = st.options.find((x) => x.id === editing);
        if (!o) return null;
        return (
          <div className="card">
            <h2>Editar opção</h2>
            <div className="form" style={{ marginBottom: 10 }}>
              <label className="f">Nome<input value={o.label} onChange={(e) => update(o.id, { label: e.target.value })} /></label>
              <label className="f">Origem (UF)<input value={o.originUf} maxLength={2} onChange={(e) => update(o.id, { originUf: e.target.value.toUpperCase() as UF })} /></label>
              <label className="f">Preço unitário (R$)<input type="number" step="0.01" value={(o.unitCents / 100).toFixed(2)} onChange={(e) => update(o.id, { unitCents: Math.round(Number(e.target.value) * 100) || 0 })} /></label>
            </div>
            <LogisticsForm value={o.terms} onChange={(t) => update(o.id, { terms: t })} showPayment={false} />
          </div>
        );
      })()}

      <div className="card">
        <h2>Composição do custo posto</h2>
        <div className="chart">
          <ResponsiveContainer>
            <BarChart data={rows.filter((r) => !r.errors.length).map((r) => ({ name: r.o.label, Mercadoria: r.merch / 100, Frete: r.freight / 100, "Seguro e despesas": (r.o.terms.insuranceCents + r.o.terms.expensesCents) / 100 }))} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`} tick={{ fontSize: 12, fill: "var(--muted)" }} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12, fill: "var(--muted)" }} />
              <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
              <Legend />
              <Bar dataKey="Mercadoria" stackId="a" fill="var(--merch)" />
              <Bar dataKey="Frete" stackId="a" fill="var(--freight)" />
              <Bar dataKey="Seguro e despesas" stackId="a" fill="var(--exp)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

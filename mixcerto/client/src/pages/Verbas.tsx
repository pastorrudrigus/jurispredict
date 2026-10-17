import { useEffect, useState } from "react";
import type { Budget } from "../../../shared/contracts";
import { brl } from "../../../shared/money";
import { api, ApiFailure } from "../api";
import { ErrorBox } from "../components/ui";

export default function Verbas() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [draft, setDraft] = useState<Record<string, { ceiling: string; lead: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const load = () => api<Budget[]>("GET", "/verbas").then((b) => {
    setBudgets(b);
    setDraft(Object.fromEntries(b.map((x) => [x.id, { ceiling: (x.ceilingCents / 100).toFixed(2), lead: String(x.maxLeadTimeDays) }])));
  });
  useEffect(() => { load(); }, []);
  const save = async (id: string) => {
    setError(null);
    try {
      await api("PATCH", `/verbas/${id}`, { ceilingCents: Math.round(Number(draft[id].ceiling) * 100), maxLeadTimeDays: Math.round(Number(draft[id].lead)) });
      setSaved(id);
      load();
    } catch (e) { setError(e instanceof ApiFailure ? e.message : String(e)); }
  };
  return (
    <>
      <h1>Verbas</h1>
      <p className="sub">Teto de desembolso e prazo máximo de entrega. Alterações valem para <b>novas</b> arenas — não mudam silenciosamente uma competição em andamento.</p>
      <ErrorBox error={error} onClose={() => setError(null)} />
      {budgets.map((b) => (
        <div className="card" key={b.id}>
          <h2>{b.name}</h2>
          <p className="small muted">Atual: teto {brl(b.ceilingCents)} · prazo máximo {b.maxLeadTimeDays} dias</p>
          <div className="row">
            <label className="f">Teto de desembolso (R$)<input type="number" step="0.01" value={draft[b.id]?.ceiling ?? ""} onChange={(e) => setDraft({ ...draft, [b.id]: { ...draft[b.id], ceiling: e.target.value } })} /></label>
            <label className="f">Prazo máximo (dias)<input type="number" value={draft[b.id]?.lead ?? ""} onChange={(e) => setDraft({ ...draft, [b.id]: { ...draft[b.id], lead: e.target.value } })} /></label>
            <button className="primary" onClick={() => save(b.id)} style={{ alignSelf: "flex-end" }}>Salvar</button>
            {saved === b.id && <span className="pill ok" style={{ alignSelf: "flex-end" }}>salvo</span>}
          </div>
        </div>
      ))}
    </>
  );
}

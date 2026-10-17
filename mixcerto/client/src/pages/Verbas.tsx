import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import type { Budget } from "../../../shared/contracts";
import { brl } from "../../../shared/money";
import { api, errorText } from "../api";
import { useAuth } from "../auth";
import { Alert, ErrorBox, PageHead, useToast } from "../components/ui";

export default function Verbas() {
  const { can } = useAuth();
  const toast = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [draft, setDraft] = useState<Record<string, { ceiling: string; lead: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const load = () => api<Budget[]>("GET", "/verbas").then((b) => {
    setBudgets(b);
    setDraft(Object.fromEntries(b.map((x) => [x.id, { ceiling: (x.ceilingCents / 100).toFixed(2), lead: String(x.maxLeadTimeDays) }])));
  });
  useEffect(() => { load(); }, []);
  const save = async (id: string) => {
    setError(null);
    try {
      await api("PATCH", `/verbas/${id}`, { ceilingCents: Math.round(Number(draft[id].ceiling) * 100), maxLeadTimeDays: Math.round(Number(draft[id].lead)) });
      toast("Verba atualizada — vale para novas arenas.");
      load();
    } catch (e) { setError(errorText(e)); }
  };
  return (
    <>
      <PageHead eyebrow="Verbas comerciais" title="Teto e prazo de cada compra" sub="Alterações valem para novas arenas — não mudam silenciosamente uma competição em andamento." />
      <ErrorBox error={error} onClose={() => setError(null)} />
      {!can("verbas") && <Alert tone="info">Somente administradores alteram verbas.</Alert>}
      {budgets.map((b) => (
        <div className="card" key={b.id}>
          <div className="card-head"><h2><Wallet size={18} style={{ verticalAlign: -3 }} /> {b.name}</h2><span className="small muted">Atual: teto {brl(b.ceilingCents)} · prazo máximo {b.maxLeadTimeDays} dias</span></div>
          <div className="form" style={{ maxWidth: 640, alignItems: "end" }}>
            <label className="f">Teto de desembolso (R$)<input type="number" step="0.01" disabled={!can("verbas")} value={draft[b.id]?.ceiling ?? ""} onChange={(e) => setDraft({ ...draft, [b.id]: { ...draft[b.id], ceiling: e.target.value } })} /></label>
            <label className="f">Prazo máximo (dias)<input type="number" disabled={!can("verbas")} value={draft[b.id]?.lead ?? ""} onChange={(e) => setDraft({ ...draft, [b.id]: { ...draft[b.id], lead: e.target.value } })} /></label>
            {can("verbas") && <button className="primary" onClick={() => save(b.id)}>Salvar</button>}
          </div>
        </div>
      ))}
    </>
  );
}

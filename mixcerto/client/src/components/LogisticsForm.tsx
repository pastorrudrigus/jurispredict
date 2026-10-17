import type { LogisticsTerms, Modal, Party } from "../../../shared/contracts";
import { MODAL_LABEL } from "../../../shared/contracts";

const reais = (c: number) => (c / 100).toFixed(2);
const toC = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;

/** Formulário de condições logísticas (entrega, responsabilidade, modal, custos e prazos). */
export function LogisticsForm({ value, onChange, showPayment = true }: { value: LogisticsTerms; onChange: (t: LogisticsTerms) => void; showPayment?: boolean }) {
  const set = <K extends keyof LogisticsTerms>(k: K, v: LogisticsTerms[K]) => {
    const next = { ...value, [k]: v };
    if (k === "sellerDelivers" && v === false) Object.assign(next, { contractedBy: "comprador", freightIncluded: false });
    if (k === "freightIncluded" && v === true) Object.assign(next, { paidBy: "vendedor", sellerDelivers: true });
    onChange(next);
  };
  const toggleModal = (m: Modal) =>
    set("modals", value.modals.includes(m) ? value.modals.filter((x) => x !== m) : [...value.modals, m]);
  return (
    <div className="grid" style={{ gap: 10 }}>
      <div className="row">
        <label className="c"><input type="checkbox" checked={value.sellerDelivers} onChange={(e) => set("sellerDelivers", e.target.checked)} /> Vendedor entrega no destino</label>
        <label className="c"><input type="checkbox" checked={value.freightIncluded} onChange={(e) => set("freightIncluded", e.target.checked)} /> Frete absorvido/incluído pelo vendedor</label>
      </div>
      <div className="form">
        <label className="f">Quem contrata
          <select value={value.contractedBy} onChange={(e) => set("contractedBy", e.target.value as Party)}>
            <option value="vendedor">Vendedor</option><option value="comprador">Comprador</option>
          </select>
        </label>
        <label className="f">Quem paga o frete
          <select value={value.paidBy} onChange={(e) => set("paidBy", e.target.value as Party)}>
            <option value="vendedor">Vendedor</option><option value="comprador">Comprador</option>
          </select>
        </label>
        <label className="f">Frete declarado (R$)
          <input type="number" min={0} step="0.01" value={reais(value.freightCents)} onChange={(e) => set("freightCents", toC(e.target.value))} />
        </label>
        <label className="f">Seguro (R$)
          <input type="number" min={0} step="0.01" value={reais(value.insuranceCents)} onChange={(e) => set("insuranceCents", toC(e.target.value))} />
        </label>
        <label className="f">Despesas/taxas (R$)
          <input type="number" min={0} step="0.01" value={reais(value.expensesCents)} onChange={(e) => set("expensesCents", toC(e.target.value))} />
        </label>
        <label className="f">Prazo total (dias)
          <input type="number" min={0} value={value.leadTimeDays} onChange={(e) => set("leadTimeDays", Math.max(0, Math.round(Number(e.target.value))))} />
        </label>
        {showPayment && (
          <label className="f">Prazo de pagamento (dias)
            <input type="number" min={0} value={value.paymentTermDays} onChange={(e) => set("paymentTermDays", Math.max(0, Math.round(Number(e.target.value))))} />
          </label>
        )}
      </div>
      <div className="row">
        <span className="small muted">Modal ou combinação:</span>
        {(Object.keys(MODAL_LABEL) as Modal[]).map((m) => (
          <label key={m} className="c"><input type="checkbox" checked={value.modals.includes(m)} onChange={() => toggleModal(m)} /> {MODAL_LABEL[m]}</label>
        ))}
      </div>
    </div>
  );
}

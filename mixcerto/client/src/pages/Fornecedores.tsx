import { useEffect, useState } from "react";
import { Building2, MapPin, Trophy, Truck } from "lucide-react";
import type { LogisticsTerms, Supplier } from "../../../shared/contracts";
import { MODAL_LABEL } from "../../../shared/contracts";
import { brl } from "../../../shared/money";
import { describeResponsibility } from "../../../shared/transport";
import { api, SUPPLIER_COLORS } from "../api";
import { Alert, PageHead } from "../components/ui";

interface Scorecard extends Supplier {
  offersCount: number; productsCovered: number; logistics: LogisticsTerms | null; participations: number;
  aptRate: number | null; avgPosition: number | null; leaderships: number; ordersWon: number; ordersValueCents: number;
  topInaptReasons: { reason: string; count: number }[];
}

export default function Fornecedores() {
  const [list, setList] = useState<Scorecard[]>([]);
  useEffect(() => { api<Scorecard[]>("GET", "/fornecedores").then(setList); }, []);
  return (
    <>
      <PageHead eyebrow="Fornecedores" title="Quem compete pelo seu mix." sub="Scorecard calculado a partir das arenas e pedidos registrados nesta base." />
      <Alert tone="info">Fornecedores, origens e condições são <b>fictícios</b>. A origem não prova localização real nem atendimento territorial de qualquer empresa.</Alert>
      <div className="grid g3">
        {list.map((s) => (
          <div className="card" key={s.id} style={{ borderTop: `4px solid ${SUPPLIER_COLORS[s.id]}` }}>
            <div className="card-head">
              <div>
                <h2 style={{ marginBottom: 2 }}><Building2 size={17} style={{ verticalAlign: -3 }} /> {s.name}</h2>
                <span className="small muted"><MapPin size={12} style={{ verticalAlign: -1 }} /> {s.origin.city}/{s.origin.uf} → Brasília/DF</span>
              </div>
              {s.leaderships > 0 && <span className="pill lead"><Trophy size={12} /> {s.leaderships}× líder</span>}
            </div>
            <div className="kv"><span>Itens na tabela</span><span>{s.offersCount} ({s.productsCovered} com estoque)</span></div>
            <div className="kv"><span>Arenas disputadas</span><span>{s.participations}</span></div>
            <div className="kv"><span>Taxa de aptidão</span><span>{s.aptRate === null ? "—" : `${Math.round(s.aptRate * 100)}%`}</span></div>
            <div className="kv"><span>Posição média (aptas)</span><span>{s.avgPosition === null ? "—" : s.avgPosition.toFixed(1)}</span></div>
            <div className="kv"><span>Pedidos ganhos</span><span>{s.ordersWon} · {brl(s.ordersValueCents)}</span></div>
            {s.logistics && (
              <>
                <div className="sep" />
                <div className="small"><Truck size={13} style={{ verticalAlign: -2 }} /> <b>Condição padrão:</b> {s.logistics.modals.map((m) => MODAL_LABEL[m]).join(" + ")}, {s.logistics.leadTimeDays} dias, pagamento em {s.logistics.paymentTermDays} dias.</div>
                <div className="small muted">{describeResponsibility(s.logistics)}{!s.logistics.freightIncluded && ` · frete declarado ${brl(s.logistics.freightCents)}`}</div>
              </>
            )}
            {s.topInaptReasons.length > 0 && (
              <>
                <div className="sep" />
                <div className="small" style={{ color: "var(--bad)" }}><b>Motivos de inaptidão:</b> {s.topInaptReasons.map((r) => `${r.reason} (${r.count})`).join(" · ")}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

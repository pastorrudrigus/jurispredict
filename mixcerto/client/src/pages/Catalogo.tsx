import { Fragment, useEffect, useState } from "react";
import type { BasketItem, Catalog, UnavailableItem } from "../../../shared/competition";
import { brl } from "../../../shared/money";
import { api, ApiFailure } from "../api";
import { useAuth } from "../auth";
import { Alert, ErrorBox, PageHead } from "../components/ui";

type CatalogView = Catalog & { basket: BasketItem[]; unavailable: UnavailableItem[] };

export default function Catalogo() {
  const { can } = useAuth();
  const edit = can("catalogo");
  const [c, setC] = useState<CatalogView | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<CatalogView>("GET", "/catalogo").then(setC).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const patch = async (path: string, body: unknown) => {
    setError(null);
    try { await api("PATCH", path, body); await load(); } catch (e) { setError(e instanceof ApiFailure ? e.message : String(e)); }
  };
  if (!c) return <ErrorBox error={error} />;
  const inBasket = new Set(c.basket.map((b) => b.productId));
  return (
    <>
      <PageHead eyebrow="Meu catálogo" title="Produtos e tabelas" sub={<>Vinte produtos e as tabelas dos cinco fornecedores fictícios. Alterar estoque, validade ou vida mínima a ponto de mudar a cesta exige <b>nova arena</b>.</>} />
      <ErrorBox error={error} onClose={() => setError(null)} />
      <Alert tone="info">Cesta atendível agora: <b>{c.basket.length}</b> itens · indisponíveis: {c.unavailable.map((u) => u.productName).join(", ") || "nenhum"}.{!edit && " Seu perfil é somente leitura."}</Alert>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Produto</th><th>NCM</th><th className="n">Qtd</th><th className="n">Vida mín. (d)</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {c.products.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>{p.name}</td><td>{p.ncm}</td><td className="n">{p.quantity} {p.unit}</td>
                  <td className="n"><input style={{ width: 80 }} disabled={!edit} type="number" min={0} defaultValue={p.minShelfLifeDays}
                    onBlur={(e) => Number(e.target.value) !== p.minShelfLifeDays && patch(`/catalogo/produtos/${p.id}`, { minShelfLifeDays: Math.round(Number(e.target.value)) })} /></td>
                  <td>{inBasket.has(p.id) ? <span className="pill ok">atendível</span> : <span className="pill bad">indisponível</span>}</td>
                  <td><button className="link" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "ocultar" : "ofertas"}</button></td>
                </tr>
                {open === p.id && (
                  <tr><td colSpan={6}>
                    <table>
                      <thead><tr><th>Fornecedor</th><th className="n">Preço tabela</th><th className="n">Estoque</th><th>Validade</th></tr></thead>
                      <tbody>
                        {c.suppliers.map((s) => {
                          const o = c.offers.find((x) => x.supplierId === s.id && x.productId === p.id);
                          if (!o) return <tr key={s.id}><td>{s.name}</td><td colSpan={3} className="muted">sem oferta</td></tr>;
                          return (
                            <tr key={s.id}>
                              <td>{s.name} <span className="muted small">({s.origin.uf})</span></td>
                              <td className="n">{brl(o.unitPriceCents)}</td>
                              <td className="n"><input style={{ width: 90 }} disabled={!edit} type="number" min={0} defaultValue={o.stock}
                                onBlur={(e) => Number(e.target.value) !== o.stock && patch(`/catalogo/ofertas/${s.id}/${p.id}`, { stock: Math.round(Number(e.target.value)) })} /></td>
                              <td><input type="date" disabled={!edit} defaultValue={o.expiry} onBlur={(e) => e.target.value !== o.expiry && patch(`/catalogo/ofertas/${s.id}/${p.id}`, { expiry: e.target.value })} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {can("demo") && <div className="card">
        <button className="danger" onClick={async () => { if (confirm("Restaurar dados de demonstração? Arenas, pedidos e auditoria serão apagados (usuários são mantidos).")) { await api("POST", "/demo/reset", {}); load(); } }}>
          Restaurar demonstração
        </button>
        <span className="small muted" style={{ marginLeft: 10 }}>Usuários e senhas são preservados.</span>
      </div>}
    </>
  );
}

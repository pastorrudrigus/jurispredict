import { useEffect, useState } from "react";
import ArenaDashboard from "./pages/ArenaDashboard";
import TaxLab from "./pages/TaxLab";
import TransportLab from "./pages/TransportLab";
import Cotacoes from "./pages/Cotacoes";
import Pedidos from "./pages/Pedidos";
import Verbas from "./pages/Verbas";
import Catalogo from "./pages/Catalogo";
import Auditoria from "./pages/Auditoria";

const ROUTES: { path: string; label: string; el: () => JSX.Element }[] = [
  { path: "/", label: "Central de negociação", el: ArenaDashboard },
  { path: "/tributos", label: "Inteligência tributária", el: TaxLab },
  { path: "/transporte", label: "Entrega e transporte", el: TransportLab },
  { path: "/cotacoes", label: "Cotações", el: Cotacoes },
  { path: "/pedidos", label: "Pedidos", el: Pedidos },
  { path: "/verbas", label: "Verbas", el: Verbas },
  { path: "/catalogo", label: "Catálogo", el: Catalogo },
  { path: "/auditoria", label: "Auditoria", el: Auditoria },
];

const current = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];

export default function App() {
  const [path, setPath] = useState(current());
  useEffect(() => {
    const on = () => setPath(current());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  const Page = route.el;
  return (
    <>
      <header className="top">
        <div className="inner">
          <div className="brand">Mix<span>Certo</span></div>
          <nav>
            {ROUTES.map((r) => (
              <a key={r.path} href={`#${r.path}`} className={r.path === route.path ? "active" : ""}>{r.label}</a>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <Page key={route.path} />
      </main>
    </>
  );
}

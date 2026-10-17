import { useEffect, useRef, useState, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, Bell, BookOpen, Boxes, Building2, ClipboardList, FileSpreadsheet, Gavel, History, Landmark, LayoutDashboard,
  LogOut, Menu, Moon, Receipt, ShieldCheck, Sun, Truck, UserCog, Users, Wallet,
} from "lucide-react";
import type { AuditEvent } from "../../shared/contracts";
import { ROLE_LABEL, type Permission } from "../../shared/auth";
import { api } from "./api";
import { useAuth } from "./auth";
import { initials } from "./components/ui";
import Home from "./pages/Home";
import ArenaDashboard from "./pages/ArenaDashboard";
import TaxLab from "./pages/TaxLab";
import TransportLab from "./pages/TransportLab";
import Cotacoes from "./pages/Cotacoes";
import Fornecedores from "./pages/Fornecedores";
import Pedidos from "./pages/Pedidos";
import Verbas from "./pages/Verbas";
import Catalogo from "./pages/Catalogo";
import Auditoria from "./pages/Auditoria";
import Usuarios from "./pages/Usuarios";
import Conta from "./pages/Conta";
import Guia from "./pages/Guia";
import Login, { ForcePasswordChange } from "./pages/Login";

interface RouteDef { path: string; label: string; icon: LucideIcon; el: ComponentType; group: string; perm?: Permission; hidden?: boolean }

const ROUTES: RouteDef[] = [
  { path: "/", label: "Visão inteligente", icon: LayoutDashboard, el: Home, group: "Compras" },
  { path: "/arena", label: "Arena de negociação", icon: Gavel, el: ArenaDashboard, group: "Compras" },
  { path: "/tributos", label: "Inteligência tributária", icon: Landmark, el: TaxLab, group: "Compras" },
  { path: "/transporte", label: "Entrega e transporte", icon: Truck, el: TransportLab, group: "Compras" },
  { path: "/cotacoes", label: "Cotações de mix", icon: FileSpreadsheet, el: Cotacoes, group: "Compras" },
  { path: "/fornecedores", label: "Fornecedores", icon: Building2, el: Fornecedores, group: "Compras" },
  { path: "/pedidos", label: "Pedidos", icon: Receipt, el: Pedidos, group: "Compras" },
  { path: "/verbas", label: "Verbas comerciais", icon: Wallet, el: Verbas, group: "Gestão" },
  { path: "/catalogo", label: "Meu catálogo", icon: Boxes, el: Catalogo, group: "Gestão" },
  { path: "/auditoria", label: "Trilha de auditoria", icon: History, el: Auditoria, group: "Gestão" },
  { path: "/usuarios", label: "Usuários e acessos", icon: Users, el: Usuarios, group: "Gestão", perm: "usuarios" },
  { path: "/conta", label: "Minha conta", icon: UserCog, el: Conta, group: "Gestão", hidden: true },
  { path: "/guia", label: "Guia da plataforma", icon: BookOpen, el: Guia, group: "Ajuda", hidden: true },
];

const currentPath = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];

function useTheme() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("mixcerto.theme", next); } catch { /* sem armazenamento */ }
    setTheme(next);
  };
  return { theme, toggle };
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [seen, setSeen] = useState<number>(() => { try { return Number(localStorage.getItem("mixcerto.seen") ?? 0); } catch { return 0; } });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const load = () => api<AuditEvent[]>("GET", "/auditoria").then((e) => setEvents(e.filter((x) => !x.action.startsWith("auth.")).slice(0, 8))).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => { clearInterval(t); document.removeEventListener("click", close); };
  }, []);
  const unread = events.filter((e) => e.id > seen).length;
  const toggle = () => {
    setOpen(!open);
    if (!open && events[0]) {
      setSeen(events[0].id);
      try { localStorage.setItem("mixcerto.seen", String(events[0].id)); } catch { /* sem armazenamento */ }
    }
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn" onClick={toggle} aria-label="Notificações">
        <Bell size={17} />{unread > 0 && <span className="dot-count">{unread}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="small muted" style={{ padding: "4px 10px 8px" }}>Atividade recente</div>
          {!events.length && <div className="item muted">Nada por aqui ainda.</div>}
          {events.map((e) => (
            <div className="item" key={e.id}>
              <b>{e.action}</b> · {e.entity}
              <small>{e.detail.slice(0, 110)}</small>
              <small>{new Date(e.at).toLocaleString("pt-BR")} · {e.actor}</small>
            </div>
          ))}
          <a className="item" href="#/auditoria" style={{ display: "block", textDecoration: "none" }} onClick={() => setOpen(false)}>Ver trilha completa →</a>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { user, loading, logout, can } = useAuth();
  const [path, setPath] = useState(currentPath());
  const [navOpen, setNavOpen] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const on = () => { setPath(currentPath()); setNavOpen(false); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  if (loading) return <div className="empty" style={{ paddingTop: 120 }}><p>Carregando…</p></div>;
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ForcePasswordChange />;

  const allowed = ROUTES.filter((r) => !r.perm || can(r.perm));
  const route = allowed.find((r) => r.path === path) ?? allowed[0];
  const Page = route.el;
  const groups = [...new Set(allowed.filter((r) => !r.hidden).map((r) => r.group))];

  return (
    <div className={`shell ${navOpen ? "nav-open" : ""}`} onClick={(e) => { if (navOpen && (e.target as HTMLElement).classList.contains("shell")) setNavOpen(false); }}>
      <aside className="sidebar" aria-label="Navegação">
        <a className="logo" href="#/">
          <div className="logo-mark"><BarChart3 size={20} /></div>
          <div><div className="logo-text">mix<span>certo</span></div><div className="logo-sub">COMPRAS B2B</div></div>
        </a>
        <div className="org">
          <div className="ic"><ClipboardList size={16} /></div>
          <div><b>Varejo Brasília</b><small>Ambiente demonstrativo</small></div>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div className="nav-label">{g.toUpperCase()}</div>
            <nav className="nav">
              {allowed.filter((r) => r.group === g && !r.hidden).map((r) => (
                <a key={r.path} href={`#${r.path}`} className={r.path === route.path ? "active" : ""}>
                  <r.icon size={17} />{r.label}
                </a>
              ))}
            </nav>
          </div>
        ))}
        <div className="side-card">
          <ShieldCheck size={18} color="var(--lime)" />
          <b>Decisão com rastreabilidade</b>
          <p>Cada lance, frete e pedido fica registrado com o usuário responsável.</p>
          <a href="#/guia" style={{ color: "var(--lime)", display: "inline-block", marginTop: 8, fontWeight: 600 }}>Guia da plataforma →</a>
        </div>
        <div className="side-user">
          <a href="#/conta" className="avatar" style={{ textDecoration: "none" }} title="Minha conta">{initials(user.name)}</a>
          <div className="who"><b>{user.name}</b><small>{ROLE_LABEL[user.role]}</small></div>
          <button onClick={logout} title="Sair" aria-label="Sair"><LogOut size={17} /></button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Abrir menu"><Menu size={18} /></button>
          <div className="crumbs"><span className="hide-sm">{route.group}</span><span className="hide-sm">›</span><b>{route.label}</b></div>
          <div className="spacer" />
          <span className="chip hide-sm">Demonstração</span>
          <button className="icon-btn" onClick={toggle} aria-label="Alternar tema">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
          <Notifications />
          <a href="#/conta" className="avatar" style={{ textDecoration: "none" }} title={`${user.name} — ${ROLE_LABEL[user.role]}`}>{initials(user.name)}</a>
        </header>
        <main className="page">
          <Page key={route.path + location.hash} />
        </main>
        <footer className="footer">
          <span><b>MixCerto</b> · A compra inteira, bem negociada.</span>
          <span>Dados sintéticos · Nenhuma integração externa ativa</span>
        </footer>
      </div>
    </div>
  );
}

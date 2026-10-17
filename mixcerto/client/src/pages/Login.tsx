import { useState, type FormEvent } from "react";
import { BarChart3, CheckCircle2, KeyRound, LogIn } from "lucide-react";
import { passwordProblem, type PublicUser } from "../../../shared/auth";
import { api, errorText } from "../api";
import { useAuth } from "../auth";
import { ErrorBox } from "../components/ui";

const Art = () => (
  <div className="login-art">
    <div className="logo">
      <div className="logo-mark"><BarChart3 size={20} /></div>
      <div><div className="logo-text">mix<span>certo</span></div><div className="logo-sub">COMPRAS B2B</div></div>
    </div>
    <div>
      <h1>A compra inteira, <em>bem negociada.</em></h1>
      <p style={{ opacity: .8, maxWidth: 480 }}>Fornecedores competem pelo seu mix com preço, frete, prazo e condições na mesma conta — e cada decisão fica explicada e auditada.</p>
      <ul>
        <li><CheckCircle2 size={18} /> Arena com rodadas, ranking por custo econômico e pedido idempotente</li>
        <li><CheckCircle2 size={18} /> Laboratório tributário: ICMS, ST e crédito a valor presente</li>
        <li><CheckCircle2 size={18} /> Frete pago ou absorvido, sem somar o mesmo custo duas vezes</li>
        <li><CheckCircle2 size={18} /> Perfis de acesso e trilha de auditoria por usuário</li>
      </ul>
    </div>
    <small style={{ opacity: .55 }}>Ambiente demonstrativo · dados sintéticos</small>
  </div>
);

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await login(email, password); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <Art />
      <div className="login-form">
        <form onSubmit={submit}>
          <div><div className="eyebrow">Área de compras</div><h2>Entrar no MixCerto</h2></div>
          <ErrorBox error={error} />
          <label className="f">E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <label className="f">Senha<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="primary lg" disabled={busy}><LogIn size={17} /> {busy ? "Entrando…" : "Entrar"}</button>
          <p className="small muted" style={{ margin: 0 }}>
            Acesso por convite. Peça ao administrador da sua equipe para criar seu usuário. Após 5 tentativas inválidas a conta fica bloqueada por 15 minutos.
          </p>
        </form>
      </div>
    </div>
  );
}

export function PasswordForm({ onDone, submitLabel = "Salvar nova senha" }: { onDone: (u: PublicUser) => void; submitLabel?: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = next ? passwordProblem(next) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError("A confirmação não confere.");
    setBusy(true);
    setError(null);
    try {
      const out = await api<{ user: PublicUser }>("POST", "/auth/password", { currentPassword: current, newPassword: next });
      setCurrent(""); setNext(""); setConfirm("");
      onDone(out.user);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <ErrorBox error={error} />
      <label className="f">Senha atual<input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className="f">Nova senha<input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} /></label>
      {problem && <span className="small" style={{ color: "var(--warn)" }}>{problem}</span>}
      <label className="f">Confirmar nova senha<input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      <button className="primary" disabled={busy || !!problem}><KeyRound size={16} /> {submitLabel}</button>
    </form>
  );
}

export function ForcePasswordChange() {
  const { setUser, logout, user } = useAuth();
  return (
    <div className="login">
      <Art />
      <div className="login-form">
        <div style={{ width: "100%", maxWidth: 380, display: "grid", gap: 14 }}>
          <div><div className="eyebrow">Primeiro acesso</div><h2>Defina sua senha</h2></div>
          <p className="muted small" style={{ margin: 0 }}>Olá, {user?.name}. Por segurança, troque a senha temporária antes de continuar. Mínimo de 10 caracteres, com letras e números.</p>
          <PasswordForm onDone={setUser} submitLabel="Definir senha e entrar" />
          <button className="ghost" onClick={logout}>Sair</button>
        </div>
      </div>
    </div>
  );
}

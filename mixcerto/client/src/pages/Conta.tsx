import { ROLE_LABEL } from "../../../shared/auth";
import { useAuth } from "../auth";
import { PageHead, initials, useToast } from "../components/ui";
import { PasswordForm } from "./Login";

export default function Conta() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  if (!user) return null;
  return (
    <>
      <PageHead eyebrow="Minha conta" title={user.name} sub={user.email} actions={<button onClick={logout}>Sair</button>} />
      <div className="grid g2">
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{initials(user.name)}</span>
            <div><b>{user.name}</b><div className="muted small">{ROLE_LABEL[user.role]}</div></div>
          </div>
          <div className="kv"><span>E-mail</span><span>{user.email}</span></div>
          <div className="kv"><span>Perfil</span><span>{ROLE_LABEL[user.role]}</span></div>
          <div className="kv"><span>Conta criada em</span><span>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</span></div>
          <div className="kv"><span>Último acesso</span><span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("pt-BR") : "—"}</span></div>
          <p className="small muted">A sessão expira em 8 horas. Trocar a senha encerra as suas outras sessões abertas.</p>
        </div>
        <div className="card">
          <h2>Trocar senha</h2>
          <PasswordForm onDone={(u) => { setUser(u); toast("Senha alterada."); }} />
        </div>
      </div>
    </>
  );
}

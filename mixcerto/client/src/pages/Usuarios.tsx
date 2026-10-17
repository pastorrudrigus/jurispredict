import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { MIN_PASSWORD_LENGTH, ROLE_LABEL, type PublicUser, type Role } from "../../../shared/auth";
import { api, errorText } from "../api";
import { useAuth } from "../auth";
import { Alert, ErrorBox, Modal, PageHead, initials, useToast } from "../components/ui";

const tempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("") + "7";
};

export default function Usuarios() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "comprador" as Role, password: tempPassword() });
  const [reset, setReset] = useState<{ user: PublicUser; password: string } | null>(null);
  const load = () => api<PublicUser[]>("GET", "/usuarios").then(setUsers).catch((e) => setError(errorText(e)));
  useEffect(() => { load(); }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", "/usuarios", form);
      toast(`Usuário ${form.email} criado. Envie a senha temporária por um canal seguro.`);
      setForm({ name: "", email: "", role: "comprador", password: tempPassword() });
      load();
    } catch (err) { setError(errorText(err)); }
  };
  const patch = async (u: PublicUser, body: Record<string, unknown>, msg: string) => {
    setError(null);
    try { await api("PATCH", `/usuarios/${u.id}`, body); toast(msg); load(); } catch (err) { setError(errorText(err)); }
  };

  return (
    <>
      <PageHead eyebrow="Gestão" title="Usuários e acessos" sub="Quem entra, o que pode fazer e quando acessou pela última vez." />
      <ErrorBox error={error} onClose={() => setError(null)} />
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="card flat"><h3>Administrador</h3><p className="small muted" style={{ margin: 0 }}>Tudo do comprador, mais verbas, usuários e restauração da demonstração.</p></div>
        <div className="card flat"><h3>Comprador</h3><p className="small muted" style={{ margin: 0 }}>Cria cotações, negocia na arena, ajusta frete, edita catálogo e gera pedidos.</p></div>
        <div className="card flat"><h3>Somente leitura</h3><p className="small muted" style={{ margin: 0 }}>Consulta arenas, pedidos, laboratórios e auditoria, sem alterar nada.</p></div>
      </div>

      <div className="layout-side">
        <div className="card">
          <h2>Equipe ({users.length})</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(u.name)}</span>
                        <div><b>{u.name}</b>{u.id === me?.id && <span className="pill neutral" style={{ marginLeft: 6 }}>você</span>}<div className="small muted">{u.email}</div></div>
                      </div>
                    </td>
                    <td>
                      <select value={u.role} disabled={u.id === me?.id} onChange={(e) => patch(u, { role: e.target.value }, "Perfil atualizado.")} aria-label="Perfil">
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      {u.active ? <span className="pill ok">ativo</span> : <span className="pill neutral">inativo</span>}
                      {u.mustChangePassword && <span className="pill warn" style={{ marginLeft: 4 }}>senha temporária</span>}
                    </td>
                    <td className="small muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("pt-BR") : "nunca"}</td>
                    <td>
                      {u.id !== me?.id && (
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <button className="link" onClick={() => setReset({ user: u, password: tempPassword() })}><KeyRound size={14} /> Redefinir senha</button>
                          <button className="link" onClick={() => patch(u, { active: !u.active }, u.active ? "Usuário desativado e sessões encerradas." : "Usuário reativado.")}>{u.active ? "Desativar" : "Reativar"}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <form className="card" onSubmit={create} style={{ display: "grid", gap: 12 }}>
          <h2><UserPlus size={18} style={{ verticalAlign: -3 }} /> Convidar usuário</h2>
          <label className="f">Nome<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="f">E-mail<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="f">Perfil
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="f">Senha temporária (mín. {MIN_PASSWORD_LENGTH}, letras e números)
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" onClick={() => setForm({ ...form, password: tempPassword() })}>Gerar</button>
            </div>
          </label>
          <p className="small muted" style={{ margin: 0 }}>A troca da senha será exigida no primeiro acesso.</p>
          <button className="primary"><UserPlus size={16} /> Criar usuário</button>
        </form>
      </div>

      {reset && (
        <Modal title={`Redefinir senha — ${reset.user.name}`} onClose={() => setReset(null)}>
          <Alert tone="warn">As sessões abertas deste usuário serão encerradas e ele precisará trocar a senha no próximo acesso.</Alert>
          <label className="f">Senha temporária<input value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} /></label>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setReset(null)}>Cancelar</button>
            <button className="primary" onClick={async () => { await patch(reset.user, { password: reset.password }, "Senha redefinida."); setReset(null); }}>Redefinir</button>
          </div>
        </Modal>
      )}
    </>
  );
}

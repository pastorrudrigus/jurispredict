import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { can, type Permission, type PublicUser } from "../../shared/auth";
import { api, AUTH_EVENT } from "./api";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser((await api<{ user: PublicUser }>("GET", "/auth/me")).user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === "PASSWORD_CHANGE_REQUIRED") refresh();
      else setUser(null);
    };
    window.addEventListener(AUTH_EVENT, on);
    return () => window.removeEventListener(AUTH_EVENT, on);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    setUser((await api<{ user: PublicUser }>("POST", "/auth/login", { email, password })).user);
  };
  const logout = async () => {
    try { await api("POST", "/auth/logout", {}); } finally { setUser(null); }
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, setUser, can: (p) => can(user?.role, p) }}>
      {children}
    </Ctx.Provider>
  );
}

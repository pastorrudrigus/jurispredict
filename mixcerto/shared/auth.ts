export type Role = "admin" | "comprador" | "leitura";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  comprador: "Comprador",
  leitura: "Somente leitura",
};

/** Permissões por perfil. Leitura consulta tudo; comprador negocia e gera pedidos; admin também gere verbas, usuários e a demonstração. */
export type Permission = "negociar" | "catalogo" | "verbas" | "usuarios" | "demo";

const PERMISSIONS: Record<Role, Permission[]> = {
  admin: ["negociar", "catalogo", "verbas", "usuarios", "demo"],
  comprador: ["negociar", "catalogo"],
  leitura: [],
};

export const can = (role: Role | undefined, p: Permission) => !!role && PERMISSIONS[role].includes(p);

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (pw.length > 200) return "Senha longa demais.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "A senha precisa combinar letras e números.";
  return null;
}

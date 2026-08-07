import type { Metadata } from "next";
import Link from "next/link";
import { sair } from "./entrar/actions";
import { ehAdmin, sessaoAtual } from "@/lib/sessao";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Imob Goiânia",
  description: "Deal flow de repasses de imóveis na planta em Goiânia.",
};

// O layout lê a sessão (cookies) para montar a navegação por papel, então
// nenhuma rota pode ser pré-renderizada estaticamente.
export const dynamic = "force-dynamic";

const NAV_CORRETOR = [{ href: "/", label: "Oportunidades" }];

const NAV_ADMIN = [
  { href: "/", label: "Painel" },
  { href: "/coletar", label: "Coletar" },
  { href: "/ingerir", label: "Ingerir" },
  { href: "/radar-judicial", label: "Radar Judicial" },
  { href: "/lista", label: "Gerar lista" },
  { href: "/empreendimentos", label: "Empreendimentos" },
  { href: "/admin/corretores", label: "Corretores" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await sessaoAtual();
  const admin = ehAdmin(sessao);
  const nav = sessao ? (admin ? NAV_ADMIN : NAV_CORRETOR) : [];

  return (
    <html lang="pt-BR">
      <body>
        <header className="border-b border-edge bg-panel">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-100">
              📡 Radar Imob <span className="text-zinc-500">Goiânia</span>
            </Link>

            <nav className="flex flex-wrap gap-4 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-zinc-400 transition hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {sessao ? (
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  {sessao.perfil?.nome ?? sessao.email}
                  {admin ? (
                    <span className="ml-1 rounded border border-sky-600/40 bg-sky-500/10 px-1 text-sky-300">
                      admin
                    </span>
                  ) : null}
                </span>
                <form action={sair}>
                  <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-300">
                    Sair
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

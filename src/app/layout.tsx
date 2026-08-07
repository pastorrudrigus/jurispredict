import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Imob Goiânia",
  description: "Deal flow de repasses de imóveis na planta em Goiânia.",
};

const NAV = [
  { href: "/", label: "Painel" },
  { href: "/ingerir", label: "Ingerir" },
  { href: "/lista", label: "Gerar lista" },
  { href: "/empreendimentos", label: "Empreendimentos" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="border-b border-edge bg-panel">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              📡 Radar Imob <span className="text-zinc-500">Goiânia</span>
            </span>
            <nav className="flex flex-wrap gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-zinc-400 transition hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <form action={logout} className="ml-auto">
              <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-300">
                Sair
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

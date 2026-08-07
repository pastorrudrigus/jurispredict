import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Rotas que qualquer visitante alcança sem sessão. */
const PUBLICAS = ["/entrar", "/cadastrar", "/auth"];

function ehPublica(pathname: string): boolean {
  return PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessão do Supabase a cada request e barra quem não está logado.
 * Papel (admin vs corretor) NÃO é checado aqui — isso é feito por
 * `exigirAdmin()` nas páginas e nas server actions, onde a decisão vale de
 * verdade. O middleware é só o primeiro portão.
 */
export async function middleware(request: NextRequest) {
  const { pathname: earlyPath } = request.nextUrl;
  // /api/setup e /api/cron se autenticam sozinhas (token e CRON_SECRET),
  // nao passam por Supabase auth.
  if (
    earlyPath.startsWith("/api/setup") ||
    earlyPath.startsWith("/api/cron") ||
    earlyPath.startsWith("/api/webhook")
  ) {
    return NextResponse.next();
  }

  let resposta = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !anon) {
    return new NextResponse(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ou _PUBLISHABLE_KEY) não configuradas.",
      { status: 500 },
    );
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar) {
        for (const { name, value } of paraGravar) {
          request.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of paraGravar) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valida o JWT com o servidor de auth e renova o cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !ehPublica(pathname)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(destino);
  }

  // Já logado não precisa mais ver login/cadastro.
  if (user && (pathname === "/entrar" || pathname === "/cadastrar")) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  // /api/cron/* fica fora: o cron da Vercel não manda cookie de sessão, ele se
  // autentica com CRON_SECRET dentro da própria rota.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|api/setup).*)"],
};

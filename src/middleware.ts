import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse(
      "ADMIN_PASSWORD não configurada. Defina a variável de ambiente antes de usar o painel.",
      { status: 500 },
    );
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const expected = await sessionToken(password);

  if (cookie && safeEqual(cookie, expected)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Protege tudo menos assets do Next e o favicon. /api/cron/* também passa
  // pelo middleware — o cron da Vercel envia o cookie? Não. Por isso ele é
  // liberado aqui e valida o próprio segredo internamente.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};

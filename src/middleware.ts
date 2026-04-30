/**
 * Middleware runs on every request at the edge.
 * Enforces the outer access gate: if the signed unlock cookie is
 * missing or invalid, redirect to /unlock (except for /unlock itself,
 * static assets, and the admin ingest endpoint which uses its own token).
 */
import { NextRequest, NextResponse } from "next/server";
import { UNLOCK_COOKIE_NAME, verifyToken } from "@/lib/auth/unlock-token";

const PUBLIC_PATHS = [
  "/unlock",
  "/favicon.ico",
  "/manifest.json",
  "/icons",
  "/api/admin/ingest", // protected by its own Bearer token
  "/api/admin/seed", // seed endpoints also use WGT_INGEST_TOKEN
  "/api/admin/debug", // debug endpoints also use WGT_INGEST_TOKEN
  "/api/admin/trips", // trip CRUD also uses WGT_INGEST_TOKEN
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (pathname.startsWith("/_next/")) return true;
  if (/\.(svg|png|jpe?g|webp|ico|txt|js|css|map|woff2?)$/.test(pathname)) {
    return true;
  }
  return false;
}

function redirectToUnlock(req: NextRequest, from: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.searchParams.set("next", from);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  try {
    if (isPublic(pathname)) return NextResponse.next();

    const token = req.cookies.get(UNLOCK_COOKIE_NAME)?.value;
    if (!token) return redirectToUnlock(req, pathname);

    const payload = await verifyToken(token);
    if (!payload) return redirectToUnlock(req, pathname);

    // Прокидываем pathname в request headers, чтобы server-компоненты
    // (например, BottomNav) могли определять активный таб без
    // `usePathname()` на клиенте. Без `request.headers` `headers()` в
    // server components вернёт оригинальные request headers без наших
    // правок, поэтому передаём через `NextResponse.next({ request })`.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-wgt-pathname", pathname);

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("x-wgt-user", payload.u);
    return res;
  } catch (err) {
    // Never let middleware throw: surface to /unlock so the user sees the
    // access form instead of Vercel's generic 404.
    console.error("[wgt/middleware] error:", err);
    return redirectToUnlock(req, pathname);
  }
}

export const config = {
  matcher: [
    // Run on everything except Next internals, static files and favicon.
    "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};

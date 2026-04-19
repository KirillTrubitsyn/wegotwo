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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(UNLOCK_COOKIE_NAME)?.value;
  const payload = await verifyToken(token);

  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = "/unlock";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("x-wgt-user", payload.u);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data).*)"],
};

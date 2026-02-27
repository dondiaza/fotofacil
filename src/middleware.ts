import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ff_session";

type Session = {
  uid: string;
  role: "STORE" | "CLUSTER" | "SUPERADMIN";
  storeId: string | null;
  clusterId: string | null;
  username: string;
};

async function readSession(request: NextRequest): Promise<Session | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) {
    return null;
  }
  try {
    const key = new TextEncoder().encode(secret);
    const verified = await jwtVerify<Session>(token, key, { algorithms: ["HS256"] });
    return verified.payload;
  } catch {
    return null;
  }
}

function unauthorizedApi() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const session = await readSession(request);
  const isApi = pathname.startsWith("/api/");

  if (pathname === "/login") {
    if (!session) {
      return NextResponse.next();
    }
    const target = session.role === "STORE" ? "/store" : "/admin";
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/auth/logout")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/store") || pathname.startsWith("/api/store")) {
    if (!session) {
      return isApi ? unauthorizedApi() : NextResponse.redirect(new URL("/login", request.url));
    }
    if (session.role !== "STORE") {
      return isApi ? NextResponse.json({ error: "Forbidden" }, { status: 403 }) : NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!session) {
      return isApi ? unauthorizedApi() : NextResponse.redirect(new URL("/login", request.url));
    }
    if (session.role !== "SUPERADMIN" && session.role !== "CLUSTER") {
      return isApi ? NextResponse.json({ error: "Forbidden" }, { status: 403 }) : NextResponse.redirect(new URL("/store", request.url));
    }
  }

  if (pathname.startsWith("/api/messages")) {
    if (!session) {
      return unauthorizedApi();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|sw.js).*)"]
};

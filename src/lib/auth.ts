import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCookie, signSessionToken } from "@/lib/session";

export async function authenticateUser(identifier: string, password: string) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: identifier },
        { email: identifier }
      ]
    },
    include: {
      store: true,
      cluster: true
    }
  });

  if (!user) {
    return null;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return null;
  }

  if (user.role === "STORE" && (!user.store || !user.store.isActive)) {
    return null;
  }
  if (user.role === "CLUSTER" && (!user.cluster || !user.cluster.isActive)) {
    return null;
  }

  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function issueSessionResponse(
  payload: { uid: string; role: Role; storeId: string | null; clusterId: string | null; username: string },
  body: unknown = { ok: true }
) {
  const token = await signSessionToken(payload);
  const response = NextResponse.json(body);
  response.cookies.set(sessionCookie.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionCookie.maxAge
  });
  return response;
}

export function clearSessionResponse(body: unknown = { ok: true }) {
  const response = NextResponse.json(body);
  response.cookies.set(sessionCookie.name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}

export async function requireRole(roles: Role[]) {
  const session = await getSession();
  if (!session || !roles.includes(session.role)) {
    return null;
  }
  return session;
}

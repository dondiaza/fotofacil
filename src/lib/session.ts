import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { signJwt, verifyJwt } from "@/lib/jwt";

const COOKIE_NAME = "ff_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  uid: string;
  role: Role;
  storeId: string | null;
  clusterId: string | null;
  username: string;
};

export async function signSessionToken(payload: SessionPayload) {
  return signJwt(payload, TOKEN_TTL_SECONDS);
}

export async function verifySessionToken(token: string) {
  return verifyJwt<SessionPayload>(token);
}

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: COOKIE_NAME,
  maxAge: TOKEN_TTL_SECONDS
};

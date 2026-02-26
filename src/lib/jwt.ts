import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

function getKey() {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function signJwt(payload: Record<string, unknown>, expiresInSeconds: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(getKey());
}

export async function verifyJwt<T>(token: string) {
  const verified = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
  return verified.payload as T;
}

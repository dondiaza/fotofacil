import { z } from "zod";
import { authenticateUser, issueSessionResponse } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit";

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid credentials payload");
  }

  const user = await authenticateUser(parsed.data.identifier, parsed.data.password);
  if (!user) {
    return unauthorized("Invalid credentials");
  }

  await writeAuditLog({
    action: "AUTH_LOGIN",
    storeId: user.storeId,
    userId: user.id
  });

  return issueSessionResponse(
    {
      uid: user.id,
      role: user.role,
      storeId: user.storeId,
      clusterId: user.clusterId,
      username: user.username
    },
    {
      ok: true,
      user: {
        id: user.id,
        role: user.role,
        username: user.username,
        storeId: user.storeId,
        clusterId: user.clusterId
      }
    }
  );
}

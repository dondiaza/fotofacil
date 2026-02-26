import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { getConfiguredDriveRootFolderId, getDriveFolderMeta } from "@/lib/drive";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  driveRootFolderId: z.string().trim().min(1)
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const config = await prisma.appConfig.findUnique({
    where: { id: 1 }
  });
  const effectiveRootId = await getConfiguredDriveRootFolderId();

  let rootMeta: { id?: string | null; name?: string | null; webViewLink?: string | null } | null = null;
  if (effectiveRootId) {
    try {
      const meta = await getDriveFolderMeta(effectiveRootId);
      rootMeta = {
        id: meta.id ?? null,
        name: meta.name ?? null,
        webViewLink: meta.webViewLink ?? null
      };
    } catch {
      rootMeta = null;
    }
  }

  return Response.json({
    item: {
      driveRootFolderId: config?.driveRootFolderId || null,
      effectiveDriveRootFolderId: effectiveRootId,
      rootMeta
    }
  });
}

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("driveRootFolderId is required");
  }

  let meta;
  try {
    meta = await getDriveFolderMeta(parsed.data.driveRootFolderId);
  } catch {
    return badRequest("No se pudo acceder a esa carpeta en Drive");
  }

  if (meta.mimeType !== "application/vnd.google-apps.folder") {
    return badRequest("El ID indicado no corresponde a una carpeta de Google Drive");
  }

  const updated = await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {
      driveRootFolderId: parsed.data.driveRootFolderId
    },
    create: {
      id: 1,
      driveRootFolderId: parsed.data.driveRootFolderId
    }
  });

  await writeAuditLog({
    action: "ADMIN_DRIVE_ROOT_UPDATED",
    userId: admin.uid,
    payload: {
      driveRootFolderId: updated.driveRootFolderId
    }
  });

  return Response.json({
    ok: true,
    item: {
      driveRootFolderId: updated.driveRootFolderId,
      rootMeta: {
        id: meta.id || null,
        name: meta.name || null,
        webViewLink: meta.webViewLink || null
      }
    }
  });
}

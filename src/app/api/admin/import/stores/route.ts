import { hashPassword } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

function randomPassword(size = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let value = "";
  for (let i = 0; i < size; i++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function parseBoolean(raw: string | undefined, fallback = true) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return fallback;
  if (value === "1" || value === "true" || value === "yes" || value === "si") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return fallback;
}

function normalizeDeadline(raw: string | undefined) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  return value;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return badRequest("Adjunta un CSV en el campo file");
  }

  const raw = await file.text();
  const rows = parseCsv(raw);
  if (rows.length === 0) {
    return badRequest("CSV vacío");
  }

  const errors: string[] = [];
  let createdStores = 0;
  let updatedStores = 0;
  let createdUsers = 0;
  let updatedUsers = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    const storeCode = String(row.storeCode || "").trim().toUpperCase();
    const storeName = String(row.storeName || "").trim();
    const username = String(row.storeUsername || "").trim().toLowerCase();
    const email = String(row.storeEmail || "").trim().toLowerCase() || null;
    const password = String(row.storePassword || "").trim() || randomPassword();
    const clusterCode = String(row.clusterCode || "").trim().toUpperCase();
    const deadlineTime = normalizeDeadline(row.deadlineTime);
    const isActive = parseBoolean(row.isActive, true);

    if (!storeCode || !storeName || !username) {
      errors.push(`Línea ${line}: storeCode, storeName y storeUsername son obligatorios`);
      continue;
    }

    const passwordHash = await hashPassword(password);

    try {
      await prisma.$transaction(async (tx) => {
        let clusterId: string | null = null;
        if (clusterCode) {
          const cluster = await tx.cluster.findUnique({
            where: { code: clusterCode },
            select: { id: true }
          });
          if (!cluster) {
            throw new Error(`Línea ${line}: clusterCode no existe (${clusterCode})`);
          }
          clusterId = cluster.id;
        }

        let store = await tx.store.findUnique({ where: { storeCode } });
        if (!store) {
          store = await tx.store.create({
            data: {
              storeCode,
              name: storeName,
              clusterId,
              deadlineTime,
              isActive
            }
          });
          createdStores += 1;
        } else {
          store = await tx.store.update({
            where: { id: store.id },
            data: {
              name: storeName,
              clusterId,
              deadlineTime,
              isActive
            }
          });
          updatedStores += 1;
        }

        const userByUsername = await tx.user.findUnique({
          where: { username }
        });
        if (!userByUsername) {
          if (email) {
            const emailExists = await tx.user.findFirst({
              where: { email },
              select: { id: true }
            });
            if (emailExists) {
              throw new Error(`Línea ${line}: email ya en uso (${email})`);
            }
          }
          await tx.user.create({
            data: {
              role: "STORE",
              username,
              email,
              passwordHash,
              mustChangePw: true,
              storeId: store.id,
              clusterId
            }
          });
          createdUsers += 1;
        } else {
          if (userByUsername.role !== "STORE") {
            throw new Error(`Línea ${line}: username ${username} pertenece a otro rol`);
          }
          if (email && email !== userByUsername.email) {
            const emailExists = await tx.user.findFirst({
              where: {
                email,
                id: { not: userByUsername.id }
              },
              select: { id: true }
            });
            if (emailExists) {
              throw new Error(`Línea ${line}: email ya en uso (${email})`);
            }
          }
          await tx.user.update({
            where: { id: userByUsername.id },
            data: {
              email,
              storeId: store.id,
              clusterId,
              passwordHash,
              mustChangePw: true
            }
          });
          createdUsers += 0;
          updatedUsers += 1;
        }
      });
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  await writeAuditLog({
    action: "ADMIN_IMPORT_STORES",
    userId: admin.uid,
    payload: {
      rows: rows.length,
      createdStores,
      updatedStores,
      createdUsers,
      updatedUsers,
      errors: errors.length
    }
  });

  return Response.json({
    ok: true,
    summary: {
      totalRows: rows.length,
      createdStores,
      updatedStores,
      createdUsers,
      updatedUsers,
      errors
    }
  });
}

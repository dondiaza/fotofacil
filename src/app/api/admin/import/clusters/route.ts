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
  let createdClusters = 0;
  let updatedClusters = 0;
  let createdUsers = 0;
  let updatedUsers = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    const code = String(row.clusterCode || "").trim().toUpperCase();
    const name = String(row.clusterName || "").trim();
    const username = String(row.clusterUsername || "").trim().toLowerCase();
    const email = String(row.clusterEmail || "").trim().toLowerCase() || null;
    const password = String(row.clusterPassword || "").trim() || randomPassword();
    const isActive = parseBoolean(row.isActive, true);

    if (!code || !name || !username) {
      errors.push(`Línea ${line}: clusterCode, clusterName y clusterUsername son obligatorios`);
      continue;
    }

    const passwordHash = await hashPassword(password);

    try {
      await prisma.$transaction(async (tx) => {
        let cluster = await tx.cluster.findUnique({
          where: { code }
        });
        if (!cluster) {
          cluster = await tx.cluster.create({
            data: { code, name, isActive }
          });
          createdClusters += 1;
        } else {
          cluster = await tx.cluster.update({
            where: { id: cluster.id },
            data: { name, isActive }
          });
          updatedClusters += 1;
        }

        const managerByUsername = await tx.user.findUnique({
          where: { username }
        });

        if (!managerByUsername) {
          if (email) {
            const emailUser = await tx.user.findFirst({ where: { email }, select: { id: true } });
            if (emailUser) {
              throw new Error(`Línea ${line}: email ya en uso (${email})`);
            }
          }
          await tx.user.create({
            data: {
              role: "CLUSTER",
              username,
              email,
              passwordHash,
              mustChangePw: true,
              clusterId: cluster.id,
              storeId: null
            }
          });
          createdUsers += 1;
        } else {
          if (managerByUsername.role !== "CLUSTER") {
            throw new Error(`Línea ${line}: username ${username} pertenece a otro rol`);
          }
          if (email && email !== managerByUsername.email) {
            const emailUser = await tx.user.findFirst({
              where: {
                email,
                id: { not: managerByUsername.id }
              },
              select: { id: true }
            });
            if (emailUser) {
              throw new Error(`Línea ${line}: email ya en uso (${email})`);
            }
          }
          await tx.user.update({
            where: { id: managerByUsername.id },
            data: {
              email,
              clusterId: cluster.id,
              passwordHash,
              mustChangePw: true
            }
          });
          updatedUsers += 1;
        }
      });
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  await writeAuditLog({
    action: "ADMIN_IMPORT_CLUSTERS",
    userId: admin.uid,
    payload: {
      rows: rows.length,
      createdClusters,
      updatedClusters,
      createdUsers,
      updatedUsers,
      errors: errors.length
    }
  });

  return Response.json({
    ok: true,
    summary: {
      totalRows: rows.length,
      createdClusters,
      updatedClusters,
      createdUsers,
      updatedUsers,
      errors
    }
  });
}

import { RequirementKind } from "@prisma/client";
import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const scopeSchema = z.enum(["global", "cluster", "store"]);

const updateSchema = z.object({
  scope: scopeSchema,
  clusterId: z.string().optional(),
  storeId: z.string().optional(),
  rules: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        requirement: z.nativeEnum(RequirementKind)
      })
    )
    .min(1)
});

const WEEKDAYS = [
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
  { id: 0, label: "Domingo" }
];

async function resolveScopeTarget(
  manager: NonNullable<Awaited<ReturnType<typeof requireManager>>>,
  scope: z.infer<typeof scopeSchema>,
  rawClusterId?: string,
  rawStoreId?: string
) {
  if (scope === "global") {
    if (!manager.isSuperAdmin) {
      throw new Error("forbidden_global");
    }
    return { scope, storeId: null as string | null, clusterId: null as string | null };
  }

  if (scope === "cluster") {
    const clusterId = manager.isSuperAdmin ? rawClusterId || null : manager.clusterId;
    if (!clusterId) {
      throw new Error("cluster_required");
    }
    if (!manager.isSuperAdmin && clusterId !== manager.clusterId) {
      throw new Error("forbidden_cluster");
    }
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { id: true }
    });
    if (!cluster) {
      throw new Error("cluster_not_found");
    }
    return { scope, storeId: null as string | null, clusterId: cluster.id };
  }

  const storeId = rawStoreId || null;
  if (!storeId) {
    if (!manager.isSuperAdmin && manager.clusterId) {
      const firstStore = await prisma.store.findFirst({
        where: { clusterId: manager.clusterId },
        orderBy: { storeCode: "asc" },
        select: { id: true }
      });
      if (!firstStore) {
        throw new Error("store_not_found");
      }
      return { scope, storeId: firstStore.id, clusterId: null as string | null };
    }
    if (manager.isSuperAdmin) {
      const firstStore = await prisma.store.findFirst({
        orderBy: { storeCode: "asc" },
        select: { id: true }
      });
      if (!firstStore) {
        throw new Error("store_not_found");
      }
      return { scope, storeId: firstStore.id, clusterId: null as string | null };
    }
    throw new Error("store_required");
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, clusterId: true }
  });
  if (!store) {
    throw new Error("store_not_found");
  }
  if (!manager.isSuperAdmin && store.clusterId !== manager.clusterId) {
    throw new Error("forbidden_store");
  }

  return { scope, storeId: store.id, clusterId: null as string | null };
}

async function readRules(target: { storeId: string | null; clusterId: string | null }) {
  const rules = await prisma.uploadRule.findMany({
    where: {
      storeId: target.storeId,
      clusterId: target.clusterId
    },
    select: {
      weekday: true,
      requirement: true
    }
  });

  const map = new Map<number, RequirementKind>();
  for (const rule of rules) {
    map.set(rule.weekday, rule.requirement);
  }

  return WEEKDAYS.map((day) => ({
    weekday: day.id,
    label: day.label,
    requirement: map.get(day.id) ?? RequirementKind.NONE
  }));
}

export async function GET(request: Request) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const requestedScope = scopeSchema.safeParse(url.searchParams.get("scope") || (manager.isSuperAdmin ? "global" : "cluster"));
  if (!requestedScope.success) {
    return badRequest("scope inválido");
  }

  let target;
  try {
    target = await resolveScopeTarget(
      manager,
      requestedScope.data,
      url.searchParams.get("clusterId") || undefined,
      url.searchParams.get("storeId") || undefined
    );
  } catch (error) {
    const msg = String((error as Error).message);
    if (msg.startsWith("forbidden")) {
      return forbidden();
    }
    if (msg === "cluster_required") {
      return badRequest("clusterId requerido para scope cluster");
    }
    if (msg === "store_required") {
      return badRequest("storeId requerido para scope store");
    }
    if (msg === "cluster_not_found") {
      return badRequest("clusterId no válido");
    }
    if (msg === "store_not_found") {
      return badRequest("storeId no válido");
    }
    return badRequest("No se pudo resolver el alcance");
  }

  const [rules, stores, clusters] = await Promise.all([
    readRules(target),
    prisma.store.findMany({
      where: manager.isSuperAdmin ? {} : { clusterId: manager.clusterId },
      orderBy: [{ storeCode: "asc" }],
      select: {
        id: true,
        storeCode: true,
        name: true,
        clusterId: true
      }
    }),
    manager.isSuperAdmin
      ? prisma.cluster.findMany({
          where: { isActive: true },
          orderBy: [{ code: "asc" }],
          select: { id: true, code: true, name: true }
        })
      : prisma.cluster.findMany({
          where: { id: manager.clusterId || "__none__", isActive: true },
          select: { id: true, code: true, name: true }
        })
  ]);

  return Response.json({
    item: {
      scope: target.scope,
      storeId: target.storeId,
      clusterId: target.clusterId,
      rules
    },
    stores,
    clusters
  });
}

export async function PUT(request: Request) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  const uniqueWeekdays = new Set(parsed.data.rules.map((rule) => rule.weekday));
  if (uniqueWeekdays.size !== parsed.data.rules.length) {
    return badRequest("No puede haber días duplicados");
  }

  let target;
  try {
    target = await resolveScopeTarget(manager, parsed.data.scope, parsed.data.clusterId, parsed.data.storeId);
  } catch (error) {
    const msg = String((error as Error).message);
    if (msg.startsWith("forbidden")) {
      return forbidden();
    }
    if (msg === "cluster_required") {
      return badRequest("clusterId requerido para scope cluster");
    }
    if (msg === "store_required") {
      return badRequest("storeId requerido para scope store");
    }
    if (msg === "cluster_not_found") {
      return badRequest("clusterId no válido");
    }
    if (msg === "store_not_found") {
      return badRequest("storeId no válido");
    }
    return badRequest("No se pudo resolver el alcance");
  }

  await prisma.$transaction(async (tx) => {
    await tx.uploadRule.deleteMany({
      where: {
        storeId: target.storeId,
        clusterId: target.clusterId
      }
    });

    for (const rule of parsed.data.rules) {
      await tx.uploadRule.create({
        data: {
          weekday: rule.weekday,
          requirement: rule.requirement,
          storeId: target.storeId,
          clusterId: target.clusterId
        }
      });
    }
  });

  await writeAuditLog({
    action: "UPLOAD_RULES_UPDATED",
    userId: manager.session.uid,
    storeId: target.storeId,
    payload: {
      scope: target.scope,
      clusterId: target.clusterId,
      rules: parsed.data.rules
    }
  });

  const rules = await readRules(target);

  return Response.json({
    ok: true,
    item: {
      scope: target.scope,
      storeId: target.storeId,
      clusterId: target.clusterId,
      rules
    }
  });
}

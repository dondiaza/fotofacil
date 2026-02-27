import bcrypt from "bcryptjs";
import { PrismaClient, RequirementKind } from "@prisma/client";
import { DEFAULT_SLOTS } from "../src/lib/constants";

const prisma = new PrismaClient();

async function upsertGlobalRules() {
  // 0 = Sunday ... 6 = Saturday
  const weekdays = [0, 1, 2, 3, 4, 5, 6];
  for (const weekday of weekdays) {
    const existing = await prisma.uploadRule.findFirst({
      where: {
        weekday,
        storeId: null,
        clusterId: null
      }
    });

    if (existing) {
      await prisma.uploadRule.update({
        where: { id: existing.id },
        data: {
          requirement: RequirementKind.PHOTO
        }
      });
    } else {
      await prisma.uploadRule.create({
        data: {
          weekday,
          requirement: RequirementKind.PHOTO
        }
      });
    }
  }
}

async function main() {
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@fotofacil.local";
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { username: "superadmin" },
    update: {
      email: adminEmail,
      passwordHash,
      role: "SUPERADMIN",
      mustChangePw: false,
      storeId: null,
      clusterId: null
    },
    create: {
      username: "superadmin",
      email: adminEmail,
      passwordHash,
      role: "SUPERADMIN",
      mustChangePw: false
    }
  });

  for (const slot of DEFAULT_SLOTS) {
    const existing = await prisma.slotTemplate.findFirst({
      where: {
        name: slot.name,
        storeId: null
      }
    });

    if (existing) {
      await prisma.slotTemplate.update({
        where: { id: existing.id },
        data: {
          required: slot.required,
          order: slot.order,
          allowMultiple: slot.allowMultiple
        }
      });
    } else {
      await prisma.slotTemplate.create({
        data: {
          name: slot.name,
          required: slot.required,
          order: slot.order,
          allowMultiple: slot.allowMultiple,
          storeId: null
        }
      });
    }
  }

  await upsertGlobalRules();

  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {
      driveRootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null
    },
    create: {
      id: 1,
      driveRootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null
    }
  });

  const cluster = await prisma.cluster.upsert({
    where: { code: "NORTE" },
    update: {
      name: "Cluster Norte",
      isActive: true
    },
    create: {
      code: "NORTE",
      name: "Cluster Norte",
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { username: "cluster_norte" },
    update: {
      role: "CLUSTER",
      clusterId: cluster.id,
      storeId: null,
      passwordHash,
      mustChangePw: false
    },
    create: {
      username: "cluster_norte",
      email: "cluster.norte@fotofacil.local",
      role: "CLUSTER",
      clusterId: cluster.id,
      passwordHash,
      mustChangePw: false
    }
  });

  const store = await prisma.store.upsert({
    where: { storeCode: "043" },
    update: {
      clusterId: cluster.id,
      isActive: true
    },
    create: {
      name: "Tienda Demo 043",
      storeCode: "043",
      clusterId: cluster.id,
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { username: "tienda043" },
    update: {
      role: "STORE",
      storeId: store.id,
      clusterId: cluster.id,
      passwordHash,
      mustChangePw: false
    },
    create: {
      username: "tienda043",
      email: "tienda043@fotofacil.local",
      role: "STORE",
      storeId: store.id,
      clusterId: cluster.id,
      passwordHash,
      mustChangePw: false
    }
  });

  console.log("Seed complete.");
  console.log("Superadmin:", adminEmail, "/ username superadmin");
  console.log("Cluster demo:", "cluster_norte /", adminPassword);
  console.log("Store demo:", "tienda043 /", adminPassword);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

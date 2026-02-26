import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_SLOTS } from "../src/lib/constants";

const prisma = new PrismaClient();

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
      mustChangePw: false
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

  // Example store and user for local testing.
  const store = await prisma.store.upsert({
    where: { storeCode: "043" },
    update: {},
    create: {
      name: "Tienda Demo 043",
      storeCode: "043",
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { username: "tienda043" },
    update: {
      role: "STORE",
      storeId: store.id,
      passwordHash
    },
    create: {
      username: "tienda043",
      email: "tienda043@fotofacil.local",
      role: "STORE",
      storeId: store.id,
      passwordHash,
      mustChangePw: false
    }
  });

  console.log("Seed complete.");
  console.log("Superadmin:", adminEmail, "/ username superadmin");
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

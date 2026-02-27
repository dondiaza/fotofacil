import JSZip from "jszip";
import { formatDateKey, parseDateKey, todayDateKey } from "@/lib/date";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { canManagerAccessStore, requireManager } from "@/lib/request-auth";
import { downloadDriveFile } from "@/lib/drive";

export async function GET(request: Request) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId");
  const dateParam = url.searchParams.get("date") || todayDateKey();

  if (!storeId) {
    return badRequest("storeId is required");
  }
  if (!(await canManagerAccessStore(manager, storeId))) {
    return forbidden();
  }

  let day: Date;
  try {
    day = parseDateKey(dateParam);
  } catch (error) {
    return badRequest((error as Error).message);
  }

  const uploadDay = await prisma.uploadDay.findUnique({
    where: {
      storeId_date: {
        storeId,
        date: day
      }
    },
    include: {
      store: {
        select: {
          storeCode: true
        }
      },
      files: {
        where: {
          isCurrentVersion: true
        },
        orderBy: [{ slotName: "asc" }, { sequence: "asc" }],
        select: {
          driveFileId: true,
          finalFilename: true
        }
      }
    }
  });

  if (!uploadDay || uploadDay.files.length === 0) {
    return badRequest("No hay archivos para ese día");
  }

  const zip = new JSZip();
  for (const file of uploadDay.files) {
    const downloaded = await downloadDriveFile(file.driveFileId);
    zip.file(file.finalFilename || downloaded.name, downloaded.buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const zipName = `${uploadDay.store.storeCode}_${formatDateKey(day)}_PACK.zip`;
  const body = new Uint8Array(zipBuffer);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store"
    }
  });
}

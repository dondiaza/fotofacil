import "server-only";
import { Readable } from "node:stream";
import { google } from "googleapis";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

type DriveErrorLike = {
  message?: string;
  code?: number;
  status?: number;
  errors?: Array<{ reason?: string; message?: string }>;
};

function getDriveClient() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Google Drive service account env vars are missing");
  }

  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY,
    scopes: DRIVE_SCOPES,
    subject: env.GOOGLE_IMPERSONATE_USER || undefined
  });

  return google.drive({
    version: "v3",
    auth
  });
}

export async function getConfiguredDriveRootFolderId() {
  const config = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: { driveRootFolderId: true }
  });
  return config?.driveRootFolderId || env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null;
}

async function findFolderByName(parentId: string, folderName: string) {
  const drive = getDriveClient();
  const escaped = folderName.replace(/'/g, "\\'");
  const query = [
    `'${parentId}' in parents`,
    `name = '${escaped}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false"
  ].join(" and ");

  const found = await drive.files.list({
    q: query,
    fields: "files(id,name)",
    pageSize: 10,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  return found.data.files?.[0] ?? null;
}

async function createFolder(parentId: string, folderName: string) {
  const drive = getDriveClient();
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true
  });
  return created.data;
}

export async function ensureStoreFolder(storeCode: string, cachedFolderId?: string | null) {
  if (cachedFolderId) {
    return cachedFolderId;
  }
  const rootId = await getConfiguredDriveRootFolderId();
  if (!rootId) {
    throw new Error("Drive root folder is not configured");
  }
  const folderName = `TIENDA_${storeCode}`;
  const existing = await findFolderByName(rootId, folderName);
  if (existing?.id) {
    return existing.id;
  }
  const created = await createFolder(rootId, folderName);
  if (!created.id) {
    throw new Error("Failed to create store folder in Drive");
  }
  return created.id;
}

export async function ensureChildFolder(parentId: string, childName: string, cachedFolderId?: string | null) {
  if (cachedFolderId) {
    return cachedFolderId;
  }
  const existing = await findFolderByName(parentId, childName);
  if (existing?.id) {
    return existing.id;
  }
  const created = await createFolder(parentId, childName);
  if (!created.id) {
    throw new Error("Failed to create child folder in Drive");
  }
  return created.id;
}

export async function ensureDateFolder(storeFolderId: string, dateKey: string, cachedFolderId?: string | null) {
  return ensureChildFolder(storeFolderId, dateKey, cachedFolderId);
}

export async function uploadBufferToDrive(params: {
  parentId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}) {
  const drive = getDriveClient();
  const created = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [params.parentId]
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.data)
    },
    fields: "id,name,webViewLink,webContentLink,mimeType",
    supportsAllDrives: true
  });

  if (!created.data.id) {
    throw new Error("Drive upload failed");
  }

  return {
    id: created.data.id,
    webViewLink: created.data.webViewLink || null,
    mimeType: created.data.mimeType || params.mimeType
  };
}

export async function getDriveFolderMeta(folderId: string) {
  const drive = getDriveClient();
  const response = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType,webViewLink",
    supportsAllDrives: true
  });
  return response.data;
}

export function isDriveStorageQuotaError(error: unknown) {
  const err = (error || {}) as DriveErrorLike;
  if (typeof err.message === "string" && err.message.includes("Service Accounts do not have storage quota")) {
    return true;
  }
  return Boolean(err.errors?.some((item) => item.reason === "storageQuotaExceeded"));
}

export async function assertDriveFolderWritable(folderId: string) {
  const drive = getDriveClient();
  const probeName = `_fotofacil_probe_${Date.now()}.txt`;
  const created = await drive.files.create({
    requestBody: {
      name: probeName,
      parents: [folderId]
    },
    media: {
      mimeType: "text/plain",
      body: Readable.from(Buffer.from("probe"))
    },
    fields: "id",
    supportsAllDrives: true
  });

  const probeId = created.data.id;
  if (!probeId) {
    throw new Error("Drive write probe failed");
  }

  await drive.files.delete({
    fileId: probeId,
    supportsAllDrives: true
  });
}

export async function downloadDriveFile(fileId: string) {
  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: "id,name,mimeType",
    supportsAllDrives: true
  });
  const media = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true
    },
    {
      responseType: "arraybuffer"
    }
  );

  return {
    id: meta.data.id || fileId,
    name: meta.data.name || fileId,
    mimeType: meta.data.mimeType || "application/octet-stream",
    buffer: Buffer.from(media.data as ArrayBuffer)
  };
}

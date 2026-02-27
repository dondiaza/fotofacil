import "server-only";
import { Readable } from "node:stream";
import type { UploadKind } from "@prisma/client";
import { google } from "googleapis";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { driveDayLabel, driveMonthLabel, driveWeekLabel, driveYearLabel } from "@/lib/date";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

type DriveErrorLike = {
  message?: string;
  code?: number;
  status?: number;
  errors?: Array<{ reason?: string; message?: string }>;
};

export type DriveAuthMode = "oauth" | "service_account" | "none";

function hasOAuthCredentials() {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

function hasServiceAccountCredentials() {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);
}

export function getDriveAuthMode(): DriveAuthMode {
  if (hasOAuthCredentials()) {
    return "oauth";
  }
  if (hasServiceAccountCredentials()) {
    return "service_account";
  }
  return "none";
}

function getDriveAuthClient() {
  const authMode = getDriveAuthMode();

  if (authMode === "oauth") {
    const auth = new google.auth.OAuth2({
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET
    });
    auth.setCredentials({
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN
    });

    return auth;
  }

  if (authMode === "service_account") {
    const auth = new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: env.GOOGLE_PRIVATE_KEY,
      scopes: DRIVE_SCOPES,
      subject: env.GOOGLE_IMPERSONATE_USER || undefined
    });

    return auth;
  }

  throw new Error("Google Drive credentials are missing");
}

function getDriveClient() {
  const auth = getDriveAuthClient();
  return google.drive({
    version: "v3",
    auth
  });
}

async function getDriveAccessToken() {
  const auth = getDriveAuthClient() as any;
  const tokenResult = await auth.getAccessToken?.();
  const token =
    typeof tokenResult === "string"
      ? tokenResult
      : typeof tokenResult?.token === "string"
        ? tokenResult.token
        : null;
  if (token) {
    return token;
  }

  const credentials = await auth.authorize?.();
  if (typeof credentials?.access_token === "string" && credentials.access_token) {
    return credentials.access_token;
  }

  throw new Error("Could not obtain Google Drive access token");
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

function normalizeFolderName(input: string) {
  const cleaned = input
    .trim()
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ");
  return cleaned || "SIN_NOMBRE";
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

export async function ensureStructuredUploadFolder(params: {
  clusterName: string;
  storeName: string;
  date: Date;
  kind: UploadKind;
  cachedDayFolderId?: string | null;
}) {
  const rootId = await getConfiguredDriveRootFolderId();
  if (!rootId) {
    throw new Error("Drive root folder is not configured");
  }

  const clusterFolderName = normalizeFolderName(params.clusterName);
  const storeFolderName = normalizeFolderName(params.storeName);
  const yearLabel = driveYearLabel(params.date);
  const monthLabel = driveMonthLabel(params.date);
  const weekLabel = driveWeekLabel(params.date);
  const dayLabel = driveDayLabel(params.date);
  const contentLabel = params.kind === "VIDEO" ? "Video" : "Foto";

  const clusterFolderId = await ensureChildFolder(rootId, clusterFolderName);
  const storeFolderId = await ensureChildFolder(clusterFolderId, storeFolderName);
  const yearFolderId = await ensureChildFolder(storeFolderId, yearLabel);
  const monthFolderId = await ensureChildFolder(yearFolderId, monthLabel);
  const weekFolderId = await ensureChildFolder(monthFolderId, weekLabel);
  const dayFolderId = await ensureChildFolder(weekFolderId, dayLabel, params.cachedDayFolderId);
  const contentFolderId = await ensureChildFolder(dayFolderId, contentLabel);

  return {
    folderId: contentFolderId,
    dayFolderId,
    trace: {
      rootFolderId: rootId,
      clusterFolderId,
      storeFolderId,
      yearFolderId,
      monthFolderId,
      weekFolderId,
      dayFolderId,
      contentFolderId
    }
  };
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

export async function createDriveResumableUploadSession(params: {
  parentId: string;
  fileName: string;
  mimeType: string;
  bytes: number;
}) {
  const accessToken = await getDriveAccessToken();
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": params.mimeType,
        "X-Upload-Content-Length": String(params.bytes)
      },
      body: JSON.stringify({
        name: params.fileName,
        parents: [params.parentId]
      })
    }
  );

  const uploadUrl = response.headers.get("location");
  if (!response.ok || !uploadUrl) {
    const details = await response.text().catch(() => "");
    throw new Error(`Drive resumable init failed (${response.status}) ${details}`);
  }

  return uploadUrl;
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

export async function getDriveFileMeta(fileId: string) {
  const drive = getDriveClient();
  const response = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,webViewLink,parents,size",
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

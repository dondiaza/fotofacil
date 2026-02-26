import fs from "node:fs";
import crypto from "node:crypto";
import { google } from "googleapis";

const folderId = "1zM_zMfjE5HfCajZYDfhrbQ4f6ksEbXnr";
const saPath = "c:/Users/CARLOS~1/DOWNLO~1/pampling-4585c51e8e7a.json";
const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));

function driveFor(subject) {
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
    subject: subject || undefined
  });
  return google.drive({ version: "v3", auth });
}

async function getMeta() {
  const drive = driveFor();
  const meta = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType,driveId,owners(emailAddress,displayName),permissions(emailAddress,role,type),capabilities",
    supportsAllDrives: true
  });
  return meta.data;
}

async function tryUpload(subject, label) {
  const drive = driveFor(subject);
  const fileName = `_fotofacil_probe_${label}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.txt`;
  try {
    const created = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: "text/plain",
        body: "probe"
      },
      fields: "id,name",
      supportsAllDrives: true
    });
    const id = created.data.id;
    if (id) {
      await drive.files.delete({
        fileId: id,
        supportsAllDrives: true
      });
    }
    return { ok: true, id };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || String(error),
      code: error?.code || error?.status,
      errors: error?.errors || null
    };
  }
}

const meta = await getMeta();
console.log("META", JSON.stringify(meta, null, 2));

const subjects = new Set();
for (const owner of meta.owners || []) {
  if (owner.emailAddress) {
    subjects.add(owner.emailAddress);
  }
}
for (const perm of meta.permissions || []) {
  if (perm.emailAddress && perm.type === "user") {
    subjects.add(perm.emailAddress);
  }
}

const direct = await tryUpload(undefined, "direct");
console.log("UPLOAD_DIRECT", JSON.stringify(direct, null, 2));

for (const subject of subjects) {
  const r = await tryUpload(subject, "subject");
  console.log(`UPLOAD_SUBJECT_${subject}`, JSON.stringify(r, null, 2));
}

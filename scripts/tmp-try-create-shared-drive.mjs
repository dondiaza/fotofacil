import fs from "node:fs";
import crypto from "node:crypto";
import { google } from "googleapis";

const sa = JSON.parse(fs.readFileSync("c:/Users/CARLOS~1/DOWNLO~1/pampling-4585c51e8e7a.json", "utf8"));
const auth = new google.auth.JWT({
  email: sa.client_email,
  key: sa.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"]
});
const drive = google.drive({ version: "v3", auth });

try {
  const res = await drive.drives.create({
    requestId: crypto.randomUUID(),
    requestBody: {
      name: `FOTOFACIL_AUTO_${new Date().toISOString().slice(0, 10)}`
    }
  });
  console.log("CREATED", JSON.stringify(res.data, null, 2));
} catch (error) {
  console.log(
    "ERROR",
    JSON.stringify(
      {
        message: error?.message,
        code: error?.code || error?.status,
        errors: error?.errors || null
      },
      null,
      2
    )
  );
}

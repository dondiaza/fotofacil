import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { google } from "googleapis";
import fs from "node:fs";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function readArg(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] || fallback;
}

function loadClientJson(filePath) {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return parsed.web || parsed.installed || null;
}

function html(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title></head><body style="font-family:system-ui;padding:24px"><h2>${title}</h2><p>${body}</p></body></html>`;
}

async function openBrowser(url) {
  if (process.platform !== "win32") {
    return;
  }
  await new Promise((resolve) => {
    const child = spawn("cmd", ["/c", "start", "", url], {
      stdio: "ignore",
      detached: true
    });
    child.on("error", () => resolve());
    child.on("spawn", () => resolve());
  });
}

async function main() {
  const clientJsonPath = readArg("--client-json");
  if (!clientJsonPath) {
    throw new Error("Missing --client-json <path>");
  }

  const port = Number(readArg("--port", "53682"));
  const autoOpen = readArg("--open", "1") !== "0";
  const outFile = path.resolve(readArg("--out", ".tmp_drive_oauth_tokens.json"));

  const creds = loadClientJson(clientJsonPath);
  const clientId = creds?.client_id;
  const clientSecret = creds?.client_secret;
  if (!clientId || !clientSecret) {
    throw new Error("Invalid client JSON: missing client_id/client_secret");
  }

  const redirectUri = `http://localhost:${port}`;
  const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const pkce = await oauth.generateCodeVerifierAsync();

  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_SCOPE],
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256"
  });

  console.log("AUTH_URL_START");
  console.log(authUrl);
  console.log("AUTH_URL_END");

  const tokenPromise = new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", redirectUri);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          res.end(html("Autorización cancelada", `Google devolvió error: ${error}`));
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          res.end(html("Código no recibido", "No se encontró code en la URL de retorno."));
          return;
        }

        const result = await oauth.getToken({
          code,
          codeVerifier: pkce.codeVerifier,
          redirect_uri: redirectUri
        });

        fs.writeFileSync(outFile, JSON.stringify(result.tokens, null, 2), "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html("Conectado", "Google Drive autorizado correctamente. Ya puedes cerrar esta pestaña."));
        server.close();
        resolve(result.tokens);
      } catch (error) {
        res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
        res.end(html("Error", "No se pudo completar la autorización. Revisa la consola."));
        server.close();
        reject(error);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(`CALLBACK_LISTENING=http://localhost:${port}`);
    });
  });

  if (autoOpen) {
    await openBrowser(authUrl);
  } else {
    console.log("Abre la URL de arriba manualmente.");
  }

  const tokens = await tokenPromise;
  console.log(`TOKENS_FILE=${outFile}`);
  console.log(JSON.stringify(tokens, null, 2));
}

main().catch((error) => {
  const payload = {
    message: error?.message || String(error),
    code: error?.code || error?.status,
    response: error?.response?.data || null
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});


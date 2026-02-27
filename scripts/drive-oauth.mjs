import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DEFAULT_PKCE_STATE_FILE = path.resolve(".tmp_drive_oauth_pkce.json");

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

function loadClientJson(filePath) {
  if (!filePath) {
    return null;
  }
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);
  return parsed.web || parsed.installed || null;
}

function resolveCredentials() {
  const fromFile = loadClientJson(readArg("--client-json"));
  const clientId = readArg("--client-id") || process.env.GOOGLE_OAUTH_CLIENT_ID || fromFile?.client_id || null;
  const clientSecret =
    readArg("--client-secret") || process.env.GOOGLE_OAUTH_CLIENT_SECRET || fromFile?.client_secret || null;
  const redirectUri =
    readArg("--redirect-uri") ||
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    process.env.APP_URL ||
    fromFile?.redirect_uris?.[0] ||
    null;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing OAuth credentials. Required: client_id, client_secret and redirect_uri (from env/args/client-json)."
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function savePkceState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

function loadPkceState(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function resolveCode(raw) {
  if (!raw) {
    return null;
  }

  if (raw.includes("code=")) {
    try {
      const url = new URL(raw);
      return url.searchParams.get("code");
    } catch {
      return null;
    }
  }

  return raw;
}

function resolveCodeFromArgsOrFile(rawCode) {
  const codeFile = readArg("--code-file");
  if (codeFile) {
    const raw = fs.readFileSync(path.resolve(codeFile), "utf8").trim();
    return resolveCode(raw);
  }
  return resolveCode(rawCode);
}

async function main() {
  const command = process.argv[2];
  const { clientId, clientSecret, redirectUri } = resolveCredentials();
  const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (command === "auth-url") {
    const url = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [DRIVE_SCOPE]
    });
    console.log(url);
    return;
  }

  if (command === "auth-url-pkce") {
    const pkce = await oauth.generateCodeVerifierAsync();
    const stateFile = readArg("--state-file") || DEFAULT_PKCE_STATE_FILE;

    const url = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [DRIVE_SCOPE],
      code_challenge: pkce.codeChallenge,
      code_challenge_method: "S256"
    });

    savePkceState(stateFile, {
      createdAt: new Date().toISOString(),
      clientId,
      redirectUri,
      codeVerifier: pkce.codeVerifier
    });

    console.log(`STATE_FILE=${stateFile}`);
    console.log(url);
    return;
  }

  if (command === "exchange") {
    const code = resolveCodeFromArgsOrFile(process.argv[3]);
    if (!code) {
      throw new Error("Missing auth code. Usage: node scripts/drive-oauth.mjs exchange <code>");
    }
    const result = await oauth.getToken(code);
    console.log(JSON.stringify(result.tokens, null, 2));
    return;
  }

  if (command === "exchange-pkce") {
    const code = resolveCodeFromArgsOrFile(process.argv[3]);
    if (!code) {
      throw new Error("Missing auth code. Usage: node scripts/drive-oauth.mjs exchange-pkce <code-or-callback-url>");
    }

    const stateFile = readArg("--state-file") || DEFAULT_PKCE_STATE_FILE;
    const state = loadPkceState(stateFile);

    if (state.clientId !== clientId || state.redirectUri !== redirectUri) {
      throw new Error("PKCE state does not match current client_id/redirect_uri.");
    }

    const result = await oauth.getToken({
      code,
      codeVerifier: state.codeVerifier,
      redirect_uri: redirectUri
    });
    console.log(JSON.stringify(result.tokens, null, 2));
    return;
  }

  throw new Error(
    "Usage: node scripts/drive-oauth.mjs <auth-url|auth-url-pkce|exchange|exchange-pkce> [options]"
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

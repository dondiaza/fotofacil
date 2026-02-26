import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const repoName = process.argv[2] || "fotofacil";
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error("GITHUB_TOKEN no está definido.");
  process.exit(1);
}

const projectRoot = process.cwd();
const gitExe = path.join(projectRoot, ".tools", "git", "cmd", "git.exe");

if (!existsSync(gitExe)) {
  console.error(`No se encontró git en ${gitExe}`);
  process.exit(1);
}

function runGit(args, allowError = false) {
  try {
    return execFileSync(gitExe, args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    if (allowError) {
      return (error.stderr || error.stdout || "").toString().trim();
    }
    console.error(`git ${args.join(" ")}\n${(error.stderr || error.stdout || error.message).toString()}`);
    process.exit(1);
  }
}

async function gh(pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "fotofacil-deployer"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (options.allow404 && response.status === 404) {
    return { status: 404, json: null };
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`GitHub API ${pathname} (${response.status}): ${JSON.stringify(json)}`);
    process.exit(1);
  }

  return { status: response.status, json };
}

const me = await gh("/user");
const login = me.json?.login;
if (!login) {
  console.error("No se pudo resolver el usuario de GitHub.");
  process.exit(1);
}

const repoCheck = await gh(`/repos/${login}/${repoName}`, { allow404: true });
if (repoCheck.status === 404) {
  await gh("/user/repos", {
    method: "POST",
    body: {
      name: repoName,
      private: false,
      description: "FotoFacil MVP",
      has_issues: true,
      has_projects: false,
      has_wiki: false
    }
  });
}

if (!existsSync(path.join(projectRoot, ".git"))) {
  runGit(["init"]);
}

runGit(["config", "user.name", process.env.GIT_AUTHOR_NAME || login]);
runGit(["config", "user.email", process.env.GIT_AUTHOR_EMAIL || `${login}@users.noreply.github.com`]);
runGit(["add", "."]);

const commitMsg = process.env.GIT_COMMIT_MESSAGE || "feat: media library, drive settings and vercel deployment prep";
const commitResult = runGit(["commit", "-m", commitMsg], true);
if (
  commitResult &&
  !commitResult.toLowerCase().includes("nothing to commit") &&
  !commitResult.toLowerCase().includes("no changes added")
) {
  process.stdout.write("");
}

const cleanRemote = `https://github.com/${login}/${repoName}.git`;
const authRemote = `https://x-access-token:${token}@github.com/${login}/${repoName}.git`;

const currentRemotes = runGit(["remote"], true);
if (currentRemotes.split(/\s+/).includes("origin")) {
  runGit(["remote", "set-url", "origin", authRemote]);
} else {
  runGit(["remote", "add", "origin", authRemote]);
}

runGit(["branch", "-M", "main"]);
runGit(["push", "-u", "origin", "main"]);
runGit(["remote", "set-url", "origin", cleanRemote]);

console.log(`REPO_URL=${cleanRemote}`);

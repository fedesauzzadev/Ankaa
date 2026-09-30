import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface GithubRepo {
  name: string;
  cloneUrl: string;
}

export type ListReposResult = { ok: true; repos: GithubRepo[] } | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 30000;
const CLONE_TIMEOUT_MS = 120000;

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

export function validateGitRemoteUrl(value: string): { ok: true } | { ok: false; error: string } {
  if (value.length === 0 || /\s/u.test(value) || hasControlCharacter(value)) {
    return { ok: false, error: "invalid git URL" };
  }
  if (/^(?:https|ssh):\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { ok: false, error: "invalid git URL" };
    }
    const isHttps = url.protocol === "https:";
    const isSsh = url.protocol === "ssh:";
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (
      (!isHttps && !isSsh) ||
      url.hostname === "" ||
      (isHttps && (url.username !== "" || url.password !== "")) ||
      (isSsh && url.password !== "") ||
      url.search !== "" ||
      url.hash !== "" ||
      pathSegments.length < 1
    ) {
      return { ok: false, error: "git URL must be an HTTPS or SSH repository URL without secrets" };
    }
    return { ok: true };
  }
  if (value.includes("://")) {
    return { ok: false, error: "git URL must use HTTPS or SSH" };
  }
  const scp = /^(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9.-]+):([^?#\s]+)$/.exec(value);
  if (scp?.[1] !== undefined && scp[2] !== undefined) {
    const validHost = scp[1]
      .split(".")
      .every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
    if (validHost && scp[2].split("/").filter(Boolean).length >= 1) return { ok: true };
  }
  return {
    ok: false,
    error: "git URL must use HTTPS or SSH (ssh:// or user@host:path) without inline secrets",
  };
}

function nextLink(header: string | null): string | undefined {
  if (header === null) {
    return undefined;
  }
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return undefined;
}

export async function listOrgRepos(
  apiBase: string,
  org: string,
  token: string,
  maxRepos: number,
): Promise<ListReposResult> {
  const repos: GithubRepo[] = [];
  const organizationPath = encodeURIComponent(org);
  let url: string | undefined =
    `${apiBase.replace(/\/+$/, "")}/orgs/${organizationPath}/repos?per_page=100`;
  while (url !== undefined) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      return {
        ok: false,
        error: `github api request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: `github api denied (HTTP ${res.status}): check GITHUB_TOKEN`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `github api request failed: HTTP ${res.status}`,
      };
    }
    let body: unknown;
    try {
      body = (await res.json()) as unknown;
    } catch {
      return { ok: false, error: "github api returned invalid JSON" };
    }
    if (!Array.isArray(body)) {
      return { ok: false, error: "github api returned unexpected shape" };
    }
    for (const entry of body) {
      if (repos.length >= maxRepos) {
        break;
      }
      if (entry !== null && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        if (typeof record.name === "string" && typeof record.clone_url === "string") {
          repos.push({ name: record.name, cloneUrl: record.clone_url });
        }
      }
    }
    if (repos.length >= maxRepos) {
      break;
    }
    url = nextLink(res.headers.get("link"));
  }
  return { ok: true, repos };
}

const execFileAsync = promisify(execFile);

export async function getRemoteHeadRevision(
  remoteUrl: string,
): Promise<{ ok: true; revision: string } | { ok: false; error: string }> {
  try {
    const result = await execFileAsync("git", ["ls-remote", "--symref", "--", remoteUrl, "HEAD"], {
      timeout: CLONE_TIMEOUT_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const revision = result.stdout
      .split(/\r?\n/u)
      .map((line) => /^([0-9a-f]{40,64})\tHEAD$/i.exec(line)?.[1])
      .find((value) => value !== undefined);
    if (revision === undefined) {
      return { ok: false, error: "git remote did not advertise a HEAD revision" };
    }
    return { ok: true, revision: revision.toLowerCase() };
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, error: "git not found: install git to verify repository revisions" };
    }
    return { ok: false, error: "git could not verify the remote repository revision" };
  }
}

export async function getLocalHeadRevision(
  repoDir: string,
): Promise<{ ok: true; revision: string } | { ok: false; error: string }> {
  try {
    const result = await execFileAsync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
      timeout: CLONE_TIMEOUT_MS,
    });
    const revision = result.stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(revision)) {
      return { ok: false, error: "git clone did not provide a valid HEAD revision" };
    }
    return { ok: true, revision: revision.toLowerCase() };
  } catch {
    return { ok: false, error: "git clone did not provide a readable HEAD revision" };
  }
}

export async function cloneRepo(
  cloneUrl: string,
  destDir: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await execFileAsync("git", ["clone", "--depth", "1", cloneUrl, destDir], {
      timeout: CLONE_TIMEOUT_MS,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ok: false,
        error: "git not found: install git to use --github",
      };
    }
    return {
      ok: false,
      error: `git clone failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    };
  }
}

export async function cloneRemoteRepo(
  remoteUrl: string,
  destDir: string,
  timeoutMs = CLONE_TIMEOUT_MS,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validated = validateGitRemoteUrl(remoteUrl);
  if (!validated.ok) return validated;
  const isSsh = /^ssh:\/\//i.test(remoteUrl) || /^[^/]+@[^/:]+:/.test(remoteUrl);
  try {
    await execFileAsync("git", ["clone", "--depth", "1", "--", remoteUrl, destDir], {
      timeout: timeoutMs,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        ...(isSsh
          ? {
              GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND
                ? `${process.env.GIT_SSH_COMMAND} -o BatchMode=yes`
                : "ssh -o BatchMode=yes",
            }
          : {}),
      },
    });
    return { ok: true };
  } catch (err) {
    const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT")
      return { ok: false, error: "git not found: install git to use scan-repo" };
    if (code === "ETIMEDOUT") return { ok: false, error: "git clone timed out" };
    return { ok: false, error: "git clone failed; verify the URL and local Git credentials" };
  }
}

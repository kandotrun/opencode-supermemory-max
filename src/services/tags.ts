import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { CONFIG } from "../config.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function getGitEmail(): string | null {
  try {
    const email = execSync("git config user.email", { encoding: "utf-8" }).trim();
    return email || null;
  } catch {
    return null;
  }
}

function getGitRepoName(directory: string): string | null {
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      cwd: directory,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const match = remoteUrl.match(/[/:]([^/]+?)(?:\.git)?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function sanitizeRepoName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function getUserTag(): string {
  if (CONFIG.userContainerTag) return CONFIG.userContainerTag;
  const email = getGitEmail();
  if (email) return `${CONFIG.containerTagPrefix}_user_${sha256(email)}`;
  const fallback = process.env.USER || process.env.USERNAME || "anonymous";
  return `${CONFIG.containerTagPrefix}_user_${sha256(fallback)}`;
}

export function getProjectTag(directory: string): string {
  if (CONFIG.projectContainerTag) return CONFIG.projectContainerTag;
  return `${CONFIG.containerTagPrefix}_project_${sha256(directory)}`;
}

export function getRepoTag(directory: string): string {
  if (CONFIG.repoContainerTag) return CONFIG.repoContainerTag;
  const gitRepoName = getGitRepoName(directory);
  const repoName = gitRepoName || directory.split("/").pop() || "unknown";
  return `repo_${sanitizeRepoName(repoName)}`;
}

export function getTags(directory: string): { user: string; project: string; repo: string } {
  return {
    user: getUserTag(),
    project: getProjectTag(directory),
    repo: getRepoTag(directory),
  };
}

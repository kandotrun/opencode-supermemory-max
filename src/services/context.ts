import type { ProfileResponse } from "supermemory/resources";
import { CONFIG } from "../config.js";

interface MemoryResultMinimal {
  similarity?: number;
  memory?: string;
  chunk?: string;
  updatedAt?: string;
}

interface MemoriesResponseMinimal {
  results?: MemoryResultMinimal[];
}

function formatRelativeTime(isoTimestamp: string): string {
  try {
    const dt = new Date(isoTimestamp);
    const now = new Date();
    const seconds = (now.getTime() - dt.getTime()) / 1000;
    const minutes = seconds / 60;
    const hours = seconds / 3600;
    const days = seconds / 86400;
    if (minutes < 30) return "just now";
    if (minutes < 60) return `${Math.floor(minutes)}mins ago`;
    if (hours < 24) return `${Math.floor(hours)}hrs ago`;
    if (days < 7) return `${Math.floor(days)}d ago`;
    const month = dt.toLocaleString("en", { month: "short" });
    if (dt.getFullYear() === now.getFullYear()) return `${dt.getDate()} ${month}`;
    return `${dt.getDate()} ${month}, ${dt.getFullYear()}`;
  } catch { return ""; }
}

function formatMemoryLine(mem: MemoryResultMinimal): string {
  const similarity = Math.round((mem.similarity ?? 0) * 100);
  const content = mem.memory || mem.chunk || "";
  const timeStr = mem.updatedAt ? formatRelativeTime(mem.updatedAt) : "";
  const prefix = timeStr ? `[${timeStr}] ` : "";
  return `- ${prefix}${content} [${similarity}%]`;
}

function extractFactText(fact: unknown): string {
  if (typeof fact === "string") return fact;
  if (fact != null && typeof fact === "object") {
    const content = (fact as { content?: string }).content;
    if (typeof content === "string") return content;
    return JSON.stringify(fact);
  }
  return String(fact ?? "");
}

export function formatContextForPrompt(
  profile: ProfileResponse | null,
  userMemories: MemoriesResponseMinimal,
  projectMemories: MemoriesResponseMinimal,
  repoMemories?: MemoriesResponseMinimal
): string {
  const parts: string[] = ["[SUPERMEMORY]"];

  if (CONFIG.injectProfile && profile?.profile) {
    const { static: staticFacts, dynamic: dynamicFacts } = profile.profile;

    if (staticFacts.length > 0) {
      parts.push("\nUser Profile:");
      staticFacts.slice(0, CONFIG.maxProfileItems).forEach((fact) => {
        parts.push(`- ${extractFactText(fact)}`);
      });
    }

    if (dynamicFacts.length > 0) {
      parts.push("\nRecent Context:");
      dynamicFacts.slice(0, CONFIG.maxProfileItems).forEach((fact) => {
        parts.push(`- ${extractFactText(fact)}`);
      });
    }
  }

  const repoResults = repoMemories?.results || [];
  if (repoResults.length > 0) {
    parts.push("\nRepo Knowledge (Shared):");
    repoResults.forEach((mem) => parts.push(formatMemoryLine(mem)));
  }

  const projectResults = projectMemories.results || [];
  if (projectResults.length > 0) {
    parts.push("\nProject Knowledge:");
    projectResults.forEach((mem) => parts.push(formatMemoryLine(mem)));
  }

  const userResults = userMemories.results || [];
  if (userResults.length > 0) {
    parts.push("\nRelevant Memories:");
    userResults.forEach((mem) => parts.push(formatMemoryLine(mem)));
  }

  if (parts.length === 1) {
    return "";
  }

  return parts.join("\n");
}

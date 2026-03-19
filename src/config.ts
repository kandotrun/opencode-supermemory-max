import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stripJsoncComments } from "./services/jsonc.js";
import { loadCredentials } from "./services/auth.js";

const CONFIG_DIR = join(homedir(), ".config", "opencode");
const CONFIG_FILES = [
  join(CONFIG_DIR, "supermemory.jsonc"),
  join(CONFIG_DIR, "supermemory.json"),
];

interface SupermemoryConfig {
  apiKey?: string;
  similarityThreshold?: number;
  maxMemories?: number;
  maxProjectMemories?: number;
  maxRepoMemories?: number;
  maxProfileItems?: number;
  injectProfile?: boolean;
  containerTagPrefix?: string;
  userContainerTag?: string;
  projectContainerTag?: string;
  repoContainerTag?: string;
  filterPrompt?: string;
  keywordPatterns?: string[];
  compactionThreshold?: number;
  reinjectEveryN?: number;
  recallKeywordPatterns?: string[];
  /** Enable signal extraction for session saves. Only saves turns with signal keywords. */
  signalExtraction?: boolean;
  /** Keywords that mark important turns for signal extraction */
  signalKeywords?: string[];
  /** Number of turns before a signal keyword to include for context */
  signalTurnsBefore?: number;
}

const DEFAULT_KEYWORD_PATTERNS = [
  // English
  "remember", "memorize", "save\\s+this", "note\\s+this",
  "keep\\s+in\\s+mind", "don'?t\\s+forget", "learn\\s+this",
  "store\\s+this", "record\\s+this", "make\\s+a\\s+note",
  "take\\s+note", "jot\\s+down", "commit\\s+to\\s+memory",
  "remember\\s+that", "never\\s+forget", "always\\s+remember",
  // Japanese
  "覚えて", "記憶して", "メモして", "保存して", "忘れないで",
  "忘れるな", "記録して", "覚えておいて", "メモっておいて",
  "メモっといて", "ノートして",
];

const DEFAULT_RECALL_KEYWORD_PATTERNS = [
  "recall", "what\\s+do\\s+you\\s+remember", "check\\s+memory", "search\\s+memory",
  "思い出して", "記憶を?検索", "メモリ[ーを]?確認", "何か覚えてる",
];

const DEFAULT_SIGNAL_KEYWORDS = [
  // English
  "remember", "implementation", "refactor", "architecture", "decision",
  "important", "bug", "fix", "solved", "solution", "pattern", "approach",
  "design", "tradeoff", "migrate", "upgrade", "deprecate",
  // Japanese
  "実装", "リファクタ", "アーキテクチャ", "決定", "重要", "バグ", "修正",
  "解決", "パターン", "設計", "移行", "アップグレード",
];

const DEFAULTS = {
  similarityThreshold: 0.6,
  maxMemories: 5,
  maxProjectMemories: 10,
  maxRepoMemories: 5,
  maxProfileItems: 5,
  injectProfile: true,
  containerTagPrefix: "opencode",
  filterPrompt: "You are a stateful coding agent. Remember all the information, including but not limited to user's coding preferences, tech stack, behaviours, workflows, and any other relevant details.",
  keywordPatterns: [] as string[],
  compactionThreshold: 0.80,
  reinjectEveryN: 0,
  recallKeywordPatterns: [] as string[],
  signalExtraction: false,
  signalKeywords: [] as string[],
  signalTurnsBefore: 3,
};

function isValidRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true; } catch { return false; }
}

function validateCompactionThreshold(value: number | undefined): number {
  if (value === undefined || typeof value !== "number" || isNaN(value)) return DEFAULTS.compactionThreshold;
  if (value <= 0 || value > 1) return DEFAULTS.compactionThreshold;
  return value;
}

function loadConfig(): SupermemoryConfig {
  for (const path of CONFIG_FILES) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const json = stripJsoncComments(content);
        return JSON.parse(json) as SupermemoryConfig;
      } catch { /* Invalid config, use defaults */ }
    }
  }
  return {};
}

const fileConfig = loadConfig();

function getApiKey(): string | undefined {
  if (process.env.SUPERMEMORY_API_KEY) return process.env.SUPERMEMORY_API_KEY;
  if (fileConfig.apiKey) return fileConfig.apiKey;
  return loadCredentials()?.apiKey;
}

export const SUPERMEMORY_API_KEY = getApiKey();

export const CONFIG = {
  similarityThreshold: fileConfig.similarityThreshold ?? DEFAULTS.similarityThreshold,
  maxMemories: fileConfig.maxMemories ?? DEFAULTS.maxMemories,
  maxProjectMemories: fileConfig.maxProjectMemories ?? DEFAULTS.maxProjectMemories,
  maxRepoMemories: fileConfig.maxRepoMemories ?? DEFAULTS.maxRepoMemories,
  maxProfileItems: fileConfig.maxProfileItems ?? DEFAULTS.maxProfileItems,
  injectProfile: fileConfig.injectProfile ?? DEFAULTS.injectProfile,
  containerTagPrefix: fileConfig.containerTagPrefix ?? DEFAULTS.containerTagPrefix,
  userContainerTag: fileConfig.userContainerTag,
  projectContainerTag: fileConfig.projectContainerTag,
  repoContainerTag: fileConfig.repoContainerTag,
  filterPrompt: fileConfig.filterPrompt ?? DEFAULTS.filterPrompt,
  keywordPatterns: [
    ...DEFAULT_KEYWORD_PATTERNS,
    ...(fileConfig.keywordPatterns ?? []).filter(isValidRegex),
  ],
  compactionThreshold: validateCompactionThreshold(fileConfig.compactionThreshold),
  reinjectEveryN: fileConfig.reinjectEveryN ?? DEFAULTS.reinjectEveryN,
  recallKeywordPatterns: [
    ...DEFAULT_RECALL_KEYWORD_PATTERNS,
    ...(fileConfig.recallKeywordPatterns ?? []).filter(isValidRegex),
  ],
  signalExtraction: fileConfig.signalExtraction ?? DEFAULTS.signalExtraction,
  signalKeywords: [
    ...DEFAULT_SIGNAL_KEYWORDS,
    ...(fileConfig.signalKeywords ?? []),
  ],
  signalTurnsBefore: fileConfig.signalTurnsBefore ?? DEFAULTS.signalTurnsBefore,
};

export function isConfigured(): boolean {
  return !!SUPERMEMORY_API_KEY;
}

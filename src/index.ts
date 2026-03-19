import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin";

import { supermemoryClient } from "./services/client.js";
import { formatContextForPrompt } from "./services/context.js";
import { getTags } from "./services/tags.js";
import { stripPrivateContent, isFullyPrivate } from "./services/privacy.js";
import { createCompactionHook, type CompactionContext } from "./services/compaction.js";
import { generatePartId } from "./services/ids.js";

import { isConfigured, CONFIG } from "./config.js";
import { log } from "./services/logger.js";
import type { MemoryScope, MemoryType } from "./types/index.js";

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`]+`/g;

const MEMORY_KEYWORD_PATTERN = new RegExp(`\\b(${CONFIG.keywordPatterns.join("|")})\\b`, "i");
const RECALL_KEYWORD_PATTERN = new RegExp(`\\b(${CONFIG.recallKeywordPatterns.join("|")})\\b`, "i");

const MEMORY_NUDGE_MESSAGE = `[MEMORY TRIGGER DETECTED]
The user wants you to remember something. You MUST use the \`supermemory\` tool with \`mode: "add"\` to save this information.

Extract the key information the user wants remembered and save it as a concise, searchable memory.
- Use \`scope: "project"\` for project-specific preferences (e.g., "run lint with tests")
- Use \`scope: "user"\` for cross-project preferences (e.g., "prefers concise responses")
- Choose an appropriate \`type\`: "preference", "project-config", "learned-pattern", etc.

DO NOT skip this step. The user explicitly asked you to remember.`;

function removeCodeBlocks(text: string): string {
  return text.replace(CODE_BLOCK_PATTERN, "").replace(INLINE_CODE_PATTERN, "");
}

function detectMemoryKeyword(text: string): boolean {
  const textWithoutCode = removeCodeBlocks(text);
  return MEMORY_KEYWORD_PATTERN.test(textWithoutCode);
}

function detectRecallKeyword(text: string): boolean {
  const textWithoutCode = removeCodeBlocks(text);
  return RECALL_KEYWORD_PATTERN.test(textWithoutCode);
}

export const SupermemoryPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  const tags = getTags(directory);
  const sessionMessageCount = new Map<string, number>();
  log("Plugin init", { directory, tags, configured: isConfigured() });

  if (!isConfigured()) {
    log("Plugin disabled - SUPERMEMORY_API_KEY not set");
  }

  // Fetch model limits once at plugin init
  const modelLimits = new Map<string, number>();

  (async () => {
    try {
      const response = await ctx.client.provider.list();
      if (response.data?.all) {
        for (const provider of response.data.all) {
          if (provider.models) {
            for (const [modelId, model] of Object.entries(provider.models)) {
              if (model.limit?.context) {
                modelLimits.set(`${provider.id}/${modelId}`, model.limit.context);
              }
            }
          }
        }
      }
      log("Model limits loaded", { count: modelLimits.size });
    } catch (error) {
      log("Failed to fetch model limits", { error: String(error) });
    }
  })();

  const getModelLimit = (providerID: string, modelID: string): number | undefined => {
    return modelLimits.get(`${providerID}/${modelID}`);
  };

  const compactionHook = isConfigured() && ctx.client
    ? createCompactionHook(ctx as CompactionContext, tags, {
        threshold: CONFIG.compactionThreshold,
        getModelLimit,
      })
    : null;

  // Track messages per session for auto-save on session end
  const sessionMessages = new Map<string, string[]>();

  const collectMessage = (sessionID: string, text: string) => {
    if (!text.trim()) return;
    const messages = sessionMessages.get(sessionID) || [];
    // Keep last N messages to avoid unbounded growth
    const MAX_TRACKED = 50;
    if (messages.length >= MAX_TRACKED) messages.shift();
    messages.push(text);
    sessionMessages.set(sessionID, messages);
  };

  const saveSessionSummary = async (sessionID: string) => {
    const messages = sessionMessages.get(sessionID);
    if (!messages || messages.length < 3) {
      log("session-save: too few messages, skipping", { sessionID, count: messages?.length || 0 });
      sessionMessages.delete(sessionID);
      return;
    }

    // Build a condensed transcript (limit size)
    const MAX_CHARS = 50_000;
    let transcript = messages.join("\n---\n");
    if (transcript.length > MAX_CHARS) {
      transcript = transcript.slice(0, MAX_CHARS) + "\n...[truncated]";
    }

    const content = `[Session Conversation - ${new Date().toISOString()}]\n${transcript}`;

    try {
      const result = await supermemoryClient.ingestConversation(
        sessionID,
        [{ role: "user", content }],
        [tags.project, tags.user],
        { type: "conversation", source: "session-end" }
      );
      log("session-save: saved", { sessionID, success: result.success });
    } catch (err) {
      log("session-save: error", { sessionID, error: String(err) });
    }

    sessionMessages.delete(sessionID);
  };

  return {
    "chat.message": async (input, output) => {
      if (!isConfigured()) return;

      const start = Date.now();

      try {
        const textParts = output.parts.filter(
          (p): p is Part & { type: "text"; text: string } => p.type === "text"
        );

        if (textParts.length === 0) {
          log("chat.message: no text parts found");
          return;
        }

        const userMessage = textParts.map((p) => p.text).join("\n");

        if (!userMessage.trim()) {
          log("chat.message: empty message, skipping");
          return;
        }

        log("chat.message: processing", {
          messagePreview: userMessage.slice(0, 100),
          partsCount: output.parts.length,
          textPartsCount: textParts.length,
        });

        // Track message for session-end auto-save
        collectMessage(input.sessionID, userMessage);

        if (detectMemoryKeyword(userMessage)) {
          log("chat.message: memory keyword detected");
          const nudgePart: Part = {
            id: generatePartId(),
            sessionID: input.sessionID,
            messageID: output.message.id,
            type: "text",
            text: MEMORY_NUDGE_MESSAGE,
            synthetic: true,
          };
          output.parts.push(nudgePart);
        }

        // Determine whether to inject context
        const count = (sessionMessageCount.get(input.sessionID) || 0) + 1;
        sessionMessageCount.set(input.sessionID, count);

        const isFirstMessage = count === 1;
        const recallTriggered = detectRecallKeyword(userMessage);
        const periodicReinject = CONFIG.reinjectEveryN > 0 && count % CONFIG.reinjectEveryN === 0;
        const shouldInjectContext = isFirstMessage || recallTriggered || periodicReinject;

        if (shouldInjectContext) {
          log("chat.message: injecting context", {
            reason: isFirstMessage ? "first-message" : recallTriggered ? "recall-keyword" : "periodic",
            messageCount: count,
          });

          const [profileResult, userMemoriesResult, projectMemoriesListResult] = await Promise.all([
            supermemoryClient.getProfile(tags.user, userMessage),
            supermemoryClient.searchMemories(userMessage, tags.user),
            supermemoryClient.listMemories(tags.project, CONFIG.maxProjectMemories),
          ]);

          const profile = profileResult.success ? profileResult : null;
          const userMemories = userMemoriesResult.success ? userMemoriesResult : { results: [] };
          const projectMemoriesList = projectMemoriesListResult.success ? projectMemoriesListResult : { memories: [] };

          const projectMemories = {
            results: (projectMemoriesList.memories || []).map((m: any) => ({
              id: m.id,
              memory: m.summary || m.content || m.title || "",
              similarity: 1,
              title: m.title,
              metadata: m.metadata,
            })),
            total: projectMemoriesList.memories?.length || 0,
            timing: 0,
          };

          const memoryContext = formatContextForPrompt(
            profile,
            userMemories,
            projectMemories
          );

          if (memoryContext) {
            const contextPart: Part = {
              id: generatePartId(),
              sessionID: input.sessionID,
              messageID: output.message.id,
              type: "text",
              text: memoryContext,
              synthetic: true,
            };

            output.parts.unshift(contextPart);

            const duration = Date.now() - start;
            log("chat.message: context injected", {
              duration,
              contextLength: memoryContext.length,
              reason: isFirstMessage ? "first-message" : recallTriggered ? "recall-keyword" : "periodic",
            });
          }
        }

      } catch (error) {
        log("chat.message: ERROR", { error: String(error) });
      }
    },

    tool: {
      supermemory: tool({
        description:
          "Manage and query the Supermemory persistent memory system. Use 'search' to find relevant memories, 'add' to store new knowledge, 'profile' to view user profile, 'list' to see recent memories, 'forget' to remove a memory.",
        args: {
          mode: tool.schema
            .enum(["add", "search", "profile", "list", "forget", "help"])
            .optional(),
          content: tool.schema.string().optional(),
          query: tool.schema.string().optional(),
          type: tool.schema
            .enum([
              "project-config",
              "architecture",
              "error-solution",
              "preference",
              "learned-pattern",
              "conversation",
            ])
            .optional(),
          scope: tool.schema.enum(["user", "project"]).optional(),
          memoryId: tool.schema.string().optional(),
          limit: tool.schema.number().optional(),
        },
        async execute(args: {
          mode?: string;
          content?: string;
          query?: string;
          type?: MemoryType;
          scope?: MemoryScope;
          memoryId?: string;
          limit?: number;
        }) {
          if (!isConfigured()) {
            return JSON.stringify({
              success: false,
              error:
                "SUPERMEMORY_API_KEY not set. Set it in your environment to use Supermemory.",
            });
          }

          const mode = args.mode || "help";

          try {
            switch (mode) {
              case "help": {
                return JSON.stringify({
                  success: true,
                  message: "Supermemory Usage Guide",
                  commands: [
                    {
                      command: "add",
                      description: "Store a new memory",
                      args: ["content", "type?", "scope?"],
                    },
                    {
                      command: "search",
                      description: "Search memories",
                      args: ["query", "scope?"],
                    },
                    {
                      command: "profile",
                      description: "View user profile",
                      args: ["query?"],
                    },
                    {
                      command: "list",
                      description: "List recent memories",
                      args: ["scope?", "limit?"],
                    },
                    {
                      command: "forget",
                      description: "Remove a memory",
                      args: ["memoryId", "scope?"],
                    },
                  ],
                  scopes: {
                    user: "Cross-project preferences and knowledge",
                    project: "Project-specific knowledge (default)",
                  },
                  types: [
                    "project-config",
                    "architecture",
                    "error-solution",
                    "preference",
                    "learned-pattern",
                    "conversation",
                  ],
                });
              }

              case "add": {
                if (!args.content) {
                  return JSON.stringify({
                    success: false,
                    error: "content parameter is required for add mode",
                  });
                }

                const sanitizedContent = stripPrivateContent(args.content);
                if (isFullyPrivate(args.content)) {
                  return JSON.stringify({
                    success: false,
                    error: "Cannot store fully private content",
                  });
                }

                const scope = args.scope || "project";
                const containerTag =
                  scope === "user" ? tags.user : tags.project;

                const result = await supermemoryClient.addMemory(
                  sanitizedContent,
                  containerTag,
                  { type: args.type }
                );

                if (!result.success) {
                  return JSON.stringify({
                    success: false,
                    error: result.error || "Failed to add memory",
                  });
                }

                return JSON.stringify({
                  success: true,
                  message: `Memory added to ${scope} scope`,
                  id: result.id,
                  scope,
                  type: args.type,
                });
              }

              case "search": {
                if (!args.query) {
                  return JSON.stringify({
                    success: false,
                    error: "query parameter is required for search mode",
                  });
                }

                const scope = args.scope;

                if (scope === "user") {
                  const result = await supermemoryClient.searchMemories(
                    args.query,
                    tags.user
                  );
                  if (!result.success) {
                    return JSON.stringify({
                      success: false,
                      error: result.error || "Failed to search memories",
                    });
                  }
                  return formatSearchResults(args.query, scope, result, args.limit);
                }

                if (scope === "project") {
                  const result = await supermemoryClient.searchMemories(
                    args.query,
                    tags.project
                  );
                  if (!result.success) {
                    return JSON.stringify({
                      success: false,
                      error: result.error || "Failed to search memories",
                    });
                  }
                  return formatSearchResults(args.query, scope, result, args.limit);
                }

                const [userResult, projectResult] = await Promise.all([
                  supermemoryClient.searchMemories(args.query, tags.user),
                  supermemoryClient.searchMemories(args.query, tags.project),
                ]);

                if (!userResult.success || !projectResult.success) {
                  return JSON.stringify({
                    success: false,
                    error: userResult.error || projectResult.error || "Failed to search memories",
                  });
                }

                const combined = [
                  ...(userResult.results || []).map((r) => ({
                    ...r,
                    scope: "user" as const,
                  })),
                  ...(projectResult.results || []).map((r) => ({
                    ...r,
                    scope: "project" as const,
                  })),
                ].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

                return JSON.stringify({
                  success: true,
                  query: args.query,
                  count: combined.length,
                  results: combined.slice(0, args.limit || 10).map((r) => ({
                    id: r.id,
                    content: r.memory || r.chunk,
                    similarity: Math.round((r.similarity ?? 0) * 100),
                    scope: r.scope,
                  })),
                });
              }

              case "profile": {
                const result = await supermemoryClient.getProfile(
                  tags.user,
                  args.query
                );

                if (!result.success) {
                  return JSON.stringify({
                    success: false,
                    error: result.error || "Failed to fetch profile",
                  });
                }

                return JSON.stringify({
                  success: true,
                  profile: {
                    static: result.profile?.static || [],
                    dynamic: result.profile?.dynamic || [],
                  },
                });
              }

              case "list": {
                const scope = args.scope || "project";
                const limit = args.limit || 20;
                const containerTag =
                  scope === "user" ? tags.user : tags.project;

                const result = await supermemoryClient.listMemories(
                  containerTag,
                  limit
                );

                if (!result.success) {
                  return JSON.stringify({
                    success: false,
                    error: result.error || "Failed to list memories",
                  });
                }

                const memories = result.memories || [];
                return JSON.stringify({
                  success: true,
                  scope,
                  count: memories.length,
                  memories: memories.map((m) => ({
                    id: m.id,
                    content: m.summary,
                    createdAt: m.createdAt,
                    metadata: m.metadata,
                  })),
                });
              }

              case "forget": {
                if (!args.memoryId) {
                  return JSON.stringify({
                    success: false,
                    error: "memoryId parameter is required for forget mode",
                  });
                }

                const scope = args.scope || "project";

                const result = await supermemoryClient.deleteMemory(
                  args.memoryId
                );

                if (!result.success) {
                  return JSON.stringify({
                    success: false,
                    error: result.error || "Failed to delete memory",
                  });
                }

                return JSON.stringify({
                  success: true,
                  message: `Memory ${args.memoryId} removed from ${scope} scope`,
                });
              }

              default:
                return JSON.stringify({
                  success: false,
                  error: `Unknown mode: ${mode}`,
                });
            }
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      }),
    },

    event: async (input: { event: { type: string; properties?: unknown } }) => {
      // Auto-save session conversations on session end
      if (input.event.type === "session.deleted" && isConfigured()) {
        const props = input.event.properties as Record<string, unknown> | undefined;
        const sessionInfo = props?.info as { id?: string } | undefined;
        if (sessionInfo?.id) {
          await saveSessionSummary(sessionInfo.id);
          sessionMessageCount.delete(sessionInfo.id);
        }
      }

      // Track assistant messages for richer session summaries
      if (input.event.type === "message.updated" && isConfigured()) {
        const props = input.event.properties as Record<string, unknown> | undefined;
        const info = props?.info as { role?: string; sessionID?: string; finish?: boolean } | undefined;
        if (info?.role === "assistant" && info?.finish && info?.sessionID) {
          // Try to get assistant text from parts
          const parts = props?.parts as Array<{ type: string; text?: string }> | undefined;
          if (parts) {
            const text = parts.filter(p => p.type === "text" && p.text).map(p => p.text!).join("\n");
            if (text) collectMessage(info.sessionID, `[assistant] ${text}`);
          }
        }
      }

      if (compactionHook) {
        await compactionHook.event(input);
      }
    },
  };
};

function formatSearchResults(
  query: string,
  scope: string | undefined,
  results: { results?: Array<{ id: string; memory?: string; chunk?: string; similarity?: number }> },
  limit?: number
): string {
  const memoryResults = results.results || [];
  return JSON.stringify({
    success: true,
    query,
    scope,
    count: memoryResults.length,
    results: memoryResults.slice(0, limit || 10).map((r) => ({
      id: r.id,
      content: r.memory || r.chunk,
      similarity: Math.round((r.similarity ?? 0) * 100),
    })),
  });
}

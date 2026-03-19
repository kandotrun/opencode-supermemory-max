# opencode-supermemory-max

> 🧠 Enhanced fork of [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory) — maximizing memory quality and coverage for [OpenCode](https://opencode.ai) coding agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why "max"?

The official `opencode-supermemory` plugin is maintained by the Supermemory team, but tends to be conservative with API calls and slow to merge fixes. **opencode-supermemory-max** takes the opposite approach:

- **Aggressive memory utilization** — save more, recall more, lose nothing
- **Bug fixes shipped fast** — no 2-week PR review waits
- **Feature parity with claude-supermemory** — all the good stuff from the Claude Code plugin, ported to OpenCode
- **Japanese language support** — keyword detection and signal extraction work in both English and Japanese
- **Upstream tracking** — good changes from upstream get merged in

## What's different from upstream?

| Feature | upstream | max |
|---------|----------|-----|
| Part ID fix (OpenCode v1.2.25+) | ❌ Broken | ✅ Fixed |
| Japanese keywords (覚えて, メモして, etc.) | ❌ | ✅ 11 patterns |
| Session-end auto-save | ❌ | ✅ Saves to all scopes |
| Context re-injection | First message only | ✅ Periodic + keyword trigger |
| Entity Context (extraction guidance) | ❌ | ✅ Personal + Repo contexts |
| Dedup (no duplicate memories) | ❌ | ✅ Search + profile |
| Relative time display | ❌ | ✅ "3hrs ago", "2d ago" |
| Repo container tag (team sharing) | ❌ | ✅ 3-tier: user/project/repo |
| Signal extraction (smart filtering) | ❌ | ✅ Keyword-based with context |
| Recall keywords (思い出して, recall) | ❌ | ✅ Triggers context refresh |

## Installation

### Quick Start

```bash
# Clone and build
git clone https://github.com/kandotrun/opencode-supermemory-max.git
cd opencode-supermemory-max
bun install && bun run build
```

Add to your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["~/opencode-supermemory-max"]
}
```

Set your API key:

```bash
export SUPERMEMORY_API_KEY="sm_..."
```

Or create `~/.config/opencode/supermemory.jsonc`:

```jsonc
{
  "apiKey": "sm_..."
}
```

Get your API key from [app.supermemory.ai](https://app.supermemory.ai/?view=integrations).

## Features

### 🔄 Context Injection

On first message (and periodically), the agent receives memory context:

```
[SUPERMEMORY]

User Profile:
- Prefers concise responses
- Expert in TypeScript

Repo Knowledge (Shared):
- [2hrs ago] Uses monorepo with turborepo [85%]

Project Knowledge:
- [just now] Build: bun run build [100%]

Relevant Memories:
- [3d ago] Build fails if .env.local missing [82%]
```

### 🇯🇵 Japanese + English Keywords

Memory triggers work in both languages:

| English | Japanese |
|---------|----------|
| remember, save this | 覚えて, メモして, 保存して |
| recall, check memory | 思い出して, メモリ確認 |

### 📦 3-Tier Memory Scopes

| Scope | Purpose | Tag Format |
|-------|---------|------------|
| **User** | Cross-project preferences | `opencode_user_{hash}` |
| **Project** | Directory-specific knowledge | `opencode_project_{hash}` |
| **Repo** | Team-shared via git remote | `repo_{reponame}` |

### 🎯 Signal Extraction

When enabled, only saves session turns containing important keywords — no noise:

```jsonc
{
  "signalExtraction": true,
  "signalTurnsBefore": 3  // context turns before each signal
}
```

Built-in signal keywords: `implementation`, `architecture`, `decision`, `bug`, `fix`, `実装`, `設計`, `重要`, `バグ`, `修正` ...

### 🧹 Dedup & Entity Context

- **Dedup**: Duplicate memories are automatically filtered out from search results and profile
- **Entity Context**: Guides Supermemory on *what* to extract — user actions & decisions for personal scope, architecture & patterns for repo scope

### ⏰ Context Re-injection

```jsonc
{
  "reinjectEveryN": 10  // re-inject context every 10 messages
}
```

Or say "recall" / "思い出して" to trigger immediate context refresh.

## Configuration

`~/.config/opencode/supermemory.jsonc`:

```jsonc
{
  // Memory retrieval
  "similarityThreshold": 0.6,
  "maxMemories": 5,
  "maxProjectMemories": 10,
  "maxRepoMemories": 5,
  "maxProfileItems": 5,

  // Container tags (auto-generated if not set)
  "containerTagPrefix": "opencode",
  "userContainerTag": "my-custom-user-tag",
  "projectContainerTag": "my-project-tag",
  "repoContainerTag": "my-repo-tag",

  // Context re-injection
  "reinjectEveryN": 10,

  // Signal extraction (disabled by default)
  "signalExtraction": false,
  "signalTurnsBefore": 3,

  // Compaction
  "compactionThreshold": 0.8,

  // Extra keyword patterns (regex)
  "keywordPatterns": ["log\\s+this"],
  "recallKeywordPatterns": ["my custom recall"],
  "signalKeywords": ["custom signal"]
}
```

## Tool Usage

The `supermemory` tool is available to the agent:

| Mode | Args | Description |
|------|------|-------------|
| `add` | `content`, `type?`, `scope?` | Store memory |
| `search` | `query`, `scope?` | Search memories |
| `profile` | `query?` | View user profile |
| `list` | `scope?`, `limit?` | List memories |
| `forget` | `memoryId`, `scope?` | Delete memory |

**Scopes:** `user`, `project` (default), `repo`

## Privacy

Content in `<private>` tags is never stored:

```
API key is <private>sk-abc123</private>
```

## Development

```bash
bun install
bun run build
bun run typecheck
```

## Upstream Sync

This fork tracks [supermemoryai/opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory):

```bash
git fetch upstream
git merge upstream/main
```

## License

MIT

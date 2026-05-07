# opencode-supermemory-max

> 🧠 [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory) 的增强 fork —— 为 [OpenCode](https://opencode.ai) 编程助手最大化记忆质量与覆盖率。

## 为什么叫 "max"？

官方 `opencode-supermemory` 由 Supermemory 团队维护，但对 API 调用偏保守，bug 修复合并也较慢。**opencode-supermemory-max** 走相反路线：

- **更激进的记忆利用** —— 多保存、多召回、不丢东西
- **bug 修复秒级合入** —— 不用等两周的 PR review
- **与 claude-supermemory 功能对齐** —— Claude Code 版的所有好功能，全部移植到 OpenCode
- **多语言完整支持** —— 关键词检测和 signal 抽取同时支持英文、日文、中文（简体 + 繁体）
- **跟踪 upstream** —— 上游的好改动会持续合并进来

## 与 upstream 的差异

整合三个官方 Supermemory 插件的最佳特性：
- [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory)（OpenCode 版 —— 基础）
- [claude-supermemory](https://github.com/supermemoryai/claude-supermemory)（Claude Code 版 —— Entity Context、去重、signal 抽取、Repo tag）
- [openclaw-supermemory](https://github.com/supermemoryai/openclaw-supermemory)（OpenClaw 版 —— 增量捕获、元数据剥离、compaction hook）

| 特性 | 官方版 | Claude 版 | OpenClaw 版 | **max 版** |
|------|--------|-----------|-------------|-----------|
| Part ID 修复 | ❌ | — | — | ✅ |
| 日文关键词 | ❌ | ❌ | ❌ | ✅ |
| 中文关键词（记住、修复、设计） | ❌ | ❌ | ❌ | ✅ |
| 增量捕获（崩溃安全） | ❌ | ❌ | ✅ | ✅ |
| 每条消息 recall | ❌ | ❌ | ✅ | ✅ |
| 元数据剥离 | ❌ | ❌ | ✅ | ✅ |
| compaction 前完整保存 | ❌ | ❌ | ✅ | ✅ |
| compaction 后记忆重新注入 | ❌ | ❌ | ❌ | ✅ |
| Entity Context（抽取引导） | ❌ | ✅ | ❌ | ✅ |
| 去重 | ❌ | ✅ | ❌ | ✅ |
| 相对时间显示 | ❌ | ✅ | ❌ | ✅ |
| Repo 容器 tag（团队共享） | ❌ | ✅ | ❌ | ✅ |
| signal 抽取 | ❌ | ✅ | ❌ | ✅ |
| 上下文周期性重新注入 | ❌ | ❌ | ❌ | ✅ |
| 召回关键词（想起来、思い出して、recall） | ❌ | ❌ | ❌ | ✅ |
| 会话结束时自动保存 | ❌ | ✅ | ✅ | ✅ |

## 安装

```bash
# clone 并构建
git clone https://github.com/kandotrun/opencode-supermemory-max.git
cd opencode-supermemory-max
bun install && bun run build
```

加入 OpenCode 配置（`~/.config/opencode/opencode.json`）：

```json
{
  "plugin": ["~/opencode-supermemory-max"]
}
```

设置 API key：

```bash
export SUPERMEMORY_API_KEY="sm_..."
```

或创建 `~/.config/opencode/supermemory.jsonc`：

```jsonc
{
  "apiKey": "sm_..."
}
```

API key 可在 [app.supermemory.ai](https://app.supermemory.ai/?view=integrations) 获取。

## 主要功能

### 🌐 多语言关键词

记忆触发词在英文、日文、中文之间通用：

| 行为 | 英文 | 日文 | 中文 |
|------|------|------|------|
| 保存记忆 | remember, save this | 覚えて, メモして, 保存して | 记住, 记下, 保存下来 |
| 检索记忆 | recall, check memory | 思い出して, メモリ確認 | 想起来, 检查记忆 |
| signal | implementation, bug, fix | 実装, バグ, 修正 | 实现, 修复, 设计, 重要 |

中文关键词同时覆盖**简体**和**繁体**写法（如 `记住` / `記住`、`实现` / `實現`、`修复` / `修復`）。

### 📦 三层记忆 scope

| Scope | 用途 | tag 格式 |
|-------|------|---------|
| **User** | 跨项目偏好与设置 | `opencode_user_{hash}` |
| **Project** | 当前目录的特定知识 | `opencode_project_{hash}` |
| **Repo** | 基于 git remote 名的团队共享 | `repo_{repo_name}` |

### 🎯 signal 抽取

启用后，只保存包含关键词的对话轮次，过滤掉噪音：

```jsonc
{
  "signalExtraction": true,
  "signalTurnsBefore": 3  // signal 前要保留多少轮上下文
}
```

### ⏰ 上下文重新注入

```jsonc
{
  "reinjectEveryN": 10  // 每 10 条消息重新注入一次上下文
}
```

也可以直接说 `想起来` / `思い出して` / `recall` 立刻触发上下文刷新。

### 🧹 去重 & Entity Context

- **去重**：搜索结果和 profile 中会自动过滤重复记忆
- **Entity Context**：告诉 Supermemory 应该抽取什么 —— personal scope 抽取用户行为和决策，repo scope 抽取架构和模式

## 配置

`~/.config/opencode/supermemory.jsonc`：

```jsonc
{
  // 记忆检索
  "similarityThreshold": 0.6,
  "maxMemories": 5,
  "maxProjectMemories": 10,
  "maxRepoMemories": 5,

  // 容器 tag（不设置则自动生成）
  "containerTagPrefix": "opencode",
  "repoContainerTag": "my-repo-tag",

  // 上下文重新注入
  "reinjectEveryN": 10,

  // signal 抽取（默认关闭）
  "signalExtraction": false,
  "signalTurnsBefore": 3,

  // compaction
  "compactionThreshold": 0.8
}
```

## 隐私

`<private>` 标签内的内容不会被保存：

```
API key 是 <private>sk-abc123</private>
```

## 开发

```bash
bun install
bun run build
bun run typecheck
```

## 协议

MIT

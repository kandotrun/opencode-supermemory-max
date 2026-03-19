# opencode-supermemory-max

> 🧠 [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory) の強化フォーク — [OpenCode](https://opencode.ai) コーディングエージェントのメモリ品質とカバレッジを最大化

## なぜ "max" なのか？

公式の `opencode-supermemory` はSupermemoryチームがメンテしていますが、APIコールを控えめにする傾向があり、バグ修正のマージも遅い状況です。**opencode-supermemory-max** は逆のアプローチを取ります:

- **積極的なメモリ活用** — より多く保存し、より多く呼び出し、何も失わない
- **バグ修正を即座に反映** — PRレビュー待ちで2週間放置されない
- **claude-supermemory との機能パリティ** — Claude Code版の良い機能を全てOpenCodeに移植
- **日本語完全対応** — キーワード検出・シグナル抽出が日英両対応
- **upstream追跡** — 本家の良い変更は取り込む

## upstream との違い

3つの公式プラグインのベスト機能を統合:
- [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory)（OpenCode版 — ベース）
- [claude-supermemory](https://github.com/supermemoryai/claude-supermemory)（Claude Code版 — Entity Context、重複排除、シグナル抽出、Repoタグ）
- [openclaw-supermemory](https://github.com/supermemoryai/openclaw-supermemory)（OpenClaw版 — 毎回キャプチャ、メタデータ除去、コンパクション保存）

| 機能 | 公式版 | Claude版 | OpenClaw版 | **max版** |
|------|--------|----------|------------|-----------|
| Part ID修正 | ❌ | — | — | ✅ |
| 日本語キーワード | ❌ | ❌ | ❌ | ✅ |
| 毎回キャプチャ（クラッシュ耐性） | ❌ | ❌ | ✅ | ✅ |
| 毎メッセージrecall | ❌ | ❌ | ✅ | ✅ |
| メタデータ除去 | ❌ | ❌ | ✅ | ✅ |
| コンパクション前の全会話保存 | ❌ | ❌ | ✅ | ✅ |
| コンパクション後のメモリ再注入 | ❌ | ❌ | ❌ | ✅ |
| Entity Context（抽出ガイド） | ❌ | ✅ | ❌ | ✅ |
| 重複排除 | ❌ | ✅ | ❌ | ✅ |
| 相対時間表示 | ❌ | ✅ | ❌ | ✅ |
| Repoコンテナタグ（チーム共有） | ❌ | ✅ | ❌ | ✅ |
| シグナル抽出 | ❌ | ✅ | ❌ | ✅ |
| コンテキスト再注入（定期） | ❌ | ❌ | ❌ | ✅ |
| リコールキーワード | ❌ | ❌ | ❌ | ✅ |
| セッション終了時の自動保存 | ❌ | ✅ | ✅ | ✅ |

## インストール

```bash
# クローンしてビルド
git clone https://github.com/kandotrun/opencode-supermemory-max.git
cd opencode-supermemory-max
bun install && bun run build
```

OpenCodeの設定に追加 (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["~/opencode-supermemory-max"]
}
```

APIキーの設定:

```bash
export SUPERMEMORY_API_KEY="sm_..."
```

または `~/.config/opencode/supermemory.jsonc` を作成:

```jsonc
{
  "apiKey": "sm_..."
}
```

APIキーは [app.supermemory.ai](https://app.supermemory.ai/?view=integrations) から取得。

## 主な機能

### 🇯🇵 日本語対応キーワード

メモリトリガーが日英両対応:

| 動作 | 英語 | 日本語 |
|------|------|--------|
| メモリ保存 | remember, save this | 覚えて, メモして, 保存して |
| メモリ検索 | recall, check memory | 思い出して, メモリ確認 |
| シグナル | implementation, bug, fix | 実装, バグ, 修正, 設計, 重要 |

### 📦 3層メモリスコープ

| スコープ | 用途 | タグ形式 |
|----------|------|----------|
| **User** | プロジェクト横断の好み・設定 | `opencode_user_{hash}` |
| **Project** | ディレクトリ固有の知識 | `opencode_project_{hash}` |
| **Repo** | gitリモート名ベースのチーム共有 | `repo_{リポ名}` |

### 🎯 シグナル抽出

有効にすると、重要なキーワードを含むターンだけを保存。ノイズを排除:

```jsonc
{
  "signalExtraction": true,
  "signalTurnsBefore": 3  // シグナル前のコンテキストターン数
}
```

### ⏰ コンテキスト再注入

```jsonc
{
  "reinjectEveryN": 10  // 10メッセージごとにコンテキストを再注入
}
```

「思い出して」「recall」と言えば即座にコンテキストを再取得。

### 🧹 重複排除 & Entity Context

- **重複排除**: 検索結果とプロフィールから重複メモリを自動フィルタ
- **Entity Context**: 何を抽出すべきかをSupermemoryに指示 — 個人スコープではユーザーの行動・決定、repoスコープではアーキテクチャ・パターンを抽出

## 設定

`~/.config/opencode/supermemory.jsonc`:

```jsonc
{
  // メモリ取得
  "similarityThreshold": 0.6,
  "maxMemories": 5,
  "maxProjectMemories": 10,
  "maxRepoMemories": 5,

  // コンテナタグ（未設定なら自動生成）
  "containerTagPrefix": "opencode",
  "repoContainerTag": "my-repo-tag",

  // コンテキスト再注入
  "reinjectEveryN": 10,

  // シグナル抽出（デフォルト無効）
  "signalExtraction": false,
  "signalTurnsBefore": 3,

  // コンパクション
  "compactionThreshold": 0.8
}
```

## プライバシー

`<private>` タグ内のコンテンツは保存されません:

```
APIキーは <private>sk-abc123</private>
```

## 開発

```bash
bun install
bun run build
bun run typecheck
```

## ライセンス

MIT

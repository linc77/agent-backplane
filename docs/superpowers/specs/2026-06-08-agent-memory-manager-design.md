# Agent Memory Manager 设计稿

日期：2026-06-08

## 目标

做一个 macOS-first 桌面 App，用来查看、理解、搜索、审计和安全修正 Codex 本地记忆。

第一版重点不是替代 Codex 的记忆系统，而是让用户看清：

- Codex 可能从哪些文件获得长期记忆。
- 当前用户画像、项目、规则、工具偏好分别来自哪里。
- 哪些记忆已经过时、冲突或被新的 correction note 覆盖。
- 如何安全生成一条新的记忆修正，不直接破坏主索引。

## 技术路线

参考 `farion1231/cc-switch` 的桌面应用技术路线：

- Tauri 2 作为桌面壳。
- Rust 负责本地文件扫描、解析、SQLite 索引、安全写入。
- React + TypeScript + Vite 负责 UI。
- Tailwind + Radix UI + lucide-react 负责界面组件和图标。
- React Query 管理前端对 Tauri command 的数据请求。
- rusqlite 缓存记忆索引、主题、来源、风险标记。
- CodeMirror 用于预览原始片段和 correction note 草稿。
- FlexSearch 用于前端快速搜索。

第一版只面向 macOS，不做跨平台打包、自动更新、云同步或托盘功能。

## 记忆来源

默认读取 `$HOME/.codex/memories`，支持用户在设置中覆盖路径。

第一版扫描这些来源：

- `memory_summary.md`
- `MEMORY.md`
- `raw_memories.md`
- `rollout_summaries/*.md`
- `extensions/ad_hoc/notes/*.md`
- `extensions/chronicle/resources/*.md`
- `skills/*/SKILL.md`

读取策略：

- 只读扫描主记忆文件和历史摘要。
- 记录文件路径、行号、标题、主题、关键词、更新时间。
- 对大文件做增量索引，按 mtime 和文件大小判断是否需要重扫。
- 不读取与 Codex memory 无关的用户文件。

## 安全写入

第一版只允许写入新的 correction note：

`$HOME/.codex/memories/extensions/ad_hoc/notes/<timestamp>-<slug>.md`

不允许直接修改：

- `MEMORY.md`
- `memory_summary.md`
- `raw_memories.md`
- `rollout_summaries/*`
- `extensions/chronicle/resources/*`

写入流程：

1. 用户在 UI 中选择一条记忆或冲突。
2. App 生成 correction note 草稿。
3. 右侧 Inspector 展示草稿、目标路径和影响说明。
4. 用户确认后，Rust 后端用原子写入创建新文件。
5. 写入后重新扫描 ad-hoc notes，并把新 note 标记为 active override。

每次写入必须可预览、可取消、可打开文件位置。

## 主界面

第一版采用 Knowledge Board，而不是纯文件浏览器。

窗口结构：

- 左侧主题导航。
- 中间主题知识板。
- 右侧 Inspector。

主题导航：

- `Profile`：用户画像、技术栈、语言偏好、工作方式。
- `Projects`：BeeBotOS、sub2api、linc vault 等项目记忆。
- `Rules`：明确规则，例如中文输出、工具英文、证据优先、不乱改。
- `Tools`：Codex、Skills、MCP、GitHub、OpenAI 相关工具偏好。
- `Writing`：公众号、长文、知识库写作偏好。
- `Overrides`：人工 correction notes。
- `Sources`：按文件来源查看记忆。
- `Stale Risks`：疑似过时、冲突、未确认的记忆。

中间知识板：

- 主题卡片展示当前结论。
- 每张卡显示置信度、来源数量、最新覆盖 note。
- 对冲突项显示 stale risk 标记。
- 支持搜索、过滤和按更新时间排序。

右侧 Inspector：

- 当前结论。
- 支撑来源。
- 冲突来源。
- 被覆盖来源。
- 原始文件片段。
- `Draft correction note` 操作。
- `Open source file` 操作。

## 典型流程

### 查看当前画像

用户打开 `Profile`，看到当前技术栈为 Python/Rust，同时看到旧记忆里仍有 Java/Spring Boot。

Inspector 显示：

- 当前结论来自最新 ad-hoc note。
- 旧结论来自历史 profile 或 AGENTS.md。
- 建议把旧结论标记为 stale。

### 修正过时项目

用户搜索 `dilidili`。

App 展示所有命中来源，并标记“旧 active project 与最新 override 冲突”。

用户点击 `Draft correction note`，生成：

```md
Memory update request:

- `dilidili` is no longer an active project.
- Do not present it as active unless the user reactivates it later.
```

用户确认后写入 `extensions/ad_hoc/notes/`。

### 追踪回答来源

用户点击某条规则，例如“输出中文，工具交互英文”。

Inspector 展示它来自哪些文件、哪些行、是否被多次重复确认。

## Rust 后端模块

建议模块：

- `memory_paths`：解析默认目录、用户覆盖目录和各类来源路径。
- `scanner`：扫描文件树，提取元数据和 markdown 标题。
- `parser`：解析 Task Group、User preferences、Reusable knowledge、Failures。
- `index`：写入 SQLite 缓存。
- `risk`：识别冲突、过时词、被 override 覆盖的记忆。
- `correction`：生成 correction note 草稿并安全写入。
- `commands`：暴露 Tauri commands 给前端。

第一版 commands：

- `scan_memories()`
- `get_topics()`
- `get_topic_detail(topic_id)`
- `search_memories(query)`
- `get_source_excerpt(source_id)`
- `draft_correction(input)`
- `write_correction(draft)`
- `open_source(path)`

## 数据模型

SQLite 表：

- `memory_sources`：文件路径、类型、mtime、hash、行数。
- `memory_entries`：标题、正文摘要、主题、来源行号、置信度。
- `memory_topics`：主题名、计数、最新更新时间、风险数量。
- `memory_edges`：主题与来源、覆盖、冲突关系。
- `risk_flags`：类型、说明、关联 entry、状态。
- `correction_notes`：路径、创建时间、内容摘要、影响主题。

第一版不需要复杂图数据库，关系边用 SQLite 表即可。

## 风险识别

MVP 只做可解释的规则检测：

- 新 ad-hoc note 与旧 profile 关键词冲突。
- 同一主题出现“active / no longer active”等相反描述。
- 同一技术栈出现旧词和新词，例如 Java/Spring Boot 与 Python/Rust。
- 旧记忆引用的项目长期未更新或已被新的 note 覆盖。

不做自动删除，不做模型推理式重写。

## UI 风格

视觉方向：

- 原生 macOS 工具感为主。
- 借一点 Obsidian 的知识板和来源链路感。
- 信息密度高，但不要像日志查看器。
- 默认浅色，可后续补深色。
- 图标使用 lucide-react。
- 按钮、侧边栏、详情面板保持克制。

第一版避免：

- 复杂可拖拽图谱。
- 营销式首页。
- 大面积渐变和装饰背景。
- 自动化删除或批量重写。

## 验证

Rust：

- 测试路径解析和目录覆盖。
- 测试 markdown section 解析。
- 测试增量扫描。
- 测试 correction note 的原子写入。
- 测试禁止写入主记忆文件。

前端：

- 测试主题导航渲染。
- 测试搜索结果。
- 测试 Inspector 来源展示。
- 测试 correction note 草稿和确认弹窗。

手动验收：

- 能扫描当前 `$HOME/.codex/memories`。
- 能在 `Profile` 中看到 Python/Rust 覆盖 Java/Spring Boot 的冲突。
- 能搜索 `dilidili` 并看到过时风险。
- 能生成一条 ad-hoc correction note。
- 写入后重新扫描并显示新 override。

## 暂不做

- 直接编辑 `MEMORY.md`。
- 删除历史记忆。
- 自动调用 LLM 重写 profile。
- 云同步。
- 多用户账户。
- 跨平台打包。
- 托盘菜单。
- 自动更新。

## 成功标准

第一版完成后，用户不需要问 Codex“你现在记住了什么”，打开 App 就能看到：

- 当前画像。
- 记忆来源。
- 冲突和过时风险。
- 最新人工修正。
- 可安全写入的新 correction note。

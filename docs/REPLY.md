# 信件（项目四）

**产品位置**：底栏「信件」Tab（`mail`）。模块内页面名称统一为 **信件**（不要写成「回信」）。

**产品逻辑**：信件是「写给你的信」的档案，强调被记住、被陪伴、长期情绪连接——不是 AI 功能操作台。

## 用户路径

```
进入信件 → 浏览收到的信 → 点开一封 → 阅读 → 在正文下回复（便利贴样式）
（列表为空且有日记痕迹 → 自动生成一封信）
```

## 1. 页面结构

| 视图 | 职责 |
|------|------|
| **信件列表** | 进入模块即展示；标题「信件」；每封：标题 / 日期 / 预览 |
| **阅读页** | 顶部返回；标题 + 正文；下方用户回复（便利贴）；底部输入「回复」 |

**已移出本模块**

| 能力 | 去向 |
|------|------|
| 陪伴风格 | **设置 → 陪伴风格** |
| 收藏 / 分享 / 喜欢不喜欢 | 暂不展示 |

实现：`src/components/mail/MailModule.tsx`；风格：`SettingsPanel`。

## 2. 组件与代码

```
MailModule
  ├─ list（档案列表；可触发 generate）
  └─ reader（正文 + 便利贴回复 + 底部 composer）

SettingsPanel
  └─ companion-style

lib/replyTypes.ts · replyPrompt.ts · replyLocalStore.ts · replyApi.ts
server/src/llm/* · replyStore.ts
server：POST /api/reply/generate · GET /api/reply/letters
       POST /api/reply/letters/:id/replies · PATCH /api/reply/letters/:id
```

## 3. 数据结构

- **产出** `ReplyLetter`：title、body、createdAt、sourceEntryIds、insight、userReplies、provider
- **本地键**：按用户隔离的 `aimu_reply_letters_v1__u_<id>`、`aimu_reply_style_v1__u_<id>`
- **服务端**：`server/data/reply-letters.json`

## 4. AI（项目四接入点）

- Prompt：客户端 `buildReplyPromptMessages()`；服务端 `server/src/llm/replyPrompt.ts`
- 生成：`POST /api/reply/generate` → `composeReplyLetter`（混元 OpenAI 兼容 / mock 回退）
- 密钥：仅服务器 `LLM_API_KEY`（见 `.env.example`）；COS 前端永不持有
- 风格：设置页 `CompanionStyleId` → 生成请求 `style` 字段

里程碑摘要见 `docs/PROJECT4.md`。

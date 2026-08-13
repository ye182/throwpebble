# 项目四 · 信件（嵌入里程碑）

**定位**：项目四（信件 / 陪伴信）内容**嵌入本仓库（项目二 / Aimu 日记森林）**，不拆独立「项目四」目录或仓库。

**融合方案 A**：底栏并行 Tab；产品顺序固定 **小屋 → 日历 → 信件 → 设置**。勿重排底栏。「信件」是用户可见模块名（勿称「回信」）。

## 已交付

- 信件列表 + 阅读页；正文下用户回复（便利贴）；本地 + 服务端落库
- 陪伴风格在 **设置 → 陪伴风格**（长期偏好）
- 空列表且有日记痕迹时，自动请求生成一封信（「有一封信在路上…」）
- 服务端 `POST /api/reply/generate`：配置 `LLM_API_KEY` 后走 **腾讯混元 OpenAI 兼容接口**；未配置 / 失败则 mock，不阻塞上线
- 用户回复：`POST /api/reply/letters/:id/replies`；列表返回 `userReplies`

## 数据键（勿随意改名）

| 层 | 键 / 资源 | 说明 |
|----|-----------|------|
| 本地信件 | `aimu_reply_letters_v1__u_<userId>` | 登录后按用户隔离；遗留无后缀键可迁入 |
| 本地风格 | `aimu_reply_style_v1__u_<userId>` | 陪伴风格 |
| 归属标记 | `aimu_reply_owner_v1` | 当前本地 blob 归属的 userId |
| 服务端信件 | `server/data/reply-letters.json` | 含 `userReplies`；勿当调试垃圾删用户数据 |
| 生成 | `POST /api/reply/generate` | 需登录；密钥只在服务器 `.env` |
| 历史 | `GET /api/reply/letters` | 含正文与用户回复 |
| 回复 | `POST /api/reply/letters/:id/replies` | 阅读页下方回复落库 |

实现入口：`src/components/mail/`、`src/lib/reply*.ts`、`server/src/llm/`、`server/src/replyStore.ts`。产品说明见 `docs/REPLY.md`。

## 腾讯云与 AI

- **前端 COS**：只放 `dist/`，不放密钥、不跑模型。
- **轻量服务器**：跑 Node；在 `.env` 配置 `LLM_API_KEY`（或 `HUNYUAN_API_KEY`）、可选 `LLM_BASE_URL` / `LLM_MODEL`。
- 默认 Base：`https://api.hunyuan.cloud.tencent.com/v1`，模型：`hunyuan-turbos-latest`。
- 健康检查：`GET /api/health` → `llmConfigured: true|false`（不泄露密钥）。

详见根目录 `DEPLOY.md` 与 `.env.example`。

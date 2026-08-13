# Aimu 日记森林 · 部署准备指南（项目二 + 三 + 四）

本仓库是 **项目二 / Aimu 日记森林**，内嵌 **项目三（日历）** 与 **项目四（信件）**。  
后续目标形态：**本机开发验收 → 轻量云服务器跑后端（含 AI 密钥）→ COS 静态网站 + CDN 放前端 →（产品做完后）买域名并配置 DNS**。

项目一（`桌面/项目一-Aimu花瓣登录`）保持独立，本仓库不依赖它运行。

---

## 角色分工（先记住）

| 组件 | 放什么 | 不放什么 |
|------|--------|----------|
| **本机** | 日常开发与验收 | — |
| **轻量应用服务器** | Node 后端（`/api`、用户数据） | 不必当唯一前端（可用 COS） |
| **COS + 静态网站 + CDN** | 前端构建产物 `dist/` | 不能跑 Express / 不能存登录逻辑 |

没有轻量服务器上的 API，COS 上的登录按钮无法工作。

---

## 阶段 A · 现在（本机）——你当前应做的

1. 安装依赖：`npm install`
2. 复制环境变量：把 `.env.example` 复制为 `.env`（若还没有）
3. 启动：`npm run dev`
4. 浏览器打开：http://127.0.0.1:5173/
5. 测试账号：`111111` / `111111`
6. 验收清单：
   - [ ] 开场动画 / 跳过（粉 splash 为地面，无米色垫底）
   - [ ] 登录、注册、返回开场（键盘 overlay，表单/stage 不跳动不压缩）
   - [ ] 进入日记主页；心情底装饰整组居中、气泡水平不漂移
   - [ ] 刷新后仍保持登录（token）
   - [ ] 探索模式：收藏后原消息仍在下方列表；黄区预览最多 1 条 +「还有 N 条」；点开全屏见全部
   - [ ] 收藏时间紧跟每条消息右下 + 黄线分隔；全屏「← 返回」
   - [ ] 黄区日记全屏：portal 全幅 + 顶部「← 返回」
   - [ ] Android / iOS：系统字号跟随；外壳固定浅色；纸面品牌色可读
- [ ] 信件：有日记痕迹时列表可收到信；点开可读；下方回复刷新后仍在
- [ ] `GET /api/health` 返回 `ok: true`；配密钥后 `llmConfigured: true`

UI 定稿细节见 [docs/UI-CONTRACT.md](./docs/UI-CONTRACT.md)；项目四见 [docs/PROJECT4.md](./docs/PROJECT4.md)。

本机阶段 **不要** 设置 `VITE_API_BASE`（留空，走 Vite 代理）。

可选自检：

```bash
npm run typecheck
npm run build
```

`build` 成功后会有前端 `dist/` 与后端 `server/dist/`。

---

## 阶段 B · 产品做完后 · 本机再验一次

在上传腾讯云之前，再完整走一遍阶段 A 的验收清单，确认无阻塞 bug。

---

## 阶段 C · 腾讯云（建议顺序）

### C1. 轻量应用服务器（后端）

1. 购买/开通轻量服务器，安装 **Node.js ≥ 18**
2. 上传本仓库（或 `git clone`），在服务器上：

```bash
npm install
cp .env.example .env
# 编辑 .env：JWT_SECRET、CLIENT_ORIGIN、NODE_ENV=production、LLM_API_KEY 等
npm run build
NODE_ENV=production npm start
```

3. 安全组放行 API 端口（默认 `8787`）；若调用混元，服务器需能访问公网 `api.hunyuan.cloud.tencent.com`
4. 浏览器或 curl 验证：

`http://<服务器公网IP>:8787/api/health`

应返回 JSON，`ok: true`；配置密钥后另有 `llmConfigured: true`。

生产 `.env` 要点：

- `JWT_SECRET`：足够长的随机串（勿用示例值）
- `CLIENT_ORIGIN`：前端访问来源（CDN 默认域名或以后的 `https://www.xxx.com`）——**须与浏览器地址栏来源一致**，生产 CORS 只放行该值
- `DATA_DIR`：可写目录（默认 `./server/data`）
- `LLM_API_KEY`（或 `HUNYUAN_API_KEY`）：腾讯混元 API Key；不配则信件生成走 mock，其它功能仍可上线
- `LLM_BASE_URL`：默认 `https://api.hunyuan.cloud.tencent.com/v1`
- `LLM_MODEL`：默认 `hunyuan-turbos-latest`

### C2. 本机构建前端（给 COS）

在本机（或 CI）设置后端地址后构建：

**Windows PowerShell 示例（先用 IP 测试）：**

```powershell
$env:VITE_API_BASE="http://<服务器公网IP>:8787"
npm run build:client
```

然后将 **`dist/` 目录内的全部文件** 上传到 COS 桶（不要上传 `node_modules`、`server`、`.env`）。

注意：

- 前端若走 **HTTPS（CDN）**，后端若仍是 **HTTP + IP**，浏览器可能拦截「混合内容」。测试期可先尽量统一协议，或给轻量服务器也配 HTTPS；正式期用域名 + HTTPS 最省心。
- 每次改 `VITE_API_BASE` 后都要 **重新 build** 再上传 COS。

### C3. COS 静态网站 + CDN

1. 创建 COS 桶，开启**静态网站**，索引文档设为 `index.html`
2. 上传 `dist/` 内容
3. 绑定 **CDN 加速**，用 CDN 默认域名先做外网访问测试
4. 用手机/另一台电脑打开 CDN 地址，走登录流程

### C4. 买域名之后（产品定稿）

1. 在腾讯云注册/购买 **一个** 域名即可  
2. DNS 建议：
   - `www`（或根域）→ CDN（前端）
   - `api` → 轻量服务器（后端）
3. 为 www、api 配置 HTTPS 证书  
4. 重新构建前端：

```powershell
$env:VITE_API_BASE="https://api.你的域名.com"
npm run build:client
```

5. 再上传 COS；服务器 `.env` 中 `CLIENT_ORIGIN=https://www.你的域名.com`（或你的前端域名），重启后端。

---

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | 本机前后端一起开发 |
| `npm run typecheck` | 类型检查 |
| `npm run build` | 构建前端 + 后端 |
| `npm run build:client` | 只构建前端 → `dist/`（上传 COS） |
| `npm run build:server` | 只构建后端 → `server/dist/` |
| `npm start` | 生产启动后端（需已 build；有 `dist/` 时还可顺带托管静态，但 COS 方案下前端以 COS 为准） |

---

## 不要上传到 COS 的内容

- `.env`、任何密钥
- `server/`、`server/data/users.json`
- `node_modules/`
- 调试日志、`.cursor/` 缓存

---

## 项目四 · 信件 AI（与 COS 不冲突）

- **COS / CDN**：只放前端 `dist/`，**不能**跑 AI，**不要**把 `LLM_API_KEY` 写进前端环境变量。
- **轻量服务器**：`POST /api/reply/generate` 在 Node 内调用混元 OpenAI 兼容接口（`server/src/llm/`）；失败自动 mock，部署不硬失败。
- 验收：登录 → 小屋写几笔 → 打开「信件」→ 应出现信件（配密钥后为模型正文）→ 阅读页回复后返回再进仍在。
- 探索模式评论 mock（`src/lib/diaryApi.ts`）与信件 LLM 独立；以后可同样迁到服务端，**不必换掉 COS 部署方式**。

---

## 项目一

桌面路径：`项目一-Aimu花瓣登录`。  
与项目二独立；上云、改配置只在本仓库（项目二）进行即可。建议保留项目一目录作为备份，勿与 COS 桶混用。

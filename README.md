# ThrowPebble

开场「抛石入水」动画 + 日记小屋 + 日历墙 + 信件。可本机开发，也可部署到 GitHub Pages / 腾讯云。

## 本机运行

```bash
npm install
cp .env.example .env   # Windows 可手动复制
npm run dev
```

浏览器打开：http://127.0.0.1:5173/  
测试账号：`111111` / `111111`

## 构建

```bash
npm run typecheck
npm run build
```

产物：前端 `dist/`，后端 `server/dist/`。

## 腾讯云部署（摘要）

详见 [DEPLOY.md](./DEPLOY.md)。

1. **轻量服务器**：上传本仓库（不含 `node_modules`）→ `npm install` → 配置 `.env`（`JWT_SECRET`、`CLIENT_ORIGIN`、`NODE_ENV=production`）→ `npm run build` → `npm start`
2. **COS 静态站（可选）**：构建时设置 `VITE_API_BASE=http://你的服务器IP:8787`，上传 `dist/` 到 COS
3. 安全组放行 API 端口（默认 `8787`）

本仓库已清理旧开场资源、调试日志与无用备份；请勿提交真实 `.env`。

import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { UserStore } from "./db.js";
import { DiaryStore } from "./diaryStore.js";
import { ReplyStore } from "./replyStore.js";
import {
  hashPassword,
  signToken,
  toPublicUser,
  verifyPassword,
  verifyToken,
} from "./auth.js";
import { isLlmConfigured, type LlmConfig } from "./llm/config.js";
import { composeReplyLetter } from "./llm/composeReplyLetter.js";

export type AppConfig = {
  jwtSecret: string;
  jwtExpiresIn: string;
  clientOrigin: string;
  dataDir: string;
  /** Absolute path to Vite `client/dist`. Omit / missing → API-only mode. */
  clientDist?: string;
  isProd?: boolean;
  /** 项目四信件 LLM（腾讯混元 OpenAI 兼容等）；缺省则 mock。 */
  llm?: LlmConfig;
};

const credentialsSchema = z.object({
  contact: z.string().trim().min(1, "请输入手机 / 邮箱").max(80, "手机 / 邮箱过长"),
  password: z.string().min(6, "密码至少 6 位").max(72, "密码过长"),
});

function getBearer(req: express.Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

/**
 * Build the Express app for 项目二 / Aimu 日记森林.
 * Auth + health API; production CORS locked to CLIENT_ORIGIN (COS/CDN frontend).
 */
const diaryEntrySchema = z.object({
  mood: z.string().trim().min(1).max(40),
  moodId: z.string().trim().max(40).optional(),
  moodIcon: z.string().trim().max(500).optional(),
  body: z.string().trim().max(8000).default(""),
  images: z.array(z.string().min(1).max(2_500_000)).max(3).optional(),
  dateKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateKey 无效"),
  visibilityMode: z.enum(["private", "explore"]).default("private"),
  id: z.string().trim().min(1).max(80).optional(),
  createdAt: z.string().trim().min(1).max(40).optional(),
}).refine((v) => v.body.trim().length > 0 || (v.images?.length ?? 0) > 0, {
  message: "请至少写下文字或上传一张图片",
});

export function createApp(config: AppConfig) {
  const store = new UserStore(config.dataDir);
  const diaryStore = new DiaryStore(config.dataDir);
  const replyStore = new ReplyStore(config.dataDir);
  const app = express();
  const servingStatic = Boolean(config.clientDist && fs.existsSync(config.clientDist));
  const isProd = config.isProd ?? servingStatic;

  const corsOrigins = isProd
    ? [config.clientOrigin]
    : [config.clientOrigin, "http://localhost:5173", "http://127.0.0.1:5173"];

  function requireUser(
    req: express.Request,
    res: express.Response
  ): { id: string } | null {
    const token = getBearer(req);
    if (!token) {
      res.status(401).json({ ok: false, message: "未登录" });
      return null;
    }
    try {
      const payload = verifyToken(token, config.jwtSecret);
      const user = store.findById(payload.sub);
      if (!user) {
        res.status(401).json({ ok: false, message: "用户不存在或已失效" });
        return null;
      }
      return { id: user.id };
    } catch {
      res.status(401).json({ ok: false, message: "登录已过期，请重新登录" });
      return null;
    }
  }

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );
  /* Diary may attach up to 3 compressed image data-URLs. */
  app.use(express.json({ limit: "8mb" }));

  const llm = config.llm ?? {
    apiKey: "",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    model: "hunyuan-turbos-latest",
    timeoutMs: 45000,
  };

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "aimu-diary-forest",
      module: "fusion-p2-p3-p4",
      llmConfigured: isLlmConfigured(llm),
      role: "entry-shell-auth-plus-diary",
      time: new Date().toISOString(),
      fusion: {
        tokenKey: "aimu_p01_token",
        phases: ["boot", "intro", "auth", "diary"],
        diaryMount: "src/DiaryApp.tsx",
        apiPrefix: "/api",
      },
    });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          ok: false,
          message: parsed.error.issues[0]?.message || "参数无效",
        });
        return;
      }

      const { contact, password } = parsed.data;
      if (store.findByContact(contact)) {
        res.status(409).json({ ok: false, message: "该手机 / 邮箱已被注册" });
        return;
      }

      const passwordHash = await hashPassword(password);
      const user = store.create({
        nickname: contact,
        passwordHash,
        contact,
      });
      const token = signToken(
        { sub: user.id, nickname: user.nickname },
        config.jwtSecret,
        config.jwtExpiresIn
      );

      res.status(201).json({
        ok: true,
        message: "注册成功",
        data: { token, user: toPublicUser(user) },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, message: "服务器错误" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          ok: false,
          message: parsed.error.issues[0]?.message || "参数无效",
        });
        return;
      }

      const { contact, password } = parsed.data;
      const user = store.findByContact(contact);
      if (!user) {
        res.status(401).json({ ok: false, message: "手机 / 邮箱或密码错误" });
        return;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ ok: false, message: "手机 / 邮箱或密码错误" });
        return;
      }

      const token = signToken(
        { sub: user.id, nickname: user.nickname },
        config.jwtSecret,
        config.jwtExpiresIn
      );

      res.json({
        ok: true,
        message: "登录成功",
        data: { token, user: toPublicUser(user) },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, message: "服务器错误" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    try {
      const token = getBearer(req);
      if (!token) {
        res.status(401).json({ ok: false, message: "未登录" });
        return;
      }
      const payload = verifyToken(token, config.jwtSecret);
      const user = store.findById(payload.sub);
      if (!user) {
        res.status(401).json({ ok: false, message: "用户不存在或已失效" });
        return;
      }
      res.json({ ok: true, data: { user: toPublicUser(user) } });
    } catch {
      res.status(401).json({ ok: false, message: "登录已过期，请重新登录" });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.json({ ok: true, message: "已退出登录" });
  });

  /** List diary entries for the logged-in user (calendar sync across devices). */
  app.get("/api/diary/entries", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const entries = diaryStore.listByUser(user.id).map((e) => ({
      id: e.id,
      mood: e.mood,
      moodId: e.moodId,
      moodIcon: e.moodIcon,
      body: e.body,
      images: e.images,
      dateKey: e.dateKey,
      visibilityMode: e.visibilityMode,
      createdAt: e.createdAt,
    }));
    res.json({ ok: true, data: { entries } });
  });

  /** Persist a diary entry so other devices (same account) can sync to calendar. */
  app.post("/api/diary/entries", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const parsed = diaryEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message || "参数无效",
      });
      return;
    }
    const entry = diaryStore.create({
      userId: user.id,
      mood: parsed.data.mood,
      moodId: parsed.data.moodId,
      moodIcon: parsed.data.moodIcon,
      body: parsed.data.body,
      images: parsed.data.images,
      dateKey: parsed.data.dateKey,
      visibilityMode: parsed.data.visibilityMode,
      id: parsed.data.id,
      createdAt: parsed.data.createdAt,
    });
    res.status(201).json({
      ok: true,
      message: "保存成功",
      data: {
        id: entry.id,
        mood: entry.mood,
        moodId: entry.moodId,
        moodIcon: entry.moodIcon,
        body: entry.body,
        images: entry.images,
        dateKey: entry.dateKey,
        visibilityMode: entry.visibilityMode,
        createdAt: entry.createdAt,
      },
    });
  });

  /** Remove a diary entry for the logged-in user (calendar swipe delete). */
  app.delete("/api/diary/entries/:entryId", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const entryId =
      typeof req.params.entryId === "string" ? req.params.entryId.trim() : "";
    if (!entryId) {
      res.status(400).json({ ok: false, message: "entryId 无效" });
      return;
    }
    const removed = diaryStore.delete(user.id, entryId);
    if (!removed) {
      res.status(404).json({ ok: false, message: "记录不存在" });
      return;
    }
    res.json({ ok: true, message: "已删除" });
  });

  const replyGenerateSchema = z.object({
    records: z
      .array(
        z.object({
          entryId: z.string().min(1).max(80),
          dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          createdAt: z.string().min(1).max(40),
          mood: z.string().min(1).max(40),
          body: z.string().min(1).max(8000),
          events: z.array(z.string()).optional(),
          thoughts: z.array(z.string()).optional(),
        })
      )
      .min(1)
      .max(8),
    style: z
      .enum([
        "warm_friend",
        "gentle_quiet",
        "playful_light",
        "steady_ground",
      ])
      .default("warm_friend"),
    memory: z
      .object({
        preferredStyle: z
          .enum([
            "warm_friend",
            "gentle_quiet",
            "playful_light",
            "steady_ground",
          ])
          .optional(),
        notes: z.array(z.string()).optional(),
        summaryHints: z.array(z.string()).optional(),
      })
      .optional(),
    locale: z.string().max(16).optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  });

  /**
   * 项目四「信件」生成 — LLM（混元 OpenAI 兼容）优先，失败/未配置则 mock。
   * 密钥只在轻量服务器 .env，永不进 COS 前端。
   */
  app.post("/api/reply/generate", async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const parsed = replyGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message || "参数无效",
      });
      return;
    }
    const records = parsed.data.records.slice(0, 5);
    const composed = await composeReplyLetter({
      llm,
      style: parsed.data.style,
      records,
      notes: parsed.data.memory?.notes,
      summaryHints: parsed.data.memory?.summaryHints,
    });
    const letter = replyStore.create({
      userId: user.id,
      body: composed.body,
      title: composed.title,
      style: parsed.data.style,
      sourceEntryIds: records.map((r) => r.entryId),
      insight: composed.insight,
      provider: composed.provider,
      modelHint: composed.modelHint,
    });
    res.status(201).json({
      ok: true,
      data: {
        phase: "ready",
        warning: composed.warning,
        letter: {
          id: letter.id,
          createdAt: letter.createdAt,
          body: letter.body,
          title: letter.title,
          style: letter.style,
          sourceEntryIds: letter.sourceEntryIds,
          insight: letter.insight,
          starred: letter.starred,
          feedback: letter.feedback,
          userReplies: letter.userReplies ?? [],
          provider: letter.provider,
          modelHint: letter.modelHint,
        },
      },
    });
  });

  app.get("/api/reply/letters", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    res.json({
      ok: true,
      data: {
        letters: replyStore.listByUser(user.id).map((letter) => ({
          id: letter.id,
          createdAt: letter.createdAt,
          body: letter.body,
          title: letter.title,
          style: letter.style,
          sourceEntryIds: letter.sourceEntryIds,
          insight: letter.insight,
          starred: letter.starred,
          feedback: letter.feedback,
          userReplies: letter.userReplies ?? [],
          provider: letter.provider,
          modelHint: letter.modelHint,
        })),
      },
    });
  });

  app.patch("/api/reply/letters/:id", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    const patchSchema = z.object({
      starred: z.boolean().optional(),
      feedback: z.enum(["like", "dislike"]).nullable().optional(),
    });
    const parsed = patchSchema.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ ok: false, message: "参数无效" });
      return;
    }
    const letter = replyStore.patch(user.id, id, parsed.data);
    if (!letter) {
      res.status(404).json({ ok: false, message: "信件不存在" });
      return;
    }
    res.json({ ok: true, data: { letter } });
  });

  /** Delete an entire letter. */
  app.delete("/api/reply/letters/:id", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      res.status(400).json({ ok: false, message: "参数无效" });
      return;
    }
    const ok = replyStore.removeLetter(user.id, id);
    if (!ok) {
      res.status(404).json({ ok: false, message: "信件不存在" });
      return;
    }
    res.json({ ok: true, message: "已删除" });
  });

  /** Append a user reply under a letter (persisted). */
  app.post("/api/reply/letters/:id/replies", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    const parsed = z
      .object({ body: z.string().trim().min(1).max(4000) })
      .safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ ok: false, message: "参数无效" });
      return;
    }
    const letter = replyStore.appendUserReply(user.id, id, parsed.data.body);
    if (!letter) {
      res.status(404).json({ ok: false, message: "信件不存在" });
      return;
    }
    res.status(201).json({
      ok: true,
      data: {
        letter: {
          id: letter.id,
          createdAt: letter.createdAt,
          body: letter.body,
          title: letter.title,
          style: letter.style,
          sourceEntryIds: letter.sourceEntryIds,
          insight: letter.insight,
          starred: letter.starred,
          feedback: letter.feedback,
          userReplies: letter.userReplies ?? [],
          provider: letter.provider,
          modelHint: letter.modelHint,
        },
      },
    });
  });

  /** Remove one sticky reply under a letter. */
  app.delete("/api/reply/letters/:id/replies/:replyId", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    const replyId =
      typeof req.params.replyId === "string" ? req.params.replyId.trim() : "";
    if (!id || !replyId) {
      res.status(400).json({ ok: false, message: "参数无效" });
      return;
    }
    const letter = replyStore.removeUserReply(user.id, id, replyId);
    if (!letter) {
      res.status(404).json({ ok: false, message: "信件不存在" });
      return;
    }
    res.json({
      ok: true,
      data: {
        letter: {
          id: letter.id,
          createdAt: letter.createdAt,
          body: letter.body,
          title: letter.title,
          style: letter.style,
          sourceEntryIds: letter.sourceEntryIds,
          insight: letter.insight,
          starred: letter.starred,
          feedback: letter.feedback,
          userReplies: letter.userReplies ?? [],
          provider: letter.provider,
          modelHint: letter.modelHint,
        },
      },
    });
  });

  // Static SPA last: never shadow /api/*
  if (servingStatic && config.clientDist) {
    const clientDist = config.clientDist;
    app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({ ok: false, message: "服务器错误" });
    }
  );

  return { app, store, servingStatic };
}

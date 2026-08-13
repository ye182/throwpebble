import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createApp } from "./createApp.js";
import { loadLlmConfigFromEnv, isLlmConfigured } from "./llm/config.js";
import { ensureTestUser, TEST_CONTACT } from "./seedTestUser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(projectRoot, ".env") });

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://127.0.0.1:5173";
const DATA_DIR = path.resolve(
  projectRoot,
  process.env.DATA_DIR || "./server/data"
);
const clientDist = path.join(projectRoot, "dist");
const hasClientDist = fs.existsSync(clientDist);
const llm = loadLlmConfigFromEnv();

const { app, store, servingStatic } = createApp({
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: JWT_EXPIRES_IN,
  clientOrigin: CLIENT_ORIGIN,
  dataDir: DATA_DIR,
  clientDist,
  isProd: process.env.NODE_ENV === "production" || hasClientDist,
  llm,
});

const seedResult = await ensureTestUser(store);

app.listen(PORT, HOST, () => {
  console.log(`[aimu-fusion] API listening on http://${HOST}:${PORT}`);
  console.log(`[aimu-fusion] data dir: ${DATA_DIR}`);
  console.log(
    `[aimu-fusion] test login ready (${seedResult}): ${TEST_CONTACT} / ${TEST_CONTACT}`
  );
  console.log(
    `[aimu-fusion] letter LLM: ${
      isLlmConfigured(llm) ? `on (${llm.model})` : "off (mock)"
    }`
  );
  if (servingStatic) {
    console.log(`[aimu-fusion] serving client from ${clientDist}`);
  } else {
    console.log(
      "[aimu-fusion] client dist not found — run npm run build for production static hosting"
    );
  }
});

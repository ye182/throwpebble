import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Rewrite absolute /assets/... in CSS so GitHub Pages subpath works. */
function rewritePublicAssetUrls(base: string): Plugin {
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return {
    name: "rewrite-public-asset-urls",
    transform(code, id) {
      if (!/\.css($|\?)/.test(id)) return null;
      const next = code.replace(
        /url\(\s*(['"]?)\/assets\//g,
        `url($1${normalized}assets/`
      );
      return next === code ? null : next;
    },
  };
}

const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  plugins: [react(), rewritePublicAssetUrls(base)],
  server: {
    // 0.0.0.0 so phones on the same Wi‑Fi can open http://<LAN-IP>:5173/
    host: true,
    port: 5173,
    headers: {
      "Cache-Control": "no-store",
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

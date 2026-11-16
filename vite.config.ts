import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const guideFiles = [
  "index.html",
  "DOMAIN_SETUP.html",
  "CUSTOM_DOMAIN_CONNECTION.html",
  "AUTOMATIC_LINK_GENERATION.html",
  "DNS_CONFIGURATION.html",
  "DOMAIN_TROUBLESHOOTING.html",
  "SEO_LINK_CONFIGURATION.html",
];
const guideAssets = ["docs.css", "docs.js"];
const allowedGuidePaths = new Set([
  ...guideFiles,
  ...guideAssets.map((file) => `assets/${file}`),
]);

function domainGuidesPlugin(): Plugin {
  return {
    name: "adometa-domain-guides",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let pathname: string;
        try {
          pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        } catch {
          return next();
        }
        if (!pathname.startsWith("/domain-guides/")) return next();
        const relativePath = pathname.slice("/domain-guides/".length) || "index.html";
        if (!allowedGuidePaths.has(relativePath)) return next();
        const source = relativePath.startsWith("assets/")
          ? resolve(projectRoot, "docs", "assets", relativePath.slice("assets/".length))
          : resolve(projectRoot, "docs", relativePath);
        void readFile(source).then((content) => {
          response.setHeader("Content-Type", relativePath.endsWith(".css")
            ? "text/css; charset=utf-8"
            : relativePath.endsWith(".js")
              ? "text/javascript; charset=utf-8"
              : "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(content);
        }).catch(next);
      });
    },
    async writeBundle(options: { dir?: string }) {
      if (!options.dir) return;
      const outputDirectory = resolve(projectRoot, options.dir);
      const guideOutput = resolve(outputDirectory, "domain-guides");
      const assetsOutput = resolve(guideOutput, "assets");
      await mkdir(assetsOutput, { recursive: true });
      await Promise.all([
        ...guideFiles.map((file) => copyFile(resolve(projectRoot, "docs", file), resolve(guideOutput, file))),
        ...guideAssets.map((file) => copyFile(resolve(projectRoot, "docs", "assets", file), resolve(assetsOutput, file))),
      ]);
    },
  };
}

export default defineConfig({
  plugins: [react(), domainGuidesPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});

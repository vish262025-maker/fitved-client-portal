import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".txt": "text/plain",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json",
};

const CLEAN_URL_MAP: Record<string, string> = {
  "/personal-training": "personal-training.html",
  "/weight-loss-program-bangalore": "weight-loss-program-bangalore.html",
  "/strength-training-bangalore": "strength-training-bangalore.html",
  "/yoga-classes-bangalore": "yoga-classes-bangalore.html",
  "/prenatal-postnatal-yoga": "prenatal-postnatal-yoga-bangalore.html",
  "/womens-fitness-bangalore": "womens-fitness-bangalore.html",
  "/senior-fitness-bangalore": "senior-fitness-bangalore.html",
  "/clinical-fitness-bangalore": "clinical-fitness-bangalore.html",
  "/diet-coaching-bangalore": "diet-coaching-bangalore.html",
  "/online-training": "online-training.html",
  "/service-areas": "service-areas.html",
  "/faqs": "faqs.html",
  "/corporate": "corporate.html",
};

function serveCleanUrls(publicDir: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = decodeURIComponent((req.url || "").split("?")[0]);

    // Hardcoded marketing pages
    const targetFile = CLEAN_URL_MAP[url];
    if (targetFile) {
      const file = path.join(publicDir, targetFile);
      if (fs.existsSync(file)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(fs.readFileSync(file));
        return;
      }
    }

    // Dynamic: any path under /blog/ that maps to a .html file in public/blog/
    if (url.startsWith("/blog")) {
      const clean = url.endsWith("/") ? url + "index" : url;
      const file = path.join(publicDir, clean + ".html");
      if (fs.existsSync(file)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(fs.readFileSync(file));
        return;
      }
      // Also try exact path as directory with index.html
      const dirIndex = path.join(publicDir, url, "index.html");
      if (fs.existsSync(dirIndex)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(fs.readFileSync(dirIndex));
        return;
      }
    }

    next();
  };
}

// Serve the embedded static "Society Poll" sub-site (a Next.js static export
// living in public/societies) for /societies/*
function serveSocieties(rootDir: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = decodeURIComponent((req.url || "").split("?")[0]);
    if (url !== "/societies" && !url.startsWith("/societies/")) return next();

    let rel = url.replace(/^\/societies/, "");
    let file = path.join(rootDir, rel);
    try {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, "index.html");
      }
      if (!fs.existsSync(file)) return next();
      res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.end(fs.readFileSync(file));
    } catch {
      next();
    }
  };
}

// 301 redirects for migrated blog slugs (mirrors vercel.json redirects in dev)
function serveBlogRedirects(): Connect.NextHandleFunction {
  let redirectMap: Record<string, string> | null = null;
  return (req, res, next) => {
    const url = decodeURIComponent((req.url || "").split("?")[0]);
    const match = url.match(/^\/blog\/(article|recipe|compare)\/(.+?)$/);
    if (!match) return next();

    if (!redirectMap) {
      try {
        redirectMap = JSON.parse(
          fs.readFileSync(path.resolve(__dirname, "src/data/blog/slugRedirects.json"), "utf8")
        );
      } catch { redirectMap = {}; }
    }

    const [, routeType, slug] = match;
    const newSlug = redirectMap![slug];
    if (newSlug && newSlug !== slug) {
      res.writeHead(301, { Location: `/blog/${routeType}/${newSlug}` });
      res.end();
      return;
    }
    next();
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: "serve-clean-urls",
      configureServer(server) {
        server.middlewares.use(serveBlogRedirects());
        server.middlewares.use(serveCleanUrls(path.resolve(__dirname, "public")));
        server.middlewares.use(serveSocieties(path.resolve(__dirname, "public/societies")));
      },
      configurePreviewServer(server) {
        server.middlewares.use(serveBlogRedirects());
        server.middlewares.use(serveCleanUrls(path.resolve(__dirname, "dist")));
        server.middlewares.use(serveSocieties(path.resolve(__dirname, "dist/societies")));
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));

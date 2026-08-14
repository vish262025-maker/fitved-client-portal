import { useEffect } from "react";

/**
 * Dependency-free document <head> manager for blog routes.
 *
 * This is a client-rendered SPA, so per-route <title>, meta, Open Graph,
 * Twitter and canonical tags are set imperatively on mount and restored on
 * unmount. JSON-LD blocks are injected as <script type="application/ld+json">
 * and removed on unmount. No react-helmet dependency (keeps the bundle lean
 * and honours the "no new frameworks" constraint).
 */

export interface BlogSeoProps {
  title: string;
  description?: string;
  canonical?: string;
  image?: string;
  keywords?: string[];
  type?: "article" | "website";
  publishedTime?: string;
  modifiedTime?: string;
  /** When true, injects <meta name="robots" content="noindex, follow">. */
  noindex?: boolean;
  /** Any number of JSON-LD objects to inject (Article, Breadcrumb, FAQ, …). */
  jsonLd?: Array<Record<string, unknown> | null | undefined>;
}

const MANAGED_ATTR = "data-blog-seo";

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED_ATTR, "1");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const created = !el;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  const prev = el.getAttribute("href");
  el.setAttribute("href", href);
  return { el, created, prev };
}

export function BlogSeo({
  title,
  description,
  canonical,
  image,
  keywords,
  type = "article",
  publishedTime,
  modifiedTime,
  noindex,
  jsonLd,
}: BlogSeoProps) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const managed: HTMLElement[] = [];
    const set = (attr: "name" | "property", key: string, content?: string) => {
      if (!content) return;
      const sel = `meta[${attr}="${key}"]`;
      const el = upsertMeta(sel, attr, key, content);
      if (el.getAttribute(MANAGED_ATTR) === "1") managed.push(el);
    };

    if (noindex) {
      set("name", "robots", "noindex, follow");
    }

    set("name", "description", description);
    if (keywords?.length) set("name", "keywords", keywords.join(", "));

    // Open Graph
    set("property", "og:title", title);
    set("property", "og:description", description);
    set("property", "og:type", type);
    if (canonical) set("property", "og:url", canonical);
    if (image) set("property", "og:image", image);

    // Twitter
    set("name", "twitter:card", "summary_large_image");
    set("name", "twitter:title", title);
    set("name", "twitter:description", description);
    if (image) set("name", "twitter:image", image);

    // Article timing
    if (type === "article") {
      set("property", "article:published_time", publishedTime);
      set("property", "article:modified_time", modifiedTime);
    }

    // Canonical (restore previous on unmount rather than deleting the site default)
    let canon: ReturnType<typeof upsertCanonical> | null = null;
    if (canonical) canon = upsertCanonical(canonical);

    // JSON-LD
    const scripts: HTMLScriptElement[] = [];
    (jsonLd || []).filter(Boolean).forEach((obj) => {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute(MANAGED_ATTR, "1");
      s.textContent = JSON.stringify(obj);
      document.head.appendChild(s);
      scripts.push(s);
    });

    return () => {
      document.title = prevTitle;
      managed.forEach((el) => el.parentNode && el.parentNode.removeChild(el));
      scripts.forEach((s) => s.parentNode && s.parentNode.removeChild(s));
      if (canon) {
        if (canon.created) {
          canon.el.parentNode && canon.el.parentNode.removeChild(canon.el);
        } else if (canon.prev) {
          canon.el.setAttribute("href", canon.prev);
        }
      }
    };
  }, [title, description, canonical, image, keywords?.join(","), type, publishedTime, modifiedTime, JSON.stringify(jsonLd)]);

  return null;
}

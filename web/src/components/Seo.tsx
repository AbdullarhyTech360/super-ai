import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  fallbackSeo,
  seoByPath,
  type RouteSeo,
} from "@/seo/routes";

interface SeoProps {
  path?: string;
  overrides?: Partial<RouteSeo>;
  jsonLd?: object[];
}

const toAbsolute = (url?: string) =>
  url && url.startsWith("http") ? url : `/${url ?? ""}`.replace(/^\/\//, "/");

const upsertMeta = (attr: "name" | "property" | "http-equiv", name: string, content: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${name}"]`
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

const upsertLink = (rel: string, href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

const Seo = ({ path, overrides, jsonLd }: SeoProps) => {
  const location = useLocation();
  const key = path ?? location.pathname;
  const seo: RouteSeo = { ...(seoByPath[key] ?? fallbackSeo), ...overrides };
  const canonical = toAbsolute(seo.canonical);
  const ogImage = toAbsolute(DEFAULT_OG_IMAGE);

  useEffect(() => {
    document.title = seo.title;
    upsertMeta("name", "description", seo.description);
    upsertMeta("name", "robots", seo.index ? "index, follow" : "noindex, nofollow");
    upsertMeta("property", "og:title", seo.title);
    upsertMeta("property", "og:description", seo.description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:type", seo.ogType ?? "website");
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:image:alt", SITE_NAME);
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", seo.title);
    upsertMeta("name", "twitter:description", seo.description);
    upsertMeta("name", "twitter:image", ogImage);
    upsertLink("canonical", canonical);
  }, [seo.title, seo.description, seo.index, canonical, ogImage, seo.ogType]);

  useEffect(() => {
    if (!jsonLd || jsonLd.length === 0) return;
    const prev = document.head.querySelector("#seo-jsonld");
    if (prev) prev.remove();
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "seo-jsonld";
    script.textContent = JSON.stringify(
      jsonLd.length === 1 ? jsonLd[0] : jsonLd.map((item) => ({ "@context": "https://schema.org", ...item }))
    );
    document.head.appendChild(script);
  }, [jsonLd]);

  return null;
};

export default Seo;
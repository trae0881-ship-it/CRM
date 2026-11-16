import applicationRoutes from "../../shared/application-routes.json";
import { supabase } from "./supabase";

export type ApplicationRoute = {
  name: string;
  route: string;
  group: string;
  type: string;
  visibility: string;
  status: string;
  indexable: boolean;
  api?: boolean;
  supabaseCallback?: boolean;
  method?: string;
  description: string;
};

export type PublicDomainConfig = {
  canonicalHostname: string;
  activeHostnames: string[];
  redirectHttps: boolean;
  redirectMode: "none" | "www_to_root" | "root_to_www";
};

export const applicationRouteRegistry = applicationRoutes as ApplicationRoute[];

let domainConfigRequest: Promise<PublicDomainConfig | null> | null = null;

function isLocalDevelopmentHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function getPublicDomainConfig(): Promise<PublicDomainConfig | null> {
  if (!supabase) return null;
  if (!domainConfigRequest) {
    domainConfigRequest = Promise.resolve(supabase.rpc("get_public_platform_domain_config"))
      .then(({ data, error }) => {
        if (error) throw new Error("Canonical domain configuration could not be loaded.");
        if (!data || typeof data.canonicalHostname !== "string" || !data.canonicalHostname) return null;
        return {
          canonicalHostname: data.canonicalHostname,
          activeHostnames: Array.isArray(data.activeHostnames) ? data.activeHostnames.filter((host: unknown): host is string => typeof host === "string") : [],
          redirectHttps: data.redirectHttps === true,
          redirectMode: data.redirectMode === "www_to_root" || data.redirectMode === "root_to_www" ? data.redirectMode : "none",
        };
      })
      .catch((error: unknown) => {
        domainConfigRequest = null;
        throw error;
      });
  }
  return domainConfigRequest;
}

export function resetPublicDomainConfigCache() {
  domainConfigRequest = null;
}

export async function getCanonicalOrigin(): Promise<string> {
  const currentOrigin = window.location.origin;
  if (isLocalDevelopmentHost(window.location.hostname)) return currentOrigin;
  try {
    const config = await getPublicDomainConfig();
    return config?.canonicalHostname ? `https://${config.canonicalHostname}` : currentOrigin;
  } catch {
    console.warn("Canonical domain settings are unavailable; using the current origin.");
    return currentOrigin;
  }
}

export async function getAppUrl(route: string): Promise<string> {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const origin = await getCanonicalOrigin();
  const target = new URL(normalizedRoute, origin);
  if (target.origin !== origin) throw new Error("Application URLs must remain on the configured application origin.");
  return target.toString();
}

export async function redirectToCanonicalDomain(): Promise<boolean> {
  if (isLocalDevelopmentHost(window.location.hostname)) return false;
  const config = await getPublicDomainConfig();
  if (!config || !config.activeHostnames.includes(window.location.hostname.toLowerCase())) return false;
  const needsHttps = config.redirectHttps && window.location.protocol !== "https:";
  const needsHostRedirect = config.redirectMode !== "none" && window.location.hostname.toLowerCase() !== config.canonicalHostname;
  if (!needsHttps && !needsHostRedirect) return false;
  const url = new URL(`${window.location.pathname}${window.location.search}${window.location.hash}`, `https://${config.canonicalHostname}`);
  window.location.replace(url.toString());
  return true;
}

const publicPageMetadata: Record<string, { title: string; description: string }> = {
  "/": { title: "Adometa CRM | Organized sales growth", description: "Capture leads, organize follow-ups, and keep every sales conversation moving in one focused workspace." },
  "/features": { title: "Features | Adometa CRM", description: "Explore Adometa CRM tools for lead management, follow-ups, teams, and sales operations." },
  "/pricing": { title: "Pricing | Adometa CRM", description: "Review Adometa CRM plans for growing sales teams." },
  "/about": { title: "About Adometa CRM", description: "Learn about Adometa's focused sales workspace for growing teams." },
  "/contact": { title: "Contact | Adometa CRM", description: "Contact Adometa about your sales workflow." },
};

function setMeta(selector: string, value: string) {
  const element = document.querySelector<HTMLMetaElement>(selector);
  if (element) element.content = value;
}

export async function applyRouteMetadata(path: string, isAuthenticated: boolean) {
  const metadata = publicPageMetadata[path];
  const route = applicationRouteRegistry.find((item) => item.route === path);
  const isPublicIndexable = Boolean(metadata && route?.indexable && !isAuthenticated);
  const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (robots) robots.content = isPublicIndexable ? "index,follow" : "noindex,nofollow";
  if (!isPublicIndexable) {
    document.querySelector('link[rel="canonical"]')?.remove();
    document.getElementById("adometa-structured-data")?.remove();
    return;
  }
  const canonical = await getAppUrl(path);
  let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement("link");
    canonicalLink.rel = "canonical";
    document.head.append(canonicalLink);
  }
  canonicalLink.href = canonical;
  document.title = metadata.title;
  setMeta('meta[name="description"]', metadata.description);
  setMeta('meta[property="og:title"]', metadata.title);
  setMeta('meta[property="og:description"]', metadata.description);
  setMeta('meta[property="og:url"]', canonical);
  setMeta('meta[name="twitter:title"]', metadata.title);
  setMeta('meta[name="twitter:description"]', metadata.description);
  const prior = document.getElementById("adometa-structured-data");
  prior?.remove();
  const structuredData = document.createElement("script");
  structuredData.id = "adometa-structured-data";
  structuredData.type = "application/ld+json";
  structuredData.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "Adometa CRM", url: canonical });
  document.head.append(structuredData);
}

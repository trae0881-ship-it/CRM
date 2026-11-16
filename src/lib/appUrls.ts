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
  canonicalHostname: string | null;
  activeHostnames: string[];
  organizationHostnames: Record<string, string>;
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
        if (!data || (typeof data.canonicalHostname !== "string" && data.canonicalHostname !== undefined && data.canonicalHostname !== null)) return null;
        const organizationHostnames = data.organizationHostnames && typeof data.organizationHostnames === "object"
          ? Object.fromEntries(Object.entries(data.organizationHostnames).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
          : {};
        if (!data.canonicalHostname && Object.keys(organizationHostnames).length === 0) return null;
        return {
          canonicalHostname: data.canonicalHostname || null,
          activeHostnames: Array.isArray(data.activeHostnames) ? data.activeHostnames.filter((host: unknown): host is string => typeof host === "string") : [],
          organizationHostnames,
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

export async function getCanonicalOrigin(organizationId?: string): Promise<string> {
  const currentOrigin = window.location.origin;
  if (isLocalDevelopmentHost(window.location.hostname)) return currentOrigin;
  try {
    const config = await getPublicDomainConfig();
    const workspaceHostname = organizationId ? config?.organizationHostnames[organizationId] : undefined;
    const currentWorkspaceHostname = !organizationId && config
      && Object.values(config.organizationHostnames).includes(window.location.hostname.toLowerCase())
      ? window.location.hostname.toLowerCase()
      : undefined;
    const hostname = workspaceHostname || currentWorkspaceHostname || config?.canonicalHostname;
    return hostname ? `https://${hostname}` : currentOrigin;
  } catch {
    console.warn("Canonical domain settings are unavailable; using the current origin.");
    return currentOrigin;
  }
}

export async function getAppUrl(route: string, organizationId?: string): Promise<string> {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const origin = await getCanonicalOrigin(organizationId);
  const target = new URL(normalizedRoute, origin);
  if (target.origin !== origin) throw new Error("Application URLs must remain on the configured application origin.");
  return target.toString();
}

export async function getAuthRedirectUrl(route: string, organizationId?: string): Promise<string | undefined> {
  const config = await getPublicDomainConfig();
  const candidateHostname = organizationId
    ? config?.organizationHostnames[organizationId]
    : config && Object.values(config.organizationHostnames).includes(window.location.hostname.toLowerCase())
      ? window.location.hostname.toLowerCase()
      : undefined;
  const allowedHosts = new Set(
    (import.meta.env.VITE_SUPABASE_AUTH_ALLOWED_REDIRECT_HOSTS ?? "")
      .split(",").map((hostname: string) => hostname.trim().toLowerCase()).filter(Boolean),
  );
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  if (candidateHostname && allowedHosts.has(candidateHostname)) {
    return new URL(normalizedRoute, `https://${candidateHostname}`).toString();
  }
  if (!config?.canonicalHostname && candidateHostname) return undefined;
  const fallbackOrigin = config?.canonicalHostname ? `https://${config.canonicalHostname}` : window.location.origin;
  return new URL(normalizedRoute, fallbackOrigin).toString();
}

export async function redirectToCanonicalDomain(): Promise<boolean> {
  if (isLocalDevelopmentHost(window.location.hostname)) return false;
  const config = await getPublicDomainConfig();
  if (!config || !config.activeHostnames.includes(window.location.hostname.toLowerCase())) return false;
  const isWorkspaceDomain = Object.values(config.organizationHostnames).includes(window.location.hostname.toLowerCase());
  if (isWorkspaceDomain) {
    if (window.location.protocol !== "https:") {
      const secureUrl = new URL(`${window.location.pathname}${window.location.search}${window.location.hash}`, `https://${window.location.hostname}`);
      window.location.replace(secureUrl.toString());
      return true;
    }
    return false;
  }
  if (!config.canonicalHostname) return false;
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
  "/integrations": { title: "Integrations | Adometa CRM", description: "Review current Adometa CRM integration capabilities and setup requirements." },
  "/faq": { title: "FAQ | Adometa CRM", description: "Answers about Adometa CRM features, integrations, access and plan details." },
  "/about": { title: "About Adometa CRM", description: "Learn about Adometa's focused sales workspace for growing teams." },
  "/contact": { title: "Contact | Adometa CRM", description: "Contact Adometa about your sales workflow." },
  "/privacy": { title: "Privacy Information | Adometa CRM", description: "Review product-level privacy information and deployment details that require operator confirmation." },
  "/terms": { title: "Terms Information | Adometa CRM", description: "Review Adometa product scope and commercial terms that require legal approval." },
  "/cookies": { title: "Cookie and Storage Information | Adometa CRM", description: "Learn about essential authentication storage and browser data used by Adometa CRM." },
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
  if (metadata) {
    document.title = metadata.title;
    setMeta('meta[name="description"]', metadata.description);
    setMeta('meta[property="og:title"]', metadata.title);
    setMeta('meta[property="og:description"]', metadata.description);
    setMeta('meta[name="twitter:title"]', metadata.title);
    setMeta('meta[name="twitter:description"]', metadata.description);
  }
  if (!isPublicIndexable) {
    document.querySelector('link[rel="canonical"]')?.remove();
    document.getElementById("adometa-structured-data")?.remove();
    setMeta('meta[property="og:url"]', "");
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
  setMeta('meta[property="og:url"]', canonical);
  const prior = document.getElementById("adometa-structured-data");
  prior?.remove();
  const structuredData = document.createElement("script");
  structuredData.id = "adometa-structured-data";
  structuredData.type = "application/ld+json";
  structuredData.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "Adometa CRM", url: canonical });
  document.head.append(structuredData);
}

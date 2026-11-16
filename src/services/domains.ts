import { getCanonicalOrigin, applicationRouteRegistry, type ApplicationRoute } from "../lib/appUrls";
import { supabase } from "../lib/supabase";

const apiOrigin = import.meta.env.VITE_DATABASE_API_URL?.trim().replace(/\/+$/, "") ?? "";
const supabaseOrigin = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";

export type PlatformDomain = {
  id: string;
  hostname: string;
  provider: "hostinger" | "vercel" | "railway" | "other";
  isPrimary: boolean;
  status: "pending_dns" | "dns_verified" | "ssl_pending" | "active" | "verification_failed";
  dnsStatus: "pending" | "verified" | "failed";
  sslStatus: "pending" | "verified" | "failed";
  dnsChallenge: string;
  redirectHttps: boolean;
  redirectMode: "none" | "www_to_root" | "root_to_www";
  lastVerificationAt: string | null;
  verifiedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainAuditEvent = {
  id: string;
  domain_id: string;
  actor_user_id: string;
  action: string;
  hostname: string;
  changes: Record<string, unknown>;
  created_at: string;
};

export type LinkInventoryItem = ApplicationRoute & {
  url: string;
  openable: boolean;
  verifiedAt?: string;
};

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (!apiOrigin) throw new Error("The domain management API is not configured. Set VITE_DATABASE_API_URL.");
  if (!supabase) throw new Error("Supabase authentication is not configured.");
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Your Super Admin session could not be refreshed.");
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in with a verified Super Admin account.");
  const response = await fetch(`${apiOrigin}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as { error?: string; domain?: PlatformDomain; domains?: PlatformDomain[]; events?: DomainAuditEvent[]; checks?: { dns: boolean; https: boolean; httpStatus: number | null } } | null;
  if (!response.ok) throw new Error(result?.error || "The domain operation could not be completed.");
  return result as T;
}

export async function listPlatformDomains() {
  return (await request<{ domains: PlatformDomain[] }>("/domains")).domains;
}

export async function listDomainAudit() {
  return (await request<{ events: DomainAuditEvent[] }>("/domains/audit")).events;
}

export async function addPlatformDomain(hostname: string, provider: PlatformDomain["provider"]) {
  return (await request<{ domain: PlatformDomain }>("/domains", "POST", { hostname, provider })).domain;
}

export async function updatePlatformDomain(id: string, patch: { hostname?: string; provider?: PlatformDomain["provider"] }) {
  return (await request<{ domain: PlatformDomain }>(`/domains/${id}`, "PATCH", patch)).domain;
}

export async function verifyPlatformDomain(id: string) {
  return request<{ domain: PlatformDomain; checks: { dns: boolean; https: boolean; httpStatus: number | null } }>(`/domains/${id}/verify`, "POST", {});
}

export async function setPrimaryPlatformDomain(id: string, redirectHttps: boolean, redirectMode: PlatformDomain["redirectMode"]) {
  return (await request<{ domain: PlatformDomain }>(`/domains/${id}/primary`, "POST", { redirectHttps, redirectMode })).domain;
}

export async function updatePlatformRedirects(redirectHttps: boolean, redirectMode: PlatformDomain["redirectMode"]) {
  return (await request<{ domain: PlatformDomain }>("/domains/redirects", "PATCH", { redirectHttps, redirectMode })).domain;
}

export async function removePlatformDomain(id: string) {
  await request<{ deleted: boolean }>(`/domains/${id}`, "DELETE");
}

export function getDomainApiOrigin() {
  return apiOrigin;
}

export async function getLinkInventory(): Promise<LinkInventoryItem[]> {
  const canonicalOrigin = await getCanonicalOrigin();
  return applicationRouteRegistry.map((route) => {
    let baseOrigin = canonicalOrigin;
    if (route.api) baseOrigin = apiOrigin;
    if (route.supabaseCallback) baseOrigin = supabaseOrigin;
    const url = baseOrigin ? new URL(route.route, baseOrigin).toString() : "";
    const hasTemplateParameter = route.route.includes(":");
    const openable = Boolean(url) && !hasTemplateParameter && (
      !route.api || route.method === "GET" || route.method === "GET / POST"
    ) && !route.supabaseCallback;
    return { ...route, url: url || "Service URL not configured", openable };
  });
}

export async function checkLink(url: string) {
  const isApi = apiOrigin && url.startsWith(`${apiOrigin}/`);
  const headers: Record<string, string> = {};
  if (isApi && supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(url, {
    method: isApi ? "GET" : "HEAD",
    headers,
    redirect: "manual",
    cache: "no-store",
  });
  return { status: response.status, ok: response.ok };
}

export async function downloadSeoAsset(path: "/seo/sitemap.xml" | "/seo/robots.txt") {
  if (!apiOrigin) throw new Error("The database API service URL is not configured.");
  const response = await fetch(`${apiOrigin}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error("SEO output is unavailable until a verified canonical domain is active.");
  return response.blob();
}


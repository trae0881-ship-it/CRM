import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { getRuntimeConfig, getSupabaseServerConfig } from "../config/env.mjs";
import { checkMySqlConnection, closeMySqlPool } from "../config/mysql.mjs";
import { getSupabaseAdmin, verifyPlatformSuperAdmin } from "../config/supabase.mjs";
import { countSynchronizedByOrganization, countSynchronizedRecords, getMySqlSyncSummary } from "../repositories/records.mjs";
import { normalizeHostname, verifyDomainRecords } from "./domain-verification.mjs";
import { reconcileOrganization } from "../sync/reconcile.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const domainProviders = new Set(["hostinger", "vercel", "railway", "other"]);
const redirectModes = new Set(["none", "www_to_root", "root_to_www"]);
const applicationRouteRegistryUrl = new URL("../../shared/application-routes.json", import.meta.url);

const json = (response, status, body, origin) => {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization, content-type";
    headers["access-control-allow-methods"] = "GET, POST, PATCH, DELETE, OPTIONS";
    headers.vary = "Origin";
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
};

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("invalid_json"); }
}

function bearerToken(request) {
  const header = request.headers.authorization;
  const match = typeof header === "string" ? /^Bearer\s+([^\s]+)$/i.exec(header) : null;
  return match?.[1] ?? null;
}

function safeCode(error) {
  return String(error?.code ?? error?.name ?? "database_error").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 96);
}

async function allowedOrigin(origin, configuredOrigin) {
  if (!origin) return null;
  if (origin === configuredOrigin) return origin;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.port) return null;
    const { data, error } = await getSupabaseAdmin()
      .from("platform_domains")
      .select("hostname")
      .eq("verification_status", "active")
      .limit(100);
    if (error) return null;
    return data?.some((domain) => domain.hostname === url.hostname) ? origin : null;
  } catch {
    return null;
  }
}

async function platformActor(request) {
  const token = bearerToken(request);
  if (!token) return { response: { status: 403, body: { error: "Verified platform administrator access required" } } };
  try {
    const actor = await verifyPlatformSuperAdmin(token);
    return actor
      ? { actor }
      : { response: { status: 403, body: { error: "Verified platform administrator access required" } } };
  } catch (error) {
    return { response: { status: 503, body: { error: "Platform access could not be verified", errorCode: safeCode(error) } } };
  }
}

function domainRow(row) {
  const {
    id, hostname, provider, is_primary, verification_status, dns_status, ssl_status, dns_challenge,
    redirect_https, redirect_mode, last_verification_at, verified_at, last_error_code, created_at, updated_at,
  } = row;
  return {
    id, hostname, provider, isPrimary: is_primary, status: verification_status, dnsStatus: dns_status,
    sslStatus: ssl_status, dnsChallenge: dns_challenge, redirectHttps: redirect_https,
    redirectMode: redirect_mode, lastVerificationAt: last_verification_at, verifiedAt: verified_at,
    lastErrorCode: last_error_code, createdAt: created_at, updatedAt: updated_at,
  };
}

async function handleDomainRequest(request, response, url, origin) {
  const access = await platformActor(request);
  if (access.response) return json(response, access.response.status, access.response.body, origin);
  const admin = getSupabaseAdmin();
  const method = request.method;
  const path = url.pathname;
  try {
    if (path === "/domains" && method === "GET") {
      const { data, error } = await admin.from("platform_domains").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return json(response, 200, { domains: (data ?? []).map(domainRow) }, origin);
    }
    if (path === "/domains/audit" && method === "GET") {
      const { data, error } = await admin.from("platform_domain_audit")
        .select("id,domain_id,actor_user_id,action,hostname,changes,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json(response, 200, { events: data ?? [] }, origin);
    }
    if (path === "/domains" && method === "POST") {
      const body = await readJson(request);
      let hostname;
      try { hostname = normalizeHostname(body.hostname); }
      catch { return json(response, 400, { error: "Enter a valid public hostname without a scheme or path." }, origin); }
      if (!domainProviders.has(body.provider)) return json(response, 400, { error: "Choose a supported hosting provider." }, origin);
      const { data, error } = await admin.rpc("manage_platform_domain", {
        action_name: "create", target_domain: null, target_hostname: hostname, target_provider: body.provider,
        target_challenge: randomBytes(24).toString("hex"), target_redirect_https: null,
        target_redirect_mode: null, actor_user: access.actor.userId,
      });
      if (error) throw error;
      return json(response, 201, { domain: domainRow(data) }, origin);
    }
    const route = /^\/domains\/([0-9a-f-]{36})(?:\/(verify|primary))?$/.exec(path);
    if (route) {
      const [, id, action] = route;
      if (!uuidPattern.test(id)) return json(response, 400, { error: "Invalid domain identifier." }, origin);
      if (!action && method === "PATCH") {
        const body = await readJson(request);
        let hostname = null;
        if (body.hostname !== undefined) {
          try { hostname = normalizeHostname(body.hostname); }
          catch { return json(response, 400, { error: "Enter a valid public hostname without a scheme or path." }, origin); }
        }
        if (body.provider !== undefined && !domainProviders.has(body.provider)) return json(response, 400, { error: "Choose a supported hosting provider." }, origin);
        const { data, error } = await admin.rpc("manage_platform_domain", {
          action_name: "update", target_domain: id, target_hostname: hostname, target_provider: body.provider ?? null,
          target_challenge: hostname ? randomBytes(24).toString("hex") : null,
          target_redirect_https: null, target_redirect_mode: null, actor_user: access.actor.userId,
        });
        if (error) throw error;
        return json(response, 200, { domain: domainRow(data) }, origin);
      }
      if (action === "verify" && method === "POST") {
        const { data: current, error: readError } = await admin.from("platform_domains")
          .select("id,hostname,dns_challenge").eq("id", id).maybeSingle();
        if (readError) throw readError;
        if (!current) return json(response, 404, { error: "Domain not found." }, origin);
        const verification = await verifyDomainRecords(current.hostname, current.dns_challenge);
        const { data, error } = await admin.rpc("record_platform_domain_verification", {
          target_domain: id, dns_verified: verification.dnsVerified, https_verified: verification.httpsVerified,
          verification_failed: verification.verificationFailed, error_code: verification.errorCode,
          response_status: verification.responseStatus, actor_user: access.actor.userId,
        });
        if (error) throw error;
        return json(response, 200, {
          domain: domainRow(data),
          checks: { dns: verification.dnsVerified, https: verification.httpsVerified, httpStatus: verification.responseStatus },
        }, origin);
      }
      if (action === "primary" && method === "POST") {
        const body = await readJson(request);
        const mode = body.redirectMode ?? "none";
        if (!redirectModes.has(mode) || (body.redirectHttps !== undefined && typeof body.redirectHttps !== "boolean")) {
          return json(response, 400, { error: "Invalid redirect settings." }, origin);
        }
        const { data, error } = await admin.rpc("manage_platform_domain", {
          action_name: "set_primary", target_domain: id, target_hostname: null, target_provider: null,
          target_challenge: null, target_redirect_https: body.redirectHttps ?? true,
          target_redirect_mode: mode, actor_user: access.actor.userId,
        });
        if (error) throw error;
        return json(response, 200, { domain: domainRow(data) }, origin);
      }
      if (!action && method === "DELETE") {
        const { data, error } = await admin.rpc("manage_platform_domain", {
          action_name: "delete", target_domain: id, target_hostname: null, target_provider: null,
          target_challenge: null, target_redirect_https: null, target_redirect_mode: null,
          actor_user: access.actor.userId,
        });
        if (error) throw error;
        return json(response, 200, { deleted: data?.id === id }, origin);
      }
    }
    if (path === "/domains/redirects" && method === "PATCH") {
      const body = await readJson(request);
      if (!redirectModes.has(body.redirectMode) || typeof body.redirectHttps !== "boolean") {
        return json(response, 400, { error: "Invalid redirect settings." }, origin);
      }
      const { data, error } = await admin.rpc("manage_platform_domain", {
        action_name: "update_redirects", target_domain: null, target_hostname: null, target_provider: null,
        target_challenge: null, target_redirect_https: body.redirectHttps,
        target_redirect_mode: body.redirectMode, actor_user: access.actor.userId,
      });
      if (error) throw error;
      return json(response, 200, { domain: domainRow(data) }, origin);
    }
    return json(response, 404, { error: "Not found" }, origin);
  } catch (error) {
    if (error?.code === "23505") return json(response, 409, { error: "That hostname is already registered." }, origin);
    const status = error?.message === "invalid_json" || error?.message === "request_too_large" ? 400 : 503;
    return json(response, status, { error: status === 400 ? "Invalid request body." : "Domain operation failed.", errorCode: safeCode(error) }, origin);
  }
}

async function databaseStatus() {
  let supabaseConnected = false;
  let outbox = null;
  let organizations = [];
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    supabaseConnected = true;
    const { data: health, error: healthError } = await admin.rpc("mysql_sync_health");
    if (!healthError) outbox = health;
  } catch (error) {
    outbox = { errorCode: safeCode(error) };
  }

  let mysqlConnected = false;
  let mysqlErrorCode = null;
  let totalRecords = [];
  let organizationRecords = [];
  let mysqlSyncSummary = { totalEvents: 0, completedEvents: 0, lastSuccessfulSyncAt: null };
  try {
    mysqlConnected = (await checkMySqlConnection()).connected;
    if (mysqlConnected) {
      [totalRecords, organizationRecords, mysqlSyncSummary] = await Promise.all([
        countSynchronizedRecords(),
        countSynchronizedByOrganization(),
        getMySqlSyncSummary(),
      ]);
    }
  } catch (error) {
    mysqlErrorCode = safeCode(error);
  }

  const outboxOrganizations = new Map((outbox?.organizations ?? []).map((item) => [item.organization_id, item]));
  const mysqlOrganizations = new Map(organizationRecords.map((item) => [item.organizationId, item]));
  const organizationIds = new Set([...outboxOrganizations.keys(), ...mysqlOrganizations.keys()]);
  const organizationStatus = [...organizationIds].map((organizationId) => {
    const pg = outboxOrganizations.get(organizationId) ?? {};
    const my = mysqlOrganizations.get(organizationId) ?? {};
    return {
      organizationId,
      mysqlRecords: my.records ?? 0,
      mysqlTombstones: my.tombstones ?? 0,
      pending: Number(pg.pending ?? 0),
      processing: Number(pg.processing ?? 0),
      failed: Number(pg.failed ?? 0),
      lastSuccessfulSyncAt: pg.last_successful_sync_at ?? my.lastSyncedAt ?? null,
    };
  });
  return {
    supabase: { connected: supabaseConnected, errorCode: supabaseConnected ? null : outbox?.errorCode ?? "connection_failed" },
    mysql: { connected: mysqlConnected, errorCode: mysqlErrorCode },
    synchronization: {
      available: Boolean(outbox && !outbox.errorCode),
      pending: Number(outbox?.pending ?? 0),
      processing: Number(outbox?.processing ?? 0),
      failed: Number(outbox?.failed ?? 0),
      completed: Number(outbox?.completed ?? 0),
      lastSuccessfulSyncAt: outbox?.last_successful_sync_at ?? mysqlSyncSummary.lastSuccessfulSyncAt,
      lastErrorCode: outbox?.last_error_code ?? null,
      totalSynchronizedRecords: totalRecords.reduce((sum, item) => sum + item.records, 0),
      byEntity: totalRecords,
      byOrganization: organizationStatus,
    },
  };
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;",
  })[character]);
}

async function seoResponse(response, request, url, origin) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" }, origin);
  const { data: config, error } = await getSupabaseAdmin().rpc("get_public_platform_domain_config");
  if (error) return json(response, 503, { error: "Canonical domain configuration is unavailable" }, origin);
  const hostname = config?.canonicalHostname;
  if (url.pathname === "/seo/sitemap.xml") {
    if (typeof hostname !== "string" || !hostname) return json(response, 503, { error: "No verified canonical domain is active" }, origin);
    const routes = JSON.parse(await readFile(applicationRouteRegistryUrl, "utf8"));
    const locations = routes
      .filter((route) => route.indexable === true && !route.api && !route.supabaseCallback)
      .map((route) => `  <url><loc>${escapeXml(`https://${hostname}${route.route}`)}</loc></url>`)
      .join("\n");
    response.writeHead(200, {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex, nofollow",
      ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    });
    return response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations}\n</urlset>`);
  }
  const sitemap = typeof hostname === "string" && hostname ? `Sitemap: https://${hostname}/seo/sitemap.xml\n` : "";
  response.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=300",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
  });
  return response.end([
    "User-agent: *",
    "Allow: /",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /reset-password",
    "Disallow: /dashboard",
    "Disallow: /super-admin/",
    "Disallow: /saas/admin/",
    "Disallow: /admin/docs",
    "Disallow: /docs",
    "Disallow: /health/",
    "Disallow: /domains",
    "Disallow: /sync/",
    sitemap.trimEnd(),
  ].filter(Boolean).join("\n") + "\n");
}

export function createDatabaseServer() {
  const { apiAllowedOrigin } = getRuntimeConfig();
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const allowed = await allowedOrigin(origin, apiAllowedOrigin);
    if (origin && !allowed) return json(response, 403, { error: "Origin not allowed" });
    const corsOrigin = allowed ?? undefined;
    if (request.method === "OPTIONS") {
      if (!corsOrigin) return json(response, 403, { error: "Origin not allowed" });
      response.writeHead(204, {
        "access-control-allow-origin": corsOrigin,
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "access-control-max-age": "600",
        vary: "Origin",
      });
      return response.end();
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/seo/sitemap.xml" || url.pathname === "/seo/robots.txt") {
      try { return await seoResponse(response, request, url, corsOrigin); }
      catch { return json(response, 503, { error: "SEO output is temporarily unavailable" }, corsOrigin); }
    }
    if (url.pathname === "/domains" || url.pathname.startsWith("/domains/")) return handleDomainRequest(request, response, url, corsOrigin);
    if (request.method === "GET" && url.pathname === "/health/live") return json(response, 200, { status: "ok" }, corsOrigin);

    if (url.pathname === "/health/db" && request.method === "GET") {
      const access = await platformActor(request);
      if (access.response) return json(response, access.response.status, access.response.body, corsOrigin);
      try { return json(response, 200, await databaseStatus(), corsOrigin); }
      catch (error) { return json(response, 503, { error: "Database health is unavailable", errorCode: safeCode(error) }, corsOrigin); }
    }

    if ((url.pathname === "/sync/replay" || url.pathname === "/sync/reconcile") && request.method === "POST") {
      const access = await platformActor(request);
      if (access.response) return json(response, access.response.status, access.response.body, corsOrigin);
      try {
        const body = await readJson(request);
        if (typeof body.organizationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.organizationId)) {
          return json(response, 400, { error: "A valid organizationId is required" }, corsOrigin);
        }
        if (url.pathname === "/sync/replay") {
          const { data, error } = await getSupabaseAdmin().rpc("replay_mysql_sync_failures", {
            target_organization: body.organizationId,
            max_events: 1000,
          });
          if (error) throw error;
          return json(response, 200, { replayQueued: Number(data ?? 0), organizationId: body.organizationId }, corsOrigin);
        }
        return json(response, 200, await reconcileOrganization(body.organizationId), corsOrigin);
      } catch (error) {
        const status = error?.message === "invalid_json" || error?.message === "request_too_large" ? 400 : 503;
        return json(response, status, { error: status === 400 ? "Invalid request body" : "Database operation failed", errorCode: safeCode(error) }, corsOrigin);
      }
    }

    return json(response, 404, { error: "Not found" }, corsOrigin);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let server;
  const shutdown = async () => {
    server?.close();
    await closeMySqlPool().catch(() => undefined);
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  try {
    const { apiPort } = getRuntimeConfig();
    getSupabaseServerConfig();
    server = createDatabaseServer();
    server.listen(apiPort, "0.0.0.0", () => console.log(`Database monitoring API listening on port ${apiPort}`));
  } catch (error) {
    console.error("Database API could not start:", safeCode(error));
    process.exitCode = 1;
  }
}

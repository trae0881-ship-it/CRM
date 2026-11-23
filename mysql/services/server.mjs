import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { getRuntimeConfig, getSupabaseServerConfig } from "../config/env.mjs";
import { checkMySqlConnection, closeMySqlPool } from "../config/mysql.mjs";
import { getSupabaseAdmin, verifyPlatformSuperAdmin } from "../config/supabase.mjs";
import { countSynchronizedByOrganization, countSynchronizedRecords, getMySqlStorageUsage, getMySqlSyncSummary } from "../repositories/records.mjs";
import { ENTITY_PRIMARY_KEYS, ENTITY_TABLES, EXCLUDED_TABLES, stripSecrets } from "../schemas/entities.mjs";
import { normalizeHostname, verifyDomainRecords } from "./domain-verification.mjs";
import { createRateLimiter, publicPricingPlan, validateContactPayload } from "./public-website.mjs";
import { parsePlatformUserFilters, validatePlatformUserEdit, validatePlatformUserInput } from "./platform-users.mjs";
import { reconcileOrganization } from "../sync/reconcile.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const domainProviders = new Set(["hostinger", "vercel", "railway", "other"]);
const redirectModes = new Set(["none", "www_to_root", "root_to_www"]);
const domainTypes = new Set(["custom_domain", "subdomain"]);
const applicationRouteRegistryUrl = new URL("../../shared/application-routes.json", import.meta.url);
const allowContactSubmission = createRateLimiter();
const allowDomainVerification = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
const allowActorDomainVerification = createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });
const allowDatabaseExport = createRateLimiter({ limit: 1, windowMs: 5 * 60 * 1000 });
const exportPageSize = 500;

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
    const { data, error } = await getSupabaseAdmin().rpc("get_public_platform_domain_config");
    if (error) return null;
    return data?.activeHostnames?.includes(url.hostname) ? origin : null;
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
    organization_id, requested_organization_id, domain_type, description, is_suspended, suspended_at,
  } = row;
  const displayStatus = is_suspended
    ? "suspended"
    : requested_organization_id && !organization_id && verification_status === "active"
      ? "assignment_pending"
      : verification_status;
  return {
    id, hostname, provider, isPrimary: is_primary, status: verification_status, dnsStatus: dns_status,
    sslStatus: ssl_status, dnsChallenge: dns_challenge, redirectHttps: redirect_https,
    redirectMode: redirect_mode, lastVerificationAt: last_verification_at, verifiedAt: verified_at,
    lastErrorCode: last_error_code, createdAt: created_at, updatedAt: updated_at,
    organizationId: organization_id, requestedOrganizationId: requested_organization_id,
    domainType: domain_type, description, isSuspended: is_suspended, suspendedAt: suspended_at,
    displayStatus,
  };
}

function platformOwnedHostnames() {
  return [
    process.env.APP_PUBLIC_URL,
    process.env.VITE_APP_URL,
    process.env.DATABASE_API_ALLOWED_ORIGIN,
    process.env.SUPABASE_URL,
  ].flatMap((value) => {
    if (!value) return [];
    try { return [new URL(value).hostname.toLowerCase()]; }
    catch { return []; }
  });
}

function isPlatformOwnedHostname(hostname) {
  return platformOwnedHostnames().some((owned) => hostname === owned || hostname.endsWith(`.${owned}`));
}

function expectedDomainTargets() {
  return (process.env.PLATFORM_DOMAIN_EXPECTED_TARGETS ?? "")
    .split(",").map((target) => target.trim()).filter(Boolean);
}

function allowedAuthRedirectHost(hostname) {
  return (process.env.SUPABASE_AUTH_ALLOWED_REDIRECT_HOSTS ?? "")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean).includes(hostname.toLowerCase());
}

function canVerifyDomain(actorUserId, domainId) {
  return allowActorDomainVerification(actorUserId)
    && allowDomainVerification(`${actorUserId}:${domainId}`);
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
    if (path === "/domains/workspaces" && method === "GET") {
      const { data, error } = await admin.from("organizations")
        .select("id,name,workspace_name")
        .eq("is_active", true).eq("approval_status", "approved")
        .order("name", { ascending: true });
      if (error) throw error;
      return json(response, 200, { workspaces: data ?? [] }, origin);
    }
    if (path === "/domains" && method === "POST") {
      const body = await readJson(request);
      let hostname;
      try { hostname = normalizeHostname(body.hostname); }
      catch { return json(response, 400, { error: "Enter a valid public hostname without a scheme or path." }, origin); }
      if (isPlatformOwnedHostname(hostname)) return json(response, 409, { error: "This hostname is already owned by an Adometa platform service." }, origin);
      if (!domainProviders.has(body.provider)) return json(response, 400, { error: "Choose a supported hosting provider." }, origin);
      if (!domainTypes.has(body.domainType)) return json(response, 400, { error: "Choose a valid domain type." }, origin);
      if (body.description !== undefined && typeof body.description !== "string") {
        return json(response, 400, { error: "Description must be text." }, origin);
      }
      const description = body.description?.trim() ?? "";
      if (description.length > 500) {
        return json(response, 400, { error: "Description must be 500 characters or fewer." }, origin);
      }
      if (body.organizationId !== null && body.organizationId !== undefined
        && (typeof body.organizationId !== "string" || !uuidPattern.test(body.organizationId))) {
        return json(response, 400, { error: "Choose a valid workspace." }, origin);
      }
      const { data, error } = await admin.rpc("create_platform_domain", {
        target_hostname: hostname, target_provider: body.provider,
        target_challenge: randomBytes(24).toString("hex"), target_domain_type: body.domainType,
        target_description: description, target_organization: body.organizationId || null,
        actor_user: access.actor.userId,
      });
      if (error) throw error;
      return json(response, 201, { domain: domainRow(data) }, origin);
    }
    const route = /^\/domains\/([0-9a-f-]{36})(?:\/(verify|primary|assignment|suspend|reactivate))?$/.exec(path);
    if (route) {
      const [, id, action] = route;
      if (!uuidPattern.test(id)) return json(response, 400, { error: "Invalid domain identifier." }, origin);
      if (!action && method === "PATCH") {
        const body = await readJson(request);
        let hostname = null;
        if (body.hostname !== undefined) {
          try { hostname = normalizeHostname(body.hostname); }
          catch { return json(response, 400, { error: "Enter a valid public hostname without a scheme or path." }, origin); }
          if (isPlatformOwnedHostname(hostname)) return json(response, 409, { error: "This hostname is already owned by an Adometa platform service." }, origin);
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
        if (!canVerifyDomain(access.actor.userId, id)) {
          return json(response, 429, { error: "Verification retry limit reached. Wait 15 minutes before trying again." }, origin);
        }
        const { data: current, error: readError } = await admin.from("platform_domains")
          .select("id,hostname,dns_challenge,requested_organization_id,is_suspended").eq("id", id).maybeSingle();
        if (readError) throw readError;
        if (!current) return json(response, 404, { error: "Domain not found." }, origin);
        const verification = await verifyDomainRecords(current.hostname, current.dns_challenge, expectedDomainTargets());
        const { data: verifiedDomain, error } = await admin.rpc("record_platform_domain_verification", {
          target_domain: id, dns_verified: verification.dnsVerified, https_verified: verification.httpsVerified,
          verification_failed: verification.verificationFailed, error_code: verification.errorCode,
          response_status: verification.responseStatus, actor_user: access.actor.userId,
        });
        if (error) throw error;
        let data = verifiedDomain;
        if (verification.dnsVerified && verification.httpsVerified && current.requested_organization_id && !current.is_suspended) {
          const { data: assigned, error: assignmentError } = await admin.rpc("manage_platform_domain_workspace", {
            action_name: "assign", target_domain: id,
            target_organization: current.requested_organization_id, actor_user: access.actor.userId,
          });
          if (assignmentError) {
            return json(response, 409, {
              error: "DNS and HTTPS passed, but the requested workspace could not be assigned. Choose an approved active workspace and retry.",
              errorCode: safeCode(assignmentError),
              domain: domainRow(verifiedDomain),
              checks: { dns: true, https: true, httpStatus: verification.responseStatus },
            }, origin);
          }
          data = assigned;
        }
        return json(response, 200, {
          domain: domainRow(data),
          checks: { dns: verification.dnsVerified, https: verification.httpsVerified, httpStatus: verification.responseStatus },
        }, origin);
      }
      if (action === "assignment" && method === "PATCH") {
        const body = await readJson(request);
        if (body.organizationId !== null && body.organizationId !== undefined
          && (typeof body.organizationId !== "string" || !uuidPattern.test(body.organizationId))) {
          return json(response, 400, { error: "Choose a valid workspace." }, origin);
        }
        const { data, error } = await admin.rpc("manage_platform_domain_workspace", {
          action_name: "assign", target_domain: id,
          target_organization: body.organizationId || null, actor_user: access.actor.userId,
        });
        if (error) throw error;
        return json(response, 200, { domain: domainRow(data) }, origin);
      }
      if ((action === "suspend" || action === "reactivate") && method === "POST") {
        let requestedOrgForReactivation = null;
        if (action === "reactivate") {
          if (!canVerifyDomain(access.actor.userId, id)) {
            return json(response, 429, { error: "Verification retry limit reached. Wait 15 minutes before trying again." }, origin);
          }
          const { data: current, error: readError } = await admin.from("platform_domains")
            .select("id,hostname,dns_challenge,requested_organization_id").eq("id", id).maybeSingle();
          if (readError) throw readError;
          if (!current) return json(response, 404, { error: "Domain not found." }, origin);
          requestedOrgForReactivation = current.requested_organization_id;
          const verification = await verifyDomainRecords(current.hostname, current.dns_challenge, expectedDomainTargets());
          const { error: verificationError } = await admin.rpc("record_platform_domain_verification", {
            target_domain: id, dns_verified: verification.dnsVerified, https_verified: verification.httpsVerified,
            verification_failed: verification.verificationFailed, error_code: verification.errorCode,
            response_status: verification.responseStatus, actor_user: access.actor.userId,
          });
          if (verificationError) throw verificationError;
          if (!verification.dnsVerified || !verification.httpsVerified) {
            const { data: pending, error: pendingError } = await admin.from("platform_domains").select("*").eq("id", id).single();
            if (pendingError) throw pendingError;
            return json(response, 409, {
              error: "Domain revalidation did not pass. It remains suspended.",
              domain: domainRow(pending),
              checks: { dns: verification.dnsVerified, https: verification.httpsVerified, httpStatus: verification.responseStatus },
            }, origin);
          }
        }
        const { data, error } = await admin.rpc("manage_platform_domain_workspace", {
          action_name: action, target_domain: id, target_organization: null, actor_user: access.actor.userId,
        });
        if (error) throw error;
        let updatedDomain = data;
        if (action === "reactivate" && requestedOrgForReactivation) {
          const { data: assigned, error: assignmentError } = await admin.rpc("manage_platform_domain_workspace", {
            action_name: "assign", target_domain: id,
            target_organization: requestedOrgForReactivation, actor_user: access.actor.userId,
          });
          if (assignmentError) {
            const { data: current, error: currentError } = await admin.from("platform_domains").select("*").eq("id", id).single();
            if (currentError) throw currentError;
            return json(response, 409, {
              error: "Domain revalidated, but its requested workspace could not be assigned. Select an approved active workspace.",
              errorCode: safeCode(assignmentError),
              domain: domainRow(current),
            }, origin);
          }
          updatedDomain = assigned;
        }
        return json(response, 200, { domain: domainRow(updatedDomain) }, origin);
      }
      if (action === "primary" && method === "POST") {
        const { data: current, error: readError } = await admin.from("platform_domains")
          .select("id,organization_id,requested_organization_id,is_suspended").eq("id", id).maybeSingle();
        if (readError) throw readError;
        if (!current) return json(response, 404, { error: "Domain not found." }, origin);
        if (current.organization_id || current.requested_organization_id || current.is_suspended) {
          return json(response, 409, { error: "Only an active, unassigned platform domain can be made canonical." }, origin);
        }
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
        const { data: current, error: readError } = await admin.from("platform_domains")
          .select("id,is_primary,organization_id").eq("id", id).maybeSingle();
        if (readError) throw readError;
        if (!current) return json(response, 404, { error: "Domain not found." }, origin);
        if (current.is_primary || current.organization_id) {
          return json(response, 409, { error: "Remove the canonical or workspace assignment before deleting this domain." }, origin);
        }
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

function platformUserRow(row) {
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
    membershipActive: row.membership_is_active,
    status: row.account_status,
    isBanned: row.is_banned,
    emailConfirmedAt: row.email_confirmed_at,
    createdAt: row.auth_created_at,
    membershipCreatedAt: row.membership_created_at,
    lastSignInAt: row.last_sign_in_at,
  };
}

async function validatePlatformCompany(admin, companyId, isActive) {
  const { data: company, error: companyError } = await admin.from("organizations")
    .select("id,is_active,slug").eq("id", companyId).maybeSingle();
  if (companyError) throw companyError;
  if (!company || !company.is_active || company.slug.startsWith("adometa-platform-")) {
    return { status: 400, error: "Choose an active customer company." };
  }
  if (!isActive) return null;

  const { data: subscription, error: subscriptionError } = await admin.from("subscriptions")
    .select("subscription_plans(max_users)")
    .eq("organization_id", companyId)
    .in("status", ["trialing", "active"])
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;
  const plan = Array.isArray(subscription?.subscription_plans)
    ? subscription.subscription_plans[0]
    : subscription?.subscription_plans;
  const maxUsers = plan?.max_users;
  if (maxUsers === null || maxUsers === undefined) return null;

  const { count, error: countError } = await admin.from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", companyId)
    .eq("is_active", true);
  if (countError) throw countError;
  if ((count ?? 0) >= Number(maxUsers)) {
    return { status: 409, error: "The selected company has reached its active user limit." };
  }
  return null;
}

async function isLastActivePlatformAdmin(admin, targetUserId, targetAccount) {
  const { data: memberships, error } = await admin.from("organization_members")
    .select("user_id").eq("role", "super_admin").eq("is_active", true);
  if (error) throw error;
  const adminIds = new Set((memberships ?? []).map((membership) => membership.user_id));
  if (!adminIds.has(targetUserId)) return false;
  const targetIsBanned = targetAccount.banned_until && new Date(targetAccount.banned_until).getTime() > Date.now();
  if (targetIsBanned) return false;

  let activeAdmins = 0;
  for (const userId of adminIds) {
    let account = targetAccount;
    if (userId !== targetUserId) {
      const { data, error: accountError } = await admin.auth.admin.getUserById(userId);
      if (accountError) throw accountError;
      account = data?.user;
    }
    if (account && (!account.banned_until || new Date(account.banned_until).getTime() <= Date.now())) {
      activeAdmins += 1;
    }
  }
  return activeAdmins <= 1;
}

async function platformUserRequest(request, response, url, origin) {
  const access = await platformActor(request);
  if (access.response) return json(response, access.response.status, access.response.body, origin);

  const admin = getSupabaseAdmin();
  const path = url.pathname;
  try {
    if (path === "/platform/users" && request.method === "GET") {
      const filters = parsePlatformUserFilters(url.searchParams);
      if (filters.error) return json(response, 400, { error: filters.error }, origin);
      const { value } = filters;
      const { data, error } = await admin.rpc("platform_list_users", {
        actor_user: access.actor.userId,
        search_term: value.search,
        company_filter: value.companyId,
        role_filter: value.role,
        status_filter: value.status,
        page_number: value.page,
        page_size: value.pageSize,
      });
      if (error) throw error;
      const users = (data ?? []).map(platformUserRow);
      return json(response, 200, {
        users,
        totalCount: Number(data?.[0]?.total_count ?? 0),
        page: value.page,
        pageSize: value.pageSize,
      }, origin);
    }

    if (path === "/platform/users" && request.method === "POST") {
      const body = await readJson(request);
      const validation = validatePlatformUserInput(body);
      if (validation.error) return json(response, 400, { error: validation.error }, origin);
      const value = validation.value;

      const companyIssue = await validatePlatformCompany(admin, value.companyId, value.isActive);
      if (companyIssue) return json(response, companyIssue.status, { error: companyIssue.error }, origin);

      const { data: matches, error: lookupError } = await admin.rpc("platform_find_auth_user_by_email", {
        actor_user: access.actor.userId,
        target_email: value.email,
      });
      if (lookupError) throw lookupError;
      const existingUser = matches?.[0];
      if (existingUser) {
        const { error } = await admin.rpc("platform_assign_user_membership", {
          actor_user: access.actor.userId,
          target_user: existingUser.user_id,
          target_organization: value.companyId,
          target_role: value.role,
          target_active: value.isActive,
          target_full_name: value.fullName,
          target_phone: value.phone,
        });
        if (error?.code === "23505") return json(response, 409, { error: "This user is already assigned to the selected company." }, origin);
        if (error) throw error;
        return json(response, 200, { userId: existingUser.user_id, assignedExistingUser: true }, origin);
      }

      let invitedUser;
      let authError;
      if (value.sendInvitation) {
        const inviteOptions = { data: { full_name: value.fullName } };
        const { data: domainConfig, error: domainError } = await admin.rpc("get_public_platform_domain_config");
        if (domainError) {
          console.warn("Canonical invitation redirect unavailable; Supabase Site URL will be used.");
        } else {
          const workspaceHostname = domainConfig?.organizationHostnames?.[value.companyId];
          const hostname = typeof workspaceHostname === "string" && allowedAuthRedirectHost(workspaceHostname)
            ? workspaceHostname
            : domainConfig?.canonicalHostname;
          if (typeof hostname === "string" && hostname) inviteOptions.redirectTo = `https://${hostname}/`;
        }
        ({ data: invitedUser, error: authError } = await admin.auth.admin.inviteUserByEmail(value.email, inviteOptions));
      } else {
        ({ data: invitedUser, error: authError } = await admin.auth.admin.createUser({
          email: value.email,
          email_confirm: false,
          user_metadata: { full_name: value.fullName },
        }));
      }
      if (authError || !invitedUser?.user) {
        const duplicate = authError?.code === "email_exists" || /already (?:registered|exists)/i.test(authError?.message ?? "");
        return json(response, duplicate ? 409 : 400, {
          error: duplicate
            ? "An account with this email already exists. Refresh the user list and assign that account to the company."
            : value.sendInvitation
              ? "The invitation could not be sent. Check Supabase Auth email configuration and try again."
              : "The account could not be created.",
        }, origin);
      }

      const newUserId = invitedUser.user.id;
      const { error: membershipError } = await admin.rpc("platform_assign_user_membership", {
        actor_user: access.actor.userId,
        target_user: newUserId,
        target_organization: value.companyId,
        target_role: value.role,
        target_active: value.isActive,
        target_full_name: value.fullName,
        target_phone: value.phone,
      });
      if (membershipError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(newUserId);
        if (cleanupError) {
          console.error("New Auth account cleanup failed after membership creation error:", safeCode(cleanupError));
        }
        if (membershipError.code === "23514") return json(response, 409, { error: "The selected company has reached its active user limit." }, origin);
        if (membershipError.code === "23505") return json(response, 409, { error: "This user is already assigned to the selected company." }, origin);
        throw membershipError;
      }
      return json(response, 201, {
        userId: newUserId,
        assignedExistingUser: false,
        invitationSent: value.sendInvitation,
      }, origin);
    }

    const accountRoute = /^\/platform\/users\/([0-9a-f-]{36})\/account-status$/.exec(path);
    if (accountRoute && request.method === "PATCH") {
      if (!uuidPattern.test(accountRoute[1])) return json(response, 400, { error: "Invalid user identifier." }, origin);
      const body = await readJson(request);
      if (typeof body.accountActive !== "boolean") {
        return json(response, 400, { error: "Choose whether the account should be active." }, origin);
      }
      const targetUserId = accountRoute[1];
      const { data: userResult, error: userError } = await admin.auth.admin.getUserById(targetUserId);
      if (userError || !userResult.user) return json(response, 404, { error: "User account was not found." }, origin);
      if (!body.accountActive && targetUserId === access.actor.userId) {
        return json(response, 409, { error: "You cannot deactivate your own Super Admin account." }, origin);
      }

      if (!body.accountActive) {
        if (await isLastActivePlatformAdmin(admin, targetUserId, userResult.user)) {
          return json(response, 409, { error: "The last active Super Admin account cannot be deactivated." }, origin);
        }
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: body.accountActive ? "none" : "876000h",
      });
      if (updateError) throw updateError;
      const { error: auditError } = await admin.from("audit_logs").insert({
        organization_id: null,
        actor_id: access.actor.userId,
        action: body.accountActive ? "platform_user_account_activated" : "platform_user_account_deactivated",
        entity_type: "auth_user",
        entity_id: targetUserId,
        metadata: {},
      });
      if (auditError) throw auditError;
      return json(response, 200, { userId: targetUserId, accountActive: body.accountActive }, origin);
    }

    const membershipRoute = /^\/platform\/users\/([0-9a-f-]{36})\/memberships\/([0-9a-f-]{36})$/.exec(path);
    if (membershipRoute && request.method === "PATCH") {
      const [, targetUserId, organizationId] = membershipRoute;
      if (!uuidPattern.test(targetUserId) || !uuidPattern.test(organizationId)) {
        return json(response, 400, { error: "Invalid user or company identifier." }, origin);
      }
      const body = await readJson(request);
      const validation = validatePlatformUserEdit(body);
      if (validation.error) return json(response, 400, { error: validation.error }, origin);
      const value = validation.value;
      const companyIssue = await validatePlatformCompany(admin, organizationId, value.isActive);
      if (companyIssue) return json(response, companyIssue.status, { error: companyIssue.error }, origin);
      const { error } = await admin.rpc("platform_update_user_membership", {
        actor_user: access.actor.userId,
        target_user: targetUserId,
        target_organization: organizationId,
        target_role: value.role,
        target_active: value.isActive,
        target_full_name: value.fullName,
        target_phone: value.phone,
      });
      if (error?.code === "23514") return json(response, 409, { error: "The selected company has reached its active user limit." }, origin);
      if (error?.message?.includes("last active Company Owner")) {
        return json(response, 409, { error: "The last active Company Owner cannot be deactivated or demoted." }, origin);
      }
      if (error) throw error;
      return json(response, 200, { userId: targetUserId, organizationId }, origin);
    }

    return json(response, 404, { error: "Not found" }, origin);
  } catch (error) {
    const status = error?.message === "invalid_json" || error?.message === "request_too_large" ? 400 : 503;
    return json(response, status, {
      error: status === 400 ? "Invalid request body." : "User management operation failed.",
      errorCode: safeCode(error),
    }, origin);
  }
}

async function databaseStatus(actorUserId) {
  let supabaseConnected = false;
  let supabaseUsage = { databaseBytes: null, tables: [], errorCode: "usage_unavailable" };
  let outbox = null;
  let organizations = [];
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    supabaseConnected = true;
    const [{ data: health, error: healthError }, { data: usage, error: usageError }] = await Promise.all([
      admin.rpc("mysql_sync_health"),
      admin.rpc("platform_database_usage", { target_actor: actorUserId }),
    ]);
    if (!healthError) outbox = health;
    if (!usageError && usage) {
      supabaseUsage = {
        databaseBytes: Number(usage.databaseBytes ?? usage.database_bytes ?? 0),
        tables: Array.isArray(usage.tables) ? usage.tables : [],
        errorCode: null,
      };
    } else if (usageError) {
      supabaseUsage.errorCode = safeCode(usageError);
    }
  } catch (error) {
    outbox = { errorCode: safeCode(error) };
    supabaseUsage.errorCode = safeCode(error);
  }

  let mysqlConnected = false;
  let mysqlErrorCode = null;
  let mysqlUsage = { databaseBytes: null, tables: [], errorCode: "usage_unavailable" };
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
      try {
        mysqlUsage = { ...(await getMySqlStorageUsage()), errorCode: null };
      } catch (error) {
        mysqlUsage.errorCode = safeCode(error);
      }
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
    supabase: { connected: supabaseConnected, errorCode: supabaseConnected ? null : outbox?.errorCode ?? "connection_failed", ...supabaseUsage },
    mysql: { connected: mysqlConnected, errorCode: mysqlErrorCode, ...mysqlUsage },
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

async function writeDownloadChunk(response, value) {
  if (response.destroyed) throw new Error("database_export_client_disconnected");
  await new Promise((resolve, reject) => {
    response.write(value, (error) => error ? reject(error) : resolve());
  });
}

async function streamPlatformDataExport(response, corsOrigin, actorUserId) {
  const admin = getSupabaseAdmin();
  for (let offset = 0; offset < ENTITY_TABLES.length; offset += 5) {
    const batch = ENTITY_TABLES.slice(offset, offset + 5);
    const checks = await Promise.all(batch.map(async (table) => {
      const { error } = await admin.from(table).select("*", { head: true }).limit(0);
      return error ? { table, error } : null;
    }));
    const failed = checks.find(Boolean);
    if (failed) {
      const error = new Error(`database_export_table_unavailable:${failed.table}:${safeCode(failed.error)}`);
      error.code = "database_export_table_unavailable";
      throw error;
    }
  }

  const { data: audit, error: auditError } = await admin.from("platform_data_export_audit")
    .insert({ actor_user_id: actorUserId, status: "started" })
    .select("id")
    .single();
  if (auditError) throw auditError;

  const rowCounts = {};
  const exportedAt = new Date().toISOString();
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="adometa-data-export-${exportedAt.slice(0, 10)}.json"`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...(corsOrigin ? {
      "access-control-allow-origin": corsOrigin,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
      vary: "Origin",
    } : {}),
  });

  try {
    await writeDownloadChunk(response, JSON.stringify({
      format: "adometa-crm-data-export",
      version: 1,
      exportedAt,
      consistency: "Paginated logical export; writes may continue while the export is running.",
      includedTables: ENTITY_TABLES,
      excludedTables: EXCLUDED_TABLES,
    }).slice(0, -1) + ',"tables":{');

    for (let tableIndex = 0; tableIndex < ENTITY_TABLES.length; tableIndex += 1) {
      const table = ENTITY_TABLES[tableIndex];
      await writeDownloadChunk(response, `${tableIndex ? "," : ""}${JSON.stringify(table)}:[`);
      let rowCount = 0;
      for (let from = 0; ; from += exportPageSize) {
        let query = admin.from(table).select("*");
        for (const key of ENTITY_PRIMARY_KEYS[table]) query = query.order(key, { ascending: true });
        const { data, error } = await query.range(from, from + exportPageSize - 1);
        if (error) {
          const exportError = new Error(`database_export_table_failed:${table}:${safeCode(error)}`);
          exportError.code = "database_export_table_failed";
          throw exportError;
        }
        const rows = data ?? [];
        if (rows.length) {
          const serializedRows = rows.map((row) => JSON.stringify(stripSecrets(row))).join(",");
          await writeDownloadChunk(response, `${rowCount ? "," : ""}${serializedRows}`);
          rowCount += rows.length;
        }
        if (rows.length < exportPageSize) break;
      }
      rowCounts[table] = rowCount;
      await writeDownloadChunk(response, "]");
    }

    await writeDownloadChunk(response, `},"rowCounts":${JSON.stringify(rowCounts)}}\n`);
    const { error: completeError } = await admin.from("platform_data_export_audit")
      .update({ status: "completed", row_counts: rowCounts, completed_at: new Date().toISOString() })
      .eq("id", audit.id);
    if (completeError) throw completeError;
    response.end();
  } catch (error) {
    const { error: auditUpdateError } = await admin.from("platform_data_export_audit")
      .update({ status: "failed", row_counts: rowCounts, error_code: safeCode(error), completed_at: new Date().toISOString() })
      .eq("id", audit.id);
    if (auditUpdateError) console.error("Database export audit could not be updated:", safeCode(auditUpdateError));
    if (!response.destroyed) response.destroy();
    throw error;
  }
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
    if (url.pathname === "/public/plans" && request.method === "GET") {
      try {
        const { data, error } = await getSupabaseAdmin().from("subscription_plans")
          .select("code,name,description,currency_code,price_monthly,price_quarterly,price_half_yearly,price_yearly,max_users,max_salespeople,max_managers,max_leads,trial_days,validity_days,features")
          .eq("is_active", true)
          .order("price_monthly", { ascending: true });
        if (error) throw error;
        return json(response, 200, { plans: (data ?? []).map(publicPricingPlan) }, corsOrigin);
      } catch (error) {
        return json(response, 503, { error: "Configured plan information is temporarily unavailable.", errorCode: safeCode(error) }, corsOrigin);
      }
    }
    if (url.pathname === "/public/contact" && request.method === "POST") {
      try {
        const body = await readJson(request);
        const { value, error: validationError } = validateContactPayload(body);
        if (validationError) return json(response, 400, { error: validationError }, corsOrigin);
        const admin = getSupabaseAdmin();
        const { data: prior, error: priorError } = await admin.from("contact_submissions")
          .select("created_at").eq("idempotency_key", value.idempotencyKey).maybeSingle();
        if (priorError) throw priorError;
        if (prior?.created_at) {
          return json(response, 200, { accepted: true, createdAt: prior.created_at, whatsappNotification: "not_configured" }, corsOrigin);
        }
        if (!allowContactSubmission(value.email)) return json(response, 429, { error: "Too many enquiries from this email. Please try again later." }, corsOrigin);
        const recentSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count, error: rateError } = await admin.from("contact_submissions")
          .select("id", { count: "exact", head: true })
          .eq("email", value.email)
          .gte("created_at", recentSince);
        if (rateError) throw rateError;
        if ((count ?? 0) >= 3) return json(response, 429, { error: "An enquiry from this email was recently received. Please wait before submitting again." }, corsOrigin);
        const { data, error } = await admin.from("contact_submissions").upsert({
          full_name: value.fullName,
          mobile: value.mobile,
          email: value.email,
          company: value.company,
          subject: value.subject,
          message: value.message,
          idempotency_key: value.idempotencyKey,
        }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("created_at").maybeSingle();
        if (error) throw error;
        let createdAt = data?.created_at;
        if (!createdAt) {
          const { data: existing, error: lookupError } = await admin.from("contact_submissions")
            .select("created_at").eq("idempotency_key", value.idempotencyKey).maybeSingle();
          if (lookupError) throw lookupError;
          createdAt = existing?.created_at;
        }
        if (!createdAt) throw new Error("contact_submission_not_confirmed");
        return json(response, 201, { accepted: true, createdAt, whatsappNotification: "not_configured" }, corsOrigin);
      } catch (error) {
        const status = error?.message === "invalid_json" || error?.message === "request_too_large" ? 400 : 503;
        return json(response, status, {
          error: status === 400 ? "Invalid enquiry form data." : "Your enquiry could not be saved right now. Please try WhatsApp or submit again later.",
          errorCode: safeCode(error),
        }, corsOrigin);
      }
    }
    if (url.pathname === "/domains" || url.pathname.startsWith("/domains/")) return handleDomainRequest(request, response, url, corsOrigin);
    if (url.pathname === "/platform/users" || url.pathname.startsWith("/platform/users/")) {
      return platformUserRequest(request, response, url, corsOrigin);
    }
    if (request.method === "GET" && url.pathname === "/health/live") return json(response, 200, { status: "ok" }, corsOrigin);

    if (url.pathname === "/health/db" && request.method === "GET") {
      const access = await platformActor(request);
      if (access.response) return json(response, access.response.status, access.response.body, corsOrigin);
      try { return json(response, 200, await databaseStatus(access.actor.userId), corsOrigin); }
      catch (error) { return json(response, 503, { error: "Database health is unavailable", errorCode: safeCode(error) }, corsOrigin); }
    }

    if (request.method === "GET" && url.pathname === "/database/export") {
      const access = await platformActor(request);
      if (access.response) return json(response, access.response.status, access.response.body, corsOrigin);
      if (!allowDatabaseExport(access.actor.userId)) {
        return json(response, 429, { error: "A data export was recently requested. Please wait five minutes before retrying." }, corsOrigin);
      }
      try {
        await streamPlatformDataExport(response, corsOrigin, access.actor.userId);
      } catch (error) {
        if (!response.headersSent) {
          return json(response, 503, { error: "The CRM data export could not be completed.", errorCode: safeCode(error) }, corsOrigin);
        }
      }
      return;
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

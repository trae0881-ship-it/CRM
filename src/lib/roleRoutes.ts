import type { UserRole } from "../types/database";

export type DashboardView =
  | "Overview" | "Leads" | "Campaigns" | "Follow-ups" | "Calling" | "Teams" | "Reports"
  | "Integrations" | "Company" | "Site Visits" | "Bookings" | "Notifications" | "Statuses"
  | "Platform" | "Users" | "Growth Tools" | "License Register" | "Database Monitoring"
  | "Automation" | "Sales Pipeline" | "Customer 360" | "Organization Settings" | "Platform Settings";

export type PlatformAdminSection = "dashboard" | "companies" | "plans" | "subscriptions" | "workspaces";

export type DashboardRoute = {
  path: string;
  label: string;
  area: "saas" | "organization";
  view: DashboardView;
  roles: readonly UserRole[];
  section?: PlatformAdminSection;
};

const platformRoles = ["super_admin"] as const satisfies readonly UserRole[];
const organizationRoles = ["company_owner", "organization_admin", "manager", "agent", "auditor"] as const satisfies readonly UserRole[];
const ownersAndAdmins = ["company_owner", "organization_admin"] as const satisfies readonly UserRole[];
const organizationAdmins = ["organization_admin"] as const satisfies readonly UserRole[];
const teamManagers = ["company_owner", "organization_admin", "manager"] as const satisfies readonly UserRole[];
const operationalRoles = ["company_owner", "organization_admin", "manager", "agent"] as const satisfies readonly UserRole[];

export const dashboardRoutes: readonly DashboardRoute[] = [
  { path: "/saas/admin/dashboard", label: "Dashboard", area: "saas", view: "Platform", section: "dashboard", roles: platformRoles },
  { path: "/saas/admin/users", label: "Users", area: "saas", view: "Users", roles: platformRoles },
  { path: "/saas/admin/companies", label: "Companies", area: "saas", view: "Platform", section: "companies", roles: platformRoles },
  { path: "/saas/admin/plans", label: "Subscription Plans", area: "saas", view: "Platform", section: "plans", roles: platformRoles },
  { path: "/saas/admin/subscriptions", label: "Subscriptions", area: "saas", view: "Platform", section: "subscriptions", roles: platformRoles },
  { path: "/saas/admin/workspaces", label: "Workspace Requests", area: "saas", view: "Platform", section: "workspaces", roles: platformRoles },
  { path: "/saas/admin/domains", label: "Custom Domains", area: "saas", view: "Platform", roles: platformRoles },
  { path: "/saas/admin/domains/links", label: "Domain Links", area: "saas", view: "Platform", roles: platformRoles },
  { path: "/saas/admin/growth-tools", label: "Growth Tools", area: "saas", view: "Growth Tools", roles: platformRoles },
  { path: "/saas/admin/security", label: "Security & License Register", area: "saas", view: "License Register", roles: platformRoles },
  { path: "/saas/admin/database", label: "Database Monitoring", area: "saas", view: "Database Monitoring", roles: platformRoles },
  { path: "/saas/admin/settings", label: "Platform Settings", area: "saas", view: "Platform Settings", roles: platformRoles },
  { path: "/org/dashboard", label: "Dashboard", area: "organization", view: "Overview", roles: organizationRoles },
  { path: "/org/users", label: "Sales Team / Users", area: "organization", view: "Company", roles: ownersAndAdmins },
  { path: "/org/teams", label: "Teams", area: "organization", view: "Teams", roles: teamManagers },
  { path: "/org/leads", label: "Leads", area: "organization", view: "Leads", roles: organizationRoles },
  { path: "/org/campaigns", label: "Campaigns", area: "organization", view: "Campaigns", roles: organizationRoles },
  { path: "/org/reports", label: "Reports", area: "organization", view: "Reports", roles: organizationRoles },
  { path: "/org/settings", label: "Organization Settings", area: "organization", view: "Organization Settings", roles: ownersAndAdmins },
  { path: "/org/calling", label: "Calling", area: "organization", view: "Calling", roles: organizationRoles },
  { path: "/org/follow-ups", label: "Follow-ups", area: "organization", view: "Follow-ups", roles: organizationRoles },
  { path: "/org/pipeline", label: "Pipeline", area: "organization", view: "Sales Pipeline", roles: operationalRoles },
  { path: "/org/customer-360", label: "Customer 360", area: "organization", view: "Customer 360", roles: organizationRoles },
  { path: "/org/automations", label: "Automations", area: "organization", view: "Automation", roles: teamManagers },
  { path: "/org/integrations", label: "Integrations", area: "organization", view: "Integrations", roles: organizationAdmins },
  { path: "/org/site-visits", label: "Site Visits", area: "organization", view: "Site Visits", roles: organizationRoles },
  { path: "/org/bookings", label: "Bookings", area: "organization", view: "Bookings", roles: organizationRoles },
  { path: "/org/notifications", label: "Notifications", area: "organization", view: "Notifications", roles: organizationRoles },
  { path: "/org/statuses", label: "Lead Statuses", area: "organization", view: "Statuses", roles: ownersAndAdmins },
];

export function normalizePathname(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized || "/";
}

export function resolveDashboardRoute(path: string): DashboardRoute | null {
  const normalizedPath = normalizePathname(path);
  return dashboardRoutes.find((route) => route.path === normalizedPath) ?? null;
}

export function isSaasAdminPath(path: string) {
  const normalizedPath = normalizePathname(path);
  return normalizedPath === "/saas/admin" || normalizedPath.startsWith("/saas/admin/");
}

export function isOrganizationPath(path: string) {
  const normalizedPath = normalizePathname(path);
  return normalizedPath === "/org" || normalizedPath.startsWith("/org/");
}

export function isMalformedOrganizationPath(path: string) {
  return /^\/org\/(?:undefined|null)(?:\/|$)/i.test(normalizePathname(path));
}

export function getRoleDashboardPath(role: UserRole) {
  return role === "super_admin" ? "/saas/admin/dashboard" : "/org/dashboard";
}

export function canAccessDashboardRoute(path: string, role: UserRole, isActive: boolean) {
  const route = resolveDashboardRoute(path);
  return Boolean(isActive && route && route.roles.includes(role));
}

import type { Membership } from "../services/workspace";

export type DocumentationCenterId = "salesperson" | "organization_admin" | "saas_super_admin";
export type DocumentationRoute = "/docs" | "/admin/docs" | "/saas/admin/docs";

const routeCenters: Record<DocumentationRoute, DocumentationCenterId> = {
  "/docs": "salesperson",
  "/admin/docs": "organization_admin",
  "/saas/admin/docs": "saas_super_admin",
};

const memberRoles: Membership["role"][] = [
  "super_admin", "company_owner", "organization_admin", "manager", "agent", "auditor",
];

export function getDocumentationCenter(path: string): DocumentationCenterId | null {
  return routeCenters[path as DocumentationRoute] ?? null;
}

export function canAccessDocumentation(path: string, membership: Membership | null): boolean {
  if (!membership?.is_active) return false;
  const center = getDocumentationCenter(path);
  if (center === "salesperson") return memberRoles.includes(membership.role);
  if (center === "organization_admin") return membership.role === "company_owner" || membership.role === "organization_admin";
  if (center === "saas_super_admin") return membership.role === "super_admin";
  return false;
}

export function getDocumentationRedirectPath(path: string, membership: Membership | null): string | null {
  const center = getDocumentationCenter(path);
  if (!center || canAccessDocumentation(path, membership)) return null;
  if (!membership?.is_active) return "/login";
  if (membership.role === "super_admin") return "/saas/admin/docs";
  if (membership.role === "company_owner" || membership.role === "organization_admin") return "/admin/docs";
  return "/docs";
}

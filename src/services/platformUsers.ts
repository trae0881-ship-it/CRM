import { supabase } from "../lib/supabase";

const apiOrigin = import.meta.env.VITE_DATABASE_API_URL?.trim().replace(/\/+$/, "") ?? "";

export type PlatformAssignableRole = "company_owner" | "organization_admin" | "manager" | "agent";
export type PlatformDirectoryRole = PlatformAssignableRole | "super_admin" | "auditor";
export type PlatformEditableRole = Exclude<PlatformDirectoryRole, "super_admin">;
export type PlatformUserStatus = "active" | "inactive" | "invited";

export type PlatformUser = {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  organizationId: string;
  organizationName: string;
  role: PlatformDirectoryRole;
  membershipActive: boolean;
  status: PlatformUserStatus;
  isBanned: boolean;
  emailConfirmedAt: string | null;
  createdAt: string;
  membershipCreatedAt: string;
  lastSignInAt: string | null;
};

export type PlatformUserFilters = {
  search: string;
  companyId: string;
  role: string;
  status: string;
  page: number;
  pageSize: number;
};

export type AddPlatformUserInput = {
  fullName: string;
  email: string;
  phone: string;
  companyId: string;
  role: PlatformAssignableRole;
  isActive: boolean;
  sendInvitation: boolean;
};

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (!apiOrigin) throw new Error("User management API is not configured. Set VITE_DATABASE_API_URL.");
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
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || "The user management operation could not be completed.");
  return result as T;
}

export async function listPlatformUsers(filters: PlatformUserFilters) {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.companyId) query.set("companyId", filters.companyId);
  if (filters.role) query.set("role", filters.role);
  if (filters.status) query.set("status", filters.status);
  query.set("page", String(filters.page));
  query.set("pageSize", String(filters.pageSize));
  return request<{ users: PlatformUser[]; totalCount: number; page: number; pageSize: number }>(`/platform/users?${query}`);
}

export async function addPlatformUser(input: AddPlatformUserInput) {
  return request<{ userId: string; assignedExistingUser: boolean; invitationSent: boolean }>("/platform/users", "POST", input);
}

export async function updatePlatformUserMembership(
  userId: string,
  organizationId: string,
  patch: { fullName: string; phone: string; role: PlatformEditableRole; isActive: boolean },
) {
  return request<{ userId: string; organizationId: string }>(
    `/platform/users/${encodeURIComponent(userId)}/memberships/${encodeURIComponent(organizationId)}`,
    "PATCH",
    patch,
  );
}

export async function updatePlatformUserAccountStatus(userId: string, accountActive: boolean) {
  return request<{ userId: string; accountActive: boolean }>(
    `/platform/users/${encodeURIComponent(userId)}/account-status`,
    "PATCH",
    { accountActive },
  );
}

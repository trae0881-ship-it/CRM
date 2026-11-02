import { supabase } from "../lib/supabase";
import type { UserRole } from "../types/database";

export type Membership = { organization_id: string; user_id: string; role: UserRole; is_active: boolean };
export type Team = { id: string; name: string; manager_id: string | null; is_active: boolean; created_at: string };
export type OrganizationMember = { organization_id: string; user_id: string; role: UserRole; is_active: boolean; profiles: { full_name: string } | null };
export type OrganizationProfile = { id: string; name: string; slug: string; is_active: boolean; created_at: string };
export type WorkspaceSummary = { organizationName: string; employees: number; teams: number; leads: number; bookings: number; calls: number };
export type PersonalPerformance = { assignedLeads: number; newLeads: number; contactedLeads: number; calls: number; followUpsDue: number; followUpsCompleted: number; visitsScheduled: number; visitsCompleted: number; bookings: number; lostLeads: number };

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export async function getCurrentMembership(): Promise<Membership | null> {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const { data, error } = await client.from("organization_members").select("organization_id,user_id,role,is_active").eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (error) throw error;
  return data as Membership | null;
}

export async function getOrganizationProfile(organizationId: string): Promise<OrganizationProfile> {
  const { data, error } = await requireClient().from("organizations").select("id,name,slug,is_active,created_at").eq("id", organizationId).single();
  if (error) throw error;
  return data as OrganizationProfile;
}

export async function updateOrganizationProfile(organizationId: string, name: string) {
  const { data, error } = await requireClient().rpc("update_organization_profile", { target_organization: organizationId, target_name: name.trim() });
  if (error) throw error;
  return data as OrganizationProfile;
}

export async function getWorkspaceSummary(organizationId: string): Promise<WorkspaceSummary> {
  const client = requireClient();
  const [organization, employees, teams, leads, bookings, calls] = await Promise.all([
    client.from("organizations").select("name").eq("id", organizationId).single(),
    client.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true),
    client.from("teams").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true),
    client.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    client.from("bookings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "cancelled"),
    client.from("calls").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);
  const failure = [organization, employees, teams, leads, bookings, calls].find((result) => result.error);
  if (failure?.error) throw failure.error;
  if (!organization.data) throw new Error("Organization record was not found.");
  return {
    organizationName: organization.data.name,
    employees: employees.count ?? 0,
    teams: teams.count ?? 0,
    leads: leads.count ?? 0,
    bookings: bookings.count ?? 0,
    calls: calls.count ?? 0,
  };
}

export async function listTeams(organizationId: string): Promise<Team[]> {
  const { data, error } = await requireClient().from("teams").select("id,name,manager_id,is_active,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function createTeam(organizationId: string, name: string): Promise<Team> {
  const { data, error } = await requireClient().from("teams").insert({ organization_id: organizationId, name: name.trim() }).select("id,name,manager_id,is_active,created_at").single();
  if (error) throw error;
  return data as Team;
}

export async function inviteMember(organizationId: string, email: string, role: Exclude<UserRole, "super_admin">) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("invite-member", { body: { organizationId, email: email.trim(), role } });
  if (error) throw error;
  return data;
}

export async function listOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const { data, error } = await requireClient().from("organization_members").select("organization_id,user_id,role,is_active,profiles(full_name)").eq("organization_id", organizationId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => ({ organization_id: String(row.organization_id), user_id: String(row.user_id), role: row.role as UserRole, is_active: Boolean(row.is_active), profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) as { full_name: string } | null : row.profiles as { full_name: string } | null }));
}

export async function updateOrganizationMember(organizationId: string, userId: string, patch: { role?: Exclude<UserRole, "super_admin">; is_active?: boolean }) {
  const current = await requireClient().from("organization_members").select("role,is_active").eq("organization_id", organizationId).eq("user_id", userId).single();
  if (current.error) throw current.error;
  const { error } = await requireClient().rpc("update_organization_member", {
    target_organization: organizationId,
    target_user: userId,
    target_role: patch.role ?? current.data.role,
    target_active: patch.is_active ?? current.data.is_active,
  });
  if (error) throw error;
  const { data, error: reloadError } = await requireClient().from("organization_members").select("organization_id,user_id,role,is_active,profiles(full_name)").eq("organization_id", organizationId).eq("user_id", userId).single();
  if (reloadError) throw reloadError;
  return { ...data, profiles: Array.isArray(data.profiles) ? (data.profiles[0] ?? null) as { full_name: string } | null : data.profiles as { full_name: string } | null } as OrganizationMember;
}

export async function assignTeamManager(teamId: string, managerId: string | null) {
  const { data, error } = await requireClient().rpc("assign_team_manager", { target_team: teamId, target_manager: managerId });
  if (error) throw error;
  return data as Team;
}

export async function getPersonalPerformance(organizationId: string, userId: string): Promise<PersonalPerformance> {
  const client = requireClient();
  const [leads, calls, due, completed, scheduledVisits, completedVisits, bookings] = await Promise.all([
    client.from("leads").select("status", { count: "exact" }).eq("organization_id", organizationId).eq("assigned_to", userId).is("deleted_at", null),
    client.from("calls").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("agent_id", userId),
    client.from("follow_up_tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("assigned_to", userId).eq("status", "open").lte("due_at", new Date().toISOString()),
    client.from("follow_up_tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("assigned_to", userId).eq("status", "completed"),
    client.from("site_visits").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("assigned_to", userId).eq("status", "scheduled"),
    client.from("site_visits").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("assigned_to", userId).eq("status", "completed"),
    client.from("bookings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("owner_id", userId).neq("status", "cancelled"),
  ]);
  const failure = [leads, calls, due, completed, scheduledVisits, completedVisits, bookings].find((result) => result.error);
  if (failure?.error) throw failure.error;
  const statuses = (leads.data ?? []) as Array<{ status: string }>;
  return {
    assignedLeads: leads.count ?? 0,
    newLeads: statuses.filter((lead) => lead.status === "new").length,
    contactedLeads: statuses.filter((lead) => lead.status === "contacted").length,
    calls: calls.count ?? 0,
    followUpsDue: due.count ?? 0,
    followUpsCompleted: completed.count ?? 0,
    visitsScheduled: scheduledVisits.count ?? 0,
    visitsCompleted: completedVisits.count ?? 0,
    bookings: bookings.count ?? 0,
    lostLeads: statuses.filter((lead) => lead.status === "lost").length,
  };
}

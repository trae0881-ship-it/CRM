import { supabase } from "../lib/supabase";
import type { BookingStatus, FollowUpStatus, VisitStatus } from "../lib/operations";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured. Configure the workspace before using this module.");
  return supabase;
};

export type SiteVisit = { id: string; organization_id: string; lead_id: string; assigned_to: string | null; scheduled_at: string; status: VisitStatus; location: string | null; notes: string | null; outcome: string | null; cancellation_reason: string | null };
export type Booking = { id: string; organization_id: string; lead_id: string; owner_id: string | null; project_name: string | null; booking_reference: string | null; booked_at: string; value: number | null; payment_amount: number; pending_amount: number; status: BookingStatus; notes: string | null };
export type FollowUpTask = { id: string; organization_id: string; lead_id: string | null; assigned_to: string | null; title: string; due_at: string; priority: "low" | "medium" | "high"; status: FollowUpStatus; notes: string | null; outcome: string | null };
export type Notification = { id: string; title: string; body: string; type: string; entity_type: string | null; entity_id: string | null; read_at: string | null; created_at: string };
export type LeadStatusConfig = { id: string; organization_id: string; name: string; color: string; requires_follow_up: boolean; requires_reason: boolean; category: "open" | "won" | "lost"; position: number; is_active: boolean; is_default: boolean };

export async function listSiteVisits(organizationId: string) {
  const { data, error } = await client().from("site_visits").select("*").eq("organization_id", organizationId).order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SiteVisit[];
}

export async function createSiteVisit(input: Pick<SiteVisit, "organization_id" | "lead_id" | "assigned_to" | "scheduled_at" | "location" | "notes">) {
  const { data, error } = await client().from("site_visits").insert({ ...input, status: "scheduled" }).select("*").single();
  if (error) throw error;
  return data as SiteVisit;
}

export async function updateSiteVisit(id: string, patch: Partial<Pick<SiteVisit, "status" | "scheduled_at" | "location" | "notes" | "outcome" | "cancellation_reason">>) {
  const { data, error } = await client().from("site_visits").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as SiteVisit;
}

export async function listBookings(organizationId: string) {
  const { data, error } = await client().from("bookings").select("*").eq("organization_id", organizationId).order("booked_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function createBooking(input: Pick<Booking, "organization_id" | "lead_id" | "owner_id" | "project_name" | "booking_reference" | "value" | "payment_amount" | "notes">) {
  const { data, error } = await client().from("bookings").insert({ ...input, pending_amount: Math.max(0, Number(input.value ?? 0) - Number(input.payment_amount ?? 0)), status: "pending" }).select("*").single();
  if (error) throw error;
  return data as Booking;
}

export async function updateBooking(id: string, patch: Partial<Pick<Booking, "status" | "payment_amount" | "pending_amount" | "notes">>) {
  const { data, error } = await client().from("bookings").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Booking;
}

export async function listFollowUps(organizationId: string) {
  const { data, error } = await client().from("follow_up_tasks").select("*").eq("organization_id", organizationId).order("due_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FollowUpTask[];
}

export async function createFollowUp(input: Pick<FollowUpTask, "organization_id" | "lead_id" | "assigned_to" | "title" | "due_at" | "priority">) {
  const { data, error } = await client().from("follow_up_tasks").insert({ ...input, status: "open" }).select("*").single();
  if (error) throw error;
  return data as FollowUpTask;
}

export async function updateFollowUp(id: string, status: FollowUpStatus, notes = "", outcome = "", cancellationReason = "") {
  const { error } = await client().rpc("update_follow_up_task", { target_task: id, next_status: status, task_notes: notes, task_outcome: outcome, cancellation_reason: cancellationReason });
  if (error) throw error;
}

export async function listNotifications() {
  const { data, error } = await client().from("notifications").select("id,title,body,type,entity_type,entity_id,read_at,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(id: string) {
  const { error } = await client().rpc("mark_notification_read", { target_notification: id });
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await client().rpc("mark_all_notifications_read");
  if (error) throw error;
}

export async function listLeadStatuses(organizationId: string) {
  const { data, error } = await client().from("lead_statuses").select("*").eq("organization_id", organizationId).order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LeadStatusConfig[];
}

export async function saveLeadStatus(input: Partial<LeadStatusConfig> & Pick<LeadStatusConfig, "organization_id" | "name">) {
  const { data, error } = await client().from("lead_statuses").upsert(input).select("*").single();
  if (error) throw error;
  return data as LeadStatusConfig;
}

export async function archiveLeadStatus(id: string) {
  const { error } = await client().from("lead_statuses").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

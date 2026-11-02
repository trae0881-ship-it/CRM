import { supabase } from "../lib/supabase";
import { toCsv, toSimplePdf, type ReportRow } from "../lib/reports";
import { toXlsx } from "../lib/xlsx";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export async function fetchPersonalLeadReport(organizationId: string, userId: string): Promise<ReportRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("leads").select("external_id,full_name,phone,source,status,priority,assigned_to,original_assigned_to,created_at,next_follow_up_at").eq("organization_id", organizationId).or(`assigned_to.eq.${userId},original_assigned_to.eq.${userId}`);
  if (error) throw error;
  return (data ?? []) as ReportRow[];
}

export async function fetchAuthorizedLeadReport(organizationId: string, userId?: string): Promise<ReportRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  let query = supabase.from("leads").select("external_id,full_name,phone,source,status,priority,assigned_to,original_assigned_to,created_at,next_follow_up_at,campaign_id").eq("organization_id", organizationId).is("deleted_at", null);
  if (userId) query = query.or(`assigned_to.eq.${userId},original_assigned_to.eq.${userId}`);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReportRow[];
}

export function reportFile(rows: ReportRow[], format: ExportFormat, title = "Adometa CRM Report") {
  const columns = ["external_id", "full_name", "phone", "source", "status", "priority", "assigned_to", "original_assigned_to", "created_at", "next_follow_up_at"];
  if (format === "csv") return { body: toCsv(rows, columns), type: "text/csv", extension: "csv" };
  if (format === "xlsx") return { body: toXlsx(rows, columns, title), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  return { body: toSimplePdf(rows, columns), type: "application/pdf", extension: "pdf" };
}

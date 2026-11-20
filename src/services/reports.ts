import { supabase } from "../lib/supabase";
import { toCsv, toSimplePdf, type ReportRow } from "../lib/reports";
import { toXlsx } from "../lib/xlsx";

export type ExportFormat = "csv" | "xlsx" | "pdf";

function addAgencyNames<T extends { custom_fields?: Record<string, unknown> | null }>(rows: T[]): ReportRow[] {
  return rows.map((row) => {
    const storedAgencies = row.custom_fields?._google_sheet_agencies;
    const agencyNames = storedAgencies && typeof storedAgencies === "object" && !Array.isArray(storedAgencies)
      ? Object.values(storedAgencies).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : typeof row.custom_fields?.agency === "string" && row.custom_fields.agency.trim()
        ? [row.custom_fields.agency]
        : [];
    return { ...row, agency: agencyNames.join(" · "), agency_names: JSON.stringify([...new Set(agencyNames)]) } as ReportRow;
  });
}

export async function fetchPersonalLeadReport(organizationId: string, userId: string): Promise<ReportRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("leads").select("external_id,full_name,phone,source,status,priority,assigned_to,original_assigned_to,created_at,next_follow_up_at,custom_fields").eq("organization_id", organizationId).or(`assigned_to.eq.${userId},original_assigned_to.eq.${userId}`);
  if (error) throw error;
  return addAgencyNames(data ?? []);
}

export async function fetchAuthorizedLeadReport(organizationId: string, userId?: string): Promise<ReportRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  let query = supabase.from("leads").select("external_id,full_name,phone,source,status,priority,assigned_to,original_assigned_to,created_at,next_follow_up_at,campaign_id,custom_fields").eq("organization_id", organizationId).is("deleted_at", null);
  if (userId) query = query.or(`assigned_to.eq.${userId},original_assigned_to.eq.${userId}`);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return addAgencyNames(data ?? []);
}

export function reportFile(rows: ReportRow[], format: ExportFormat, title = "Adometa CRM Report") {
  const columns = ["external_id", "full_name", "phone", "agency", "source", "status", "priority", "assigned_to", "original_assigned_to", "created_at", "next_follow_up_at"];
  if (format === "csv") return { body: toCsv(rows, columns), type: "text/csv", extension: "csv" };
  if (format === "xlsx") return { body: toXlsx(rows, columns, title), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  return { body: toSimplePdf(rows, columns), type: "application/pdf", extension: "pdf" };
}

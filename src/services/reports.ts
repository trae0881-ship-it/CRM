import { supabase } from "../lib/supabase";
import { toCsv, toSimplePdf, type ReportRow } from "../lib/reports";
import { toXlsx } from "../lib/xlsx";

export type ExportFormat = "csv" | "xlsx" | "pdf";
export type FollowUpReportRow = {
  id: string;
  lead_id: string | null;
  assigned_to: string | null;
  title: string;
  due_at: string;
  priority: string;
  status: string;
  notes: string | null;
  outcome: string | null;
};

const reportPageSize = 1000;

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
  const allData = [];
  for (let from = 0; ; from += reportPageSize) {
    const { data, error } = await supabase.from("leads")
      .select("id,external_id,full_name,phone,source,status,priority,assigned_to,original_assigned_to,created_at,next_follow_up_at,campaign_id,custom_fields")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`assigned_to.eq.${userId},original_assigned_to.eq.${userId}`)
      .order("created_at", { ascending: false })
      .range(from, from + reportPageSize - 1);
    if (error) throw error;
    allData.push(...(data ?? []));
    if ((data ?? []).length < reportPageSize) break;
  }
  return addAgencyNames(allData);
}

export async function fetchAuthorizedLeadReport(organizationId: string, userId?: string): Promise<ReportRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const allData = [];
  for (let from = 0; ; from += reportPageSize) {
    let query = supabase.from("leads")
      .select("id,external_id,full_name,phone,source,status,priority,assigned_to,original_assigned_to,created_at,next_follow_up_at,campaign_id,custom_fields")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (userId) query = query.or(`assigned_to.eq.${userId},original_assigned_to.eq.${userId}`);
    const { data, error } = await query.order("created_at", { ascending: false }).range(from, from + reportPageSize - 1);
    if (error) throw error;
    allData.push(...(data ?? []));
    if ((data ?? []).length < reportPageSize) break;
  }
  return addAgencyNames(allData);
}

export async function fetchAuthorizedFollowUpReport(organizationId: string): Promise<FollowUpReportRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const allData: FollowUpReportRow[] = [];
  for (let from = 0; ; from += reportPageSize) {
    const { data, error } = await supabase.from("follow_up_tasks")
      .select("id,lead_id,assigned_to,title,due_at,priority,status,notes,outcome")
      .eq("organization_id", organizationId)
      .order("due_at", { ascending: true })
      .range(from, from + reportPageSize - 1);
    if (error) throw error;
    allData.push(...(data ?? []) as FollowUpReportRow[]);
    if ((data ?? []).length < reportPageSize) break;
  }
  return allData;
}

export function reportFile(rows: ReportRow[], format: ExportFormat, title = "Adometa CRM Report", columns = ["external_id", "full_name", "phone", "agency", "campaign", "source", "status", "priority", "assigned_to", "original_assigned_to", "created_at", "next_follow_up_at"]) {
  if (format === "csv") return { body: toCsv(rows, columns), type: "text/csv", extension: "csv" };
  if (format === "xlsx") return { body: toXlsx(rows, columns, title), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  return { body: toSimplePdf(rows, columns), type: "application/pdf", extension: "pdf" };
}

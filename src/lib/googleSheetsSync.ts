export type GoogleLeadMapping = {
  full_name: string;
  phone?: string;
  email?: string;
  company?: string;
  city?: string;
  state?: string;
  source?: string;
  campaign?: string;
  requirement?: string;
  notes?: string;
  source_id?: string;
  visible_columns?: string[];
};

export type GoogleSpreadsheetReference = {
  spreadsheetId: string;
  worksheetId: string | null;
};

export function googleSheetsErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message.trim() : "";
    const code = typeof record.code === "string" ? record.code : "";
    if (code === "PGRST204" || /could not find the ['"]agency_name['"] column.*schema cache/i.test(message)) {
      return "Google Sheets database setup is incomplete: the agency_name column is missing from Supabase. Apply migration 20261121120500_repair_google_sheet_agency_schema.sql in the same project as this app, then retry. The migration refreshes the API schema cache.";
    }
    const details = ["message", "details", "hint"]
      .map((key) => {
        const value = record[key];
        return typeof value === "string" ? value.trim() : "";
      })
      .filter(Boolean);
    if (details.length) return [...new Set(details)].join(" — ");
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function parseGoogleSpreadsheetReference(input: string): GoogleSpreadsheetReference {
  const value = input.trim();
  if (!value) throw new Error("Paste a Google Sheets link or spreadsheet ID.");

  if (/^[\w-]+$/.test(value)) return { spreadsheetId: value, worksheetId: null };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid Google Sheets link or spreadsheet ID.");
  }

  const match = url.protocol === "https:" && url.hostname === "docs.google.com"
    ? url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/)
    : null;
  if (!match) throw new Error("Use a Google Sheets link in the format docs.google.com/spreadsheets/d/...");
  const fragment = new URLSearchParams(url.hash.slice(1));
  const rawWorksheetId = url.searchParams.get("gid") ?? fragment.get("gid");
  return {
    spreadsheetId: match[1],
    worksheetId: rawWorksheetId && /^\d+$/.test(rawWorksheetId) ? rawWorksheetId : null,
  };
}

export function normalizeGoogleSpreadsheetId(input: string): string {
  return parseGoogleSpreadsheetReference(input).spreadsheetId;
}

export function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}

export function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function mapGoogleLeadRow(row: Record<string, unknown>, mapping: GoogleLeadMapping) {
  const fullName = String(row[mapping.full_name] ?? "").trim();
  if (!fullName) throw new Error("Full Name is required.");
  const phone = mapping.phone ? normalizePhone(row[mapping.phone]) : null;
  const email = mapping.email ? normalizeEmail(row[mapping.email]) : null;
  if (mapping.phone && row[mapping.phone] && !phone) throw new Error("Invalid phone number.");
  if (mapping.email && row[mapping.email] && !email) throw new Error("Invalid email address.");
  return {
    full_name: fullName,
    phone,
    email,
    city: mapping.city ? String(row[mapping.city] ?? "").trim() || null : null,
    state: mapping.state ? String(row[mapping.state] ?? "").trim() || null : null,
    source: mapping.source ? String(row[mapping.source] ?? "").trim() || "google_sheets" : "google_sheets",
    custom_fields: {
      campaign: mapping.campaign ? String(row[mapping.campaign] ?? "").trim() : "",
      requirement: mapping.requirement ? String(row[mapping.requirement] ?? "").trim() : "",
      notes: mapping.notes ? String(row[mapping.notes] ?? "").trim() : "",
    },
    sourceId: mapping.source_id ? String(row[mapping.source_id] ?? "").trim() || null : null,
  };
}

export function sourceRowKey(spreadsheetId: string, worksheetId: string, rowNumber: number, row: ReturnType<typeof mapGoogleLeadRow>) {
  return `${spreadsheetId}:${worksheetId}:${row.sourceId || `${row.email || ""}:${row.phone || ""}:${row.full_name.toLowerCase()}`}:${rowNumber}`;
}

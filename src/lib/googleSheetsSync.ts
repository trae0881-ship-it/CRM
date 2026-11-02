export type GoogleLeadMapping = {
  full_name: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  source?: string;
  campaign?: string;
  requirement?: string;
  notes?: string;
  source_id?: string;
};

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

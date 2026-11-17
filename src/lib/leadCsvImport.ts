import { normalizeEmail, normalizePhone } from "./googleSheetsSync";
import type { LeadStatus } from "../types/database";

export type LeadCsvRecord = {
  full_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  source: string;
  status: LeadStatus;
};

export type LeadCsvRow = { rowNumber: number; lead: LeadCsvRecord | null; errors: string[] };
export type LeadCsvPreview = { headers: string[]; rows: LeadCsvRow[] };

const columnAliases: Record<string, keyof LeadCsvRecord> = {
  name: "full_name",
  full_name: "full_name",
  fullname: "full_name",
  phone: "phone",
  mobile: "phone",
  phone_number: "phone",
  email: "email",
  company: "company",
  city: "city",
  state: "state",
  source: "source",
  status: "status",
};

const statuses: Record<string, LeadStatus> = {
  new: "new",
  contacted: "contacted",
  qualified: "qualified",
  follow_up: "follow_up",
  won: "won",
  lost: "lost",
};

function parseRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function normalizedHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function parseLeadCsv(text: string, maximumRows = 2000): LeadCsvPreview {
  const records = parseRecords(text);
  if (records.length < 2) throw new Error("CSV needs a header row and at least one lead row.");
  if (records.length - 1 > maximumRows) throw new Error(`CSV is limited to ${maximumRows} data rows per import.`);

  const headers = records[0].map((header) => header.trim());
  const columns = headers.map((header) => columnAliases[normalizedHeader(header)] || null);
  if (!columns.includes("full_name")) throw new Error("Add a Name or Full Name column to the CSV.");
  const seenContacts = new Set<string>();

  const rows = records.slice(1).map((cells, rowIndex): LeadCsvRow => {
    const rowNumber = rowIndex + 2;
    const errors: string[] = [];
    if (cells.length > headers.length) errors.push("Row has more values than the header.");
    const values: Partial<Record<keyof LeadCsvRecord, string>> = {};
    columns.forEach((column, index) => {
      if (column && values[column] === undefined) values[column] = (cells[index] ?? "").trim();
    });

    const fullName = values.full_name || "";
    if (!fullName) errors.push("Name is required.");
    if (fullName.length > 200) errors.push("Name must be 200 characters or fewer.");
    const rawPhone = values.phone || "";
    const rawEmail = values.email || "";
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    if (rawPhone && !phone) errors.push("Phone number is invalid.");
    if (rawEmail && !email) errors.push("Email address is invalid.");
    const rawStatus = (values.status || "new").toLowerCase().trim().replace(/[\s-]+/g, "_");
    const status = statuses[rawStatus];
    if (!status) errors.push("Status must be New, Contacted, Qualified, Follow-up, Won, or Lost.");

    const contactKeys = [email && `email:${email}`, phone && `phone:${phone}`].filter((key): key is string => Boolean(key));
    if (contactKeys.some((key) => seenContacts.has(key))) errors.push("Duplicate email or phone number in this CSV.");
    if (!errors.length) contactKeys.forEach((key) => seenContacts.add(key));

    if (errors.length || !status) return { rowNumber, lead: null, errors };
    return {
      rowNumber,
      lead: {
        full_name: fullName,
        phone,
        email,
        company: values.company || null,
        city: values.city || null,
        state: values.state || null,
        source: values.source || "csv_import",
        status,
      },
      errors,
    };
  });

  return { headers, rows };
}

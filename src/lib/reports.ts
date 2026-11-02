export type ReportRow = Record<string, string | number | null | undefined>;

const spreadsheetSafe = (value: ReportRow[string]) => {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};
const escape = (value: ReportRow[string]) => `"${spreadsheetSafe(value).replace(/"/g, '""')}"`;
const htmlEscape = (value: ReportRow[string]) => spreadsheetSafe(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function toCsv(rows: ReportRow[], columns: string[]) {
  return [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((row) => row.map(escape).join(",")).join("\r\n");
}

export function toExcelHtml(rows: ReportRow[], columns: string[]) {
  const head = columns.map((column) => `<th>${htmlEscape(column)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map((column) => `<td>${htmlEscape(row[column])}</td>`).join("")}</tr>`).join("");
  return `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function toSimplePdf(rows: ReportRow[], columns: string[]) {
  const text = [columns.join(" | "), ...rows.map((row) => columns.map((column) => String(row[column] ?? "")).join(" | "))].join("\n");
  const stream = `BT /F1 8 Tf 36 760 Td (${text.replace(/[\\()]/g, "\\$&").replace(/\n/g, ") Tj 0 -12 Td (")}) Tj ET`;
  const objects = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets[index + 1] = pdf.length; pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

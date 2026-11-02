export type PipelineStage = { id: string; name: string; category: "open" | "won" | "lost"; position: number; requiresReason: boolean };

export function validateStageChange(current: PipelineStage, next: PipelineStage, lostReason = "") {
  if (current.id === next.id) return;
  if (current.category === "won" || current.category === "lost") throw new Error("A closed deal cannot move to another pipeline stage.");
  if (next.category === "lost" && !lostReason.trim()) throw new Error("A lost reason is required.");
}

export type CustomerMatch = { id: string; phone: string | null; email: string | null };
export function normalizeCustomerValue(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9@+]/g, "");
}
export function findPossibleCustomerMatches(input: { phone?: string | null; email?: string | null }, existing: CustomerMatch[]) {
  const phone = normalizeCustomerValue(input.phone);
  const email = normalizeCustomerValue(input.email);
  return existing.filter((customer) => (phone && normalizeCustomerValue(customer.phone) === phone) || (email && normalizeCustomerValue(customer.email) === email));
}

export function calculateTargetAchievement(actual: number, target: number) {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target < 0) throw new Error("Target values must be valid non-negative numbers.");
  return target === 0 ? 0 : Math.round((actual / target) * 10000) / 100;
}

export function calculateCommission(baseAmount: number, ratePercent: number) {
  if (!Number.isFinite(baseAmount) || baseAmount < 0 || !Number.isFinite(ratePercent) || ratePercent < 0) throw new Error("Commission values must be valid non-negative numbers.");
  return Math.round(baseAmount * ratePercent) / 100;
}

export type ImportRow = Record<string, string>;
export function validateImportRows(rows: ImportRow[], requiredColumns: string[]) {
  const invalid: Array<{ row: number; errors: string[] }> = [];
  rows.forEach((row, index) => {
    const errors = requiredColumns.filter((column) => !String(row[column] || "").trim()).map((column) => `${column} is required.`);
    if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) errors.push("Email address is invalid.");
    if (errors.length) invalid.push({ row: index + 2, errors });
  });
  return { validRows: rows.length - invalid.length, invalid };
}

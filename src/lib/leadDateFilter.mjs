const dayInMilliseconds = 24 * 60 * 60 * 1000;

function localDateStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid date.");
  const date = new Date(`${value}T00:00:00`);
  const [year, month, day] = value.split("-").map(Number);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Choose a valid date.");
  }
  return date;
}

export function getLeadDateBounds(filter, startDate = "", endDate = "", now = new Date()) {
  if (filter === "all") return {};

  if (filter === "new" || filter === "old") {
    const cutoff = new Date(now.getTime() - 7 * dayInMilliseconds).toISOString();
    return filter === "new" ? { createdAfter: cutoff } : { createdBefore: cutoff };
  }

  if (!startDate && !endDate) throw new Error("Choose at least one date for the custom range.");

  const start = startDate ? localDateStart(startDate) : null;
  const end = endDate ? localDateStart(endDate) : null;
  if (start && end && start > end) throw new Error("The start date must be on or before the end date.");

  const bounds = {};
  if (start) bounds.createdAfter = start.toISOString();
  if (end) {
    end.setDate(end.getDate() + 1);
    bounds.createdBefore = end.toISOString();
  }
  return bounds;
}

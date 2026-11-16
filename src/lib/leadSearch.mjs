export function buildLeadSearchFilter(search) {
  const escaped = search.trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[%_]/g, "\\$&");
  const pattern = `"%${escaped}%"`;
  return `full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`;
}

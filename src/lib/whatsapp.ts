export function renderWhatsAppTemplate(template: string, fields: Record<string, string | undefined>) {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key: string) => fields[key] ?? "");
}

export function personalWhatsAppUrl(phone: string, body: string) {
  const normalized = phone.replace(/[^\d]/g, "");
  if (!normalized) throw new Error("A valid phone number is required.");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(body)}`;
}

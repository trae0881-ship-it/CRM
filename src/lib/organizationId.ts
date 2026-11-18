const organizationIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function isOrganizationId(value: unknown): value is string {
  return typeof value === "string" && organizationIdPattern.test(value);
}

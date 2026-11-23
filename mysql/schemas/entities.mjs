export const ENTITY_TABLES = [
  "organizations", "profiles", "organization_members", "teams", "team_members", "campaigns", "leads",
  "lead_activities", "follow_up_tasks", "meta_integrations", "meta_forms", "webhook_events", "audit_logs",
  "calls", "site_visits", "bookings", "sales_targets", "subscription_plans", "subscriptions", "invoices",
  "payments", "lead_shares", "lead_journey_events", "lead_skips", "whatsapp_messages", "lead_statuses",
  "notifications", "telephony_provider_configs", "provider_webhook_events",
  "payment_transactions", "payment_webhook_deliveries", "payment_state_history", "qr_payment_reviews",
  "growth_tool_access", "growth_tool_jobs", "assignment_rules", "assignment_history", "lead_scoring_settings",
  "lead_score_history", "sales_pipelines", "pipeline_stages", "lead_stage_history", "automation_workflows",
  "automation_executions", "automation_tasks", "customers", "customer_merge_reviews", "customer_notes",
  "campaign_costs", "target_history", "commission_rules", "commission_ledger", "support_tickets", "import_jobs",
  "google_sheet_integrations", "google_sheet_source_rows", "google_sheet_sync_runs", "organization_settings",
  "subscription_history", "platform_domains", "platform_domain_audit", "contact_submissions",
];

export const EXCLUDED_TABLES = [
  "auth.users",
  "invitations",
  "meta_integration_secrets",
  "google_oauth_states",
  "growth_tool_configs",
  "platform_support_grants",
];

const compositeKeys = {
  organization_members: ["organization_id", "user_id"],
  team_members: ["team_id", "user_id"],
  lead_scoring_settings: ["organization_id"],
  organization_settings: ["organization_id"],
  growth_tool_access: ["tool_id", "organization_id"],
  google_sheet_source_rows: ["integration_id", "source_row_key"],
};

export const ENTITY_PRIMARY_KEYS = Object.fromEntries(
  ENTITY_TABLES.map((entityType) => [entityType, compositeKeys[entityType] ?? ["id"]]),
);

export function sourceRecordKey(entityType, payload) {
  if (payload.id !== undefined && payload.id !== null) return String(payload.id);
  const fields = compositeKeys[entityType];
  if (!fields) throw new Error(`Unsupported composite primary key for ${entityType}`);
  const values = fields.map((field) => payload[field]);
  if (values.some((value) => value === undefined || value === null)) {
    throw new Error(`Missing primary key field for ${entityType}`);
  }
  return values.map((value) => Buffer.from(String(value), "utf8").toString("base64url")).join(".");
}

const secretKeyPattern = /(password|token|secret|credential|authorization|private[_-]?key|api[_-]?key|cookie|jwt)/i;

export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !secretKeyPattern.test(key)).map(([key, child]) => [key, stripSecrets(child)]));
}

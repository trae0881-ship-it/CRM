# Database workflow report

Status: **WAITING FOR DEPLOYMENT**

## Local implementation evidence

| Workflow | Local status | Database staging status |
|---|---|---|
| Lead creation, assignment, transfer and sharing | Locally verified | Waiting for deployment |
| Pipeline movement and stage history | Locally verified; migration 016 RPC is covered by source tests | Waiting for deployment |
| Customer matching and Customer 360 foundation | Locally verified | Waiting for deployment |
| Follow-ups, calls, visits and bookings | Locally verified | Waiting for deployment |
| Payments and commission safeguards | Locally verified | Waiting for deployment |
| Campaign attribution and targets | Locally verified | Waiting for deployment |
| Support tickets and import history | Locally verified | Waiting for deployment |
| Notifications and timeline triggers | Locally verified by migration/source tests | Waiting for deployment |
| Automation idempotency and retries | Locally verified by deterministic tests | Waiting for deployment |

## Staging acceptance criteria

For every workflow, create a record as Alpha, reload, query it in a fresh authenticated session, and verify the corresponding history/timeline/audit row. Repeat a denied Beta access attempt and record the exact error. Do not mark a workflow database-backed and staging verified until both persistence and denial evidence exist.

## External integrations

YouPI-PG, Meta, WhatsApp, telephony and Growth Tools have no configured credentials or deployed endpoints. Their live workflows are skipped, not passed.

# Google Sheets sync report

## Status

**INTEGRATION FOUNDATION ONLY**. The code is locally verified, but no Google OAuth credentials, consent flow, spreadsheet access, or staging scheduler is configured in this workspace.

## Implemented

- Organization Admin and Company Owner UI for OAuth connection, spreadsheet/worksheet selection, mapping, manual sync, automatic-sync flag, status counters, history and disconnect.
- Server-only OAuth callback using Google Sheets/Drive scopes.
- AES-GCM encrypted refresh/access-token storage using an Edge Function secret.
- Organization membership checks on OAuth, disconnect, spreadsheet listing and sync.
- Source-row mapping keyed by spreadsheet, worksheet and configured stable source ID (with normalized identity fallback).
- Incremental hash comparison, CRM-managed field preservation, duplicate detection and missing-row marking without deleting CRM leads.
- Safe row limits, per-row validation, batch error recording and retry through another sync.
- Migration 019 RLS for integration configuration, source mappings and sync history.
- Pipeline RPC authorization for Owner/Admin, team Manager and assigned Salesperson.

## Pending staging verification

- Google Cloud OAuth consent/client setup and real account authorization.
- Spreadsheet/worksheet permission validation with two organizations.
- Scheduler configuration using `GOOGLE_SHEETS_SYNC_CRON_SECRET`.
- Expired/revoked-token behavior against a real Google account.
- Real first import, incremental update, deletion review and retry.

## Deliberately deferred

Meta Lead Ads remains **Coming Soon — Not Connected**. No Meta account, access token, webhook subscription or direct import is enabled.

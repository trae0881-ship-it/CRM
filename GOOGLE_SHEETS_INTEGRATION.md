# Google Sheets integration

Status: **INTEGRATION FOUNDATION ONLY** until a real Google OAuth authorization and spreadsheet read test succeeds.

## Server configuration

Configure these only in Supabase Edge Function secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEETS_REDIRECT_URI`
- `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key)
- `GOOGLE_SHEETS_SYNC_CRON_SECRET` (random scheduler-only secret)

Register the redirect URI exactly in Google Cloud OAuth credentials. Deploy `google-sheets-oauth` and `google-sheets-sync` after applying migrations `001` through `019`.

The client never receives refresh tokens. The sync function validates the authenticated membership, decrypts the server-side token, reads the configured worksheet, performs organization-scoped upserts, keeps source-row mappings, preserves CRM-managed fields, records missing source rows without deleting CRM leads, and writes sync history.

Google Drive/Sheets access errors, expired tokens and invalid rows are surfaced as errors. Automatic scheduling requires a trusted scheduler to invoke `google-sheets-sync` with `x-google-sync-cron-secret` and each eligible integration ID. Configure Supabase Cron, an authenticated server cron, or Hostinger cron to call the Edge Function; frontend polling is not used as the synchronization mechanism.

Meta Lead Ads remains **Coming Soon — Not Connected** and is intentionally not implemented in this phase.

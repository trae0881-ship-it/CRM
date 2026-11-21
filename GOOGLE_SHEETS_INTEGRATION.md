# Google Sheets integration

Status: **INTEGRATION FOUNDATION ONLY** until a real Google OAuth authorization and spreadsheet read test succeeds.

Supabase's free tier can host the database and Edge Functions for a small/manual integration, within its current quotas. A paid Supabase plan is not inherently required to connect and manually sync a sheet. Google still requires a Google Cloud project and OAuth client; Supabase does not provide those credentials. Google API quotas and OAuth consent/verification requirements are separate from Supabase pricing.

## Server configuration

Configure these only in Supabase Edge Function secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key)
- `GOOGLE_SHEETS_SYNC_CRON_SECRET` (random scheduler-only secret)

The OAuth callback URI is derived from the server-side `SUPABASE_URL`. Do not configure an app route or a `GOOGLE_SHEETS_REDIRECT_URI` secret. Register the exact deployed function URL as an authorized redirect URI in Google Cloud.

## First-time setup

1. Apply all existing database migrations, including `20261120162000_google_sheet_agency_sources.sql` and `20261121150000_campaign_google_sheet_links.sql`, in the intended Supabase project. Do not recreate the integration tables.
2. In Google Cloud Console, enable the Google Sheets API, configure the OAuth consent screen, and create a Web application OAuth client. Add the Google account used for testing as a test user while the consent screen is in testing.
3. Register the exact callback URL `https://<project-ref>.supabase.co/functions/v1/google-sheets-oauth` as an authorized redirect URI on the Google OAuth Web client. The function derives this URI from server-side `SUPABASE_URL`; it does not redirect to `crm.adometa.in` or an organization route.
4. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY` as Supabase Edge Function secrets. Keep the client secret and encryption key server-side; never add them to frontend environment variables. `GOOGLE_SHEETS_SYNC_CRON_SECRET` is optional unless a trusted scheduler is configured.
5. Deploy `google-sheets-oauth` with JWT gateway verification disabled so Google's callback can reach it: `supabase functions deploy google-sheets-oauth --no-verify-jwt`. Its POST actions still validate the user's bearer token and organization-admin membership in the function; the callback validates a one-time, expiring OAuth state.
6. Deploy `google-sheets-sync` normally: `supabase functions deploy google-sheets-sync`. Apply migrations before testing. The browser sends the user's session token for manual sync.

For OAuth apps used outside their test users, Google may require consent-screen verification for requested scopes. A Supabase free plan does not remove that Google requirement. Manual sync does not require a scheduler; automatic sync requires separately configured trusted scheduling.

## Import leads from a sheet

1. Connect the Google account that can access the spreadsheets.
2. Connect one Google account, then use the agency tabs to filter sources. Add an agency from the Integrations page, paste its Google Sheets link, and enter the worksheet tab name.
3. Use **Preview tab** to check the selected tab's columns. Select which extra fields to show on leads, then choose **Import leads**.
4. Use **Add another tab** to register another tab from the same spreadsheet. Use **Add agency spreadsheet** for a different agency spreadsheet; each source has its own link, tab, mapping, and sync history.
5. Common contact headers such as `full_name`, `phone_number`, and `email` map to CRM fields. Other source columns are preserved on the lead; agency attribution is recorded for individual agency reports.
6. To import directly into a campaign, open Campaigns, choose **Google Sheet** on the campaign, and add the spreadsheet there. Syncs from that sheet keep new leads linked to the campaign; existing leads already linked to another campaign are reported as row errors rather than moved.
6. In Reports, choose an agency and date range to view or export an individual report as CSV, XLSX, or PDF. If the agency name changes, run the source sync again to refresh the report association.

The sheet must be accessible to the authorized Google account. Import results and row errors are shown in the integration panel; a successful OAuth connection alone does not import data.

Use **Disconnect account** to revoke Google authorization and disable every agency sheet linked to that Google account in the organization. Reconnect the account before syncing those sheets again.

## Troubleshooting: "Failed to send a request to the Edge Function"

The Google provider shown under Supabase Auth → Sign In / Providers is for Supabase user sign-in. It does not host or deploy the Google Sheets integration functions.

1. In Supabase Dashboard → Edge Functions, confirm both `google-sheets-oauth` and `google-sheets-sync` are deployed to the same project whose URL is built into `VITE_SUPABASE_URL`.
2. Deploy the current function source, which handles browser `OPTIONS`/CORS preflight requests. For example, with the Supabase CLI linked to the correct project:
   - `supabase functions deploy google-sheets-oauth --no-verify-jwt`
   - `supabase functions deploy google-sheets-sync`
3. Check `google-sheets-oauth` logs while clicking Connect. A browser/network failure usually occurs before Google OAuth starts; missing Google credentials instead return a function error such as a missing secret.
4. Confirm the three required Google secrets are configured in that project's Edge Function secrets, the database migration exists, and the callback URL is registered exactly in the Google Cloud OAuth client.

Do not share service-role keys, Google client secrets, OAuth codes, or access/refresh tokens when reporting an error.

The client never receives refresh tokens. The sync function validates the authenticated membership, decrypts the server-side token, reads the configured worksheet, performs organization-scoped upserts, keeps source-row mappings, preserves CRM-managed fields, records missing source rows without deleting CRM leads, and writes sync history.

Google Drive/Sheets access errors, expired tokens and invalid rows are surfaced as errors. Automatic scheduling requires a trusted scheduler to invoke `google-sheets-sync` with `x-google-sync-cron-secret` and each eligible integration ID. Configure Supabase Cron, an authenticated server cron, or Hostinger cron to call the Edge Function; frontend polling is not used as the synchronization mechanism.

Meta Lead Ads remains **Coming Soon — Not Connected** and is intentionally not implemented in this phase.

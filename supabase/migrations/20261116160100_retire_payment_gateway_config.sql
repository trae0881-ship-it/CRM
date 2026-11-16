-- Remove the provider-specific configuration surface without deleting payment history.

drop function if exists public.payment_gateway_overview();
delete from public.mysql_sync_outbox
  where entity_type = 'payment_gateway_configs';
drop table if exists public.payment_gateway_configs;

alter table public.payment_transactions
  drop constraint if exists payment_transactions_provider_nonempty_check;
alter table public.payment_transactions
  drop constraint if exists payment_transactions_provider_check;
alter table public.payment_transactions
  add constraint payment_transactions_provider_nonempty_check
  check (length(btrim(provider)) > 0);

alter table public.payment_webhook_deliveries
  drop constraint if exists payment_webhook_deliveries_provider_nonempty_check;
alter table public.payment_webhook_deliveries
  drop constraint if exists payment_webhook_deliveries_provider_check;
alter table public.payment_webhook_deliveries
  add constraint payment_webhook_deliveries_provider_nonempty_check
  check (length(btrim(provider)) > 0);
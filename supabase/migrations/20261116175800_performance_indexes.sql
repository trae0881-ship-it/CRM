create index if not exists notifications_unread_user_idx
  on public.notifications (organization_id, user_id)
  where read_at is null;

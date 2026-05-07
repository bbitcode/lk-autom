-- Extend PostSyncer publishing to content_items so the multi-platform Content tab
-- (and /contenido in Slack) can be approved + scheduled the same way as posts.
-- Run in Supabase SQL editor.

alter table content_items
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists postsyncer_post_id text,
  add column if not exists postsyncer_account_ids jsonb,
  add column if not exists published_to text[] default '{}',
  add column if not exists scheduled_at timestamptz,
  add column if not exists publish_language text check (publish_language in ('en', 'es'));

create index if not exists idx_content_items_postsyncer_post_id on content_items (postsyncer_post_id);
create index if not exists idx_content_items_status on content_items (status);

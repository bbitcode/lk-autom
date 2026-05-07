-- PostSyncer integration: track approval, scheduling, and publishing state per post.
-- Run in Supabase SQL editor.

alter table posts
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists postsyncer_post_id text,
  add column if not exists postsyncer_account_ids jsonb,
  add column if not exists published_to text[] default '{}',
  add column if not exists scheduled_at timestamptz,
  add column if not exists publish_language text check (publish_language in ('en', 'es'));

create index if not exists idx_posts_postsyncer_post_id on posts (postsyncer_post_id);
create index if not exists idx_posts_status on posts (status);

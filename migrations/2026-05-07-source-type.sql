-- Track whether content came from AI generation or was written manually,
-- so we can save user-authored copy verbatim without running it through Gemini.
-- Run in Supabase SQL editor.

alter table posts
  add column if not exists source_type text default 'ai_generated'
    check (source_type in ('ai_generated', 'manual'));

alter table content_items
  add column if not exists source_type text default 'ai_generated'
    check (source_type in ('ai_generated', 'manual'));

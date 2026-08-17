-- Run once in Supabase SQL Editor before deploying the matching application code.
alter table public.usage_records
  add column if not exists ai_generated boolean not null default true,
  add column if not exists ai_label text not null default 'AI生成内容',
  add column if not exists ai_label_version text not null default '2026-08-17';

comment on column public.usage_records.ai_generated is 'Whether the content was generated or synthesized by AI.';
comment on column public.usage_records.ai_label is 'User-visible AI content label.';
comment on column public.usage_records.ai_label_version is 'Version of the platform AI labeling policy.';

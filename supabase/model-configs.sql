create table if not exists public.model_configs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('image', 'text', 'video')),
  provider text not null check (provider in ('openai', 'aliyun', 'fal')),
  model_id text not null,
  name text not null,
  description text not null default '',
  text_model_id text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, provider, model_id)
);

alter table public.model_configs enable row level security;

insert into public.model_configs (type, provider, model_id, name, description, text_model_id, sort_order)
values
  ('image', 'openai', 'gpt-image-2', 'GPT Image 2', '高质量商品图片生成', '', 10),
  ('text', 'aliyun', 'qwen-plus', '通义千问 Plus', '默认：高性价比电商文案与提示词润色', '', 10),
  ('text', 'openai', 'gpt-5.4', 'GPT-5.4', '备用：百炼服务故障时自动兜底', '', 20),
  ('video', 'aliyun', 'wan2.6-i2v-flash', '通义万相 2.6', '图生 GIF 与文生视频', 'wan2.6-t2v', 10),
  ('video', 'fal', 'fal-ai/ltx-video/image-to-video', 'LTX Video', 'fal.ai 图生动态备用模型', '', 20)
on conflict (type, provider, model_id) do update set
  name = excluded.name,
  description = excluded.description,
  text_model_id = excluded.text_model_id,
  sort_order = excluded.sort_order,
  updated_at = now();

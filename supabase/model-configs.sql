create table if not exists public.model_configs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('image', 'text', 'video')),
  provider text not null check (provider in ('openai', 'aliyun', 'fal', 'tencent')),
  model_id text not null,
  name text not null,
  description text not null default '',
  text_model_id text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 100,
  credit_cost integer not null default 1 check (credit_cost between 0 and 10000),
  text_credit_cost integer not null default 1 check (text_credit_cost between 0 and 10000),
  supports_generate boolean not null default true,
  supports_edit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, provider, model_id)
);

alter table public.model_configs add column if not exists credit_cost integer not null default 1;
alter table public.model_configs add column if not exists text_credit_cost integer not null default 1;
alter table public.model_configs add column if not exists supports_generate boolean not null default true;
alter table public.model_configs add column if not exists supports_edit boolean not null default false;
alter table public.model_configs drop constraint if exists model_configs_provider_check;
alter table public.model_configs add constraint model_configs_provider_check check (provider in ('openai', 'aliyun', 'fal', 'tencent'));

alter table public.model_configs enable row level security;

insert into public.model_configs (type, provider, model_id, name, description, text_model_id, sort_order, credit_cost, text_credit_cost, supports_generate, supports_edit, enabled)
values
  ('image', 'aliyun', 'qwen-image-2.0', '千问图像 2.0', '国内默认 · 高性价比文生图，也支持图片编辑', '', 10, 2, 2, true, true, true),
  ('image', 'aliyun', 'qwen-image-2.0-pro', '千问图像 2.0 Pro', '国内高质量 · 更强文字渲染与真实质感', '', 20, 4, 4, true, true, true),
  ('image', 'aliyun', 'qwen-image-edit-plus', '千问图片编辑 Plus', '国内默认 · 图片修改与多图合成', '', 10, 3, 3, false, true, true),
  ('image', 'aliyun', 'qwen-image-edit-max', '千问图片编辑 Max', '国内高质量 · 更强一致性与几何推理', '', 20, 5, 5, false, true, true),
  ('image', 'tencent', 'hy-image-v3', '腾讯混元 Hy-Image 3.0', '国内备用 · 支持文生图与最多 3 张参考图', '', 30, 3, 3, true, true, true),
  ('image', 'openai', 'gpt-image-2', 'GPT Image 2', '海外高质量备用图片模型', '', 90, 5, 5, true, true, true),
  ('text', 'aliyun', 'qwen-plus', '通义千问 Plus', '默认：高性价比电商文案与提示词润色', '', 10, 1, 1, true, false, true),
  ('text', 'openai', 'gpt-5.4', 'GPT-5.4', '备用：百炼服务故障时自动兜底', '', 20, 2, 2, true, false, true),
  ('video', 'aliyun', 'wan2.6-i2v-flash', '通义万相 2.6', '国内默认 · 图生 GIF 与低成本文生视频', 'wan2.6-t2v', 10, 6, 25, true, true, true),
  ('video', 'tencent', 'hunyuan-video', '腾讯混元视频', '国内备用 · 配置腾讯云密钥后开放', '', 30, 10, 20, true, true, false),
  ('video', 'fal', 'fal-ai/kling-video/v1.6/standard/image-to-video', 'Kling 1.6（Fal）', '海外高质量备用视频模型', 'fal-ai/kling-video/v1.6/standard/text-to-video', 80, 20, 35, true, true, true),
  ('video', 'fal', 'fal-ai/ltx-video/image-to-video', 'LTX Video（Fal）', '海外备用图生动态与视频模型', '', 90, 12, 30, true, true, true)
on conflict (type, provider, model_id) do update set
  name = excluded.name,
  description = excluded.description,
  text_model_id = excluded.text_model_id,
  sort_order = excluded.sort_order,
  credit_cost = excluded.credit_cost,
  text_credit_cost = excluded.text_credit_cost,
  supports_generate = excluded.supports_generate,
  supports_edit = excluded.supports_edit,
  updated_at = now();

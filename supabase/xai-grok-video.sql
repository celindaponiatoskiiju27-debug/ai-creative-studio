begin;

alter table public.model_configs drop constraint if exists model_configs_provider_check;
alter table public.model_configs
  add constraint model_configs_provider_check
  check (provider in ('openai', 'aliyun', 'volcengine', 'fal', 'tencent', 'xai'));

insert into public.model_configs (
  type, provider, model_id, name, description, text_model_id,
  sort_order, credit_cost, text_credit_cost,
  supports_generate, supports_edit, enabled
)
values
(
  'video', 'xai', 'grok-imagine-video-1.5', 'Grok Imagine Video 1.5',
  'xAI · 文生视频与图生视频，当前固定 5 秒 / 480p', '',
  35, 45, 45, true, true, true
),
(
  'image', 'xai', 'grok-imagine-image-2.0', 'Grok Imagine Image 2.0',
  'xAI · 文生图与单张参考图编辑', '',
  35, 4, 4, true, true, true
)
on conflict (type, provider, model_id) do update set
  name = excluded.name,
  description = excluded.description,
  text_model_id = excluded.text_model_id,
  sort_order = excluded.sort_order,
  credit_cost = excluded.credit_cost,
  text_credit_cost = excluded.text_credit_cost,
  supports_generate = excluded.supports_generate,
  supports_edit = excluded.supports_edit,
  enabled = true,
  updated_at = now();

commit;

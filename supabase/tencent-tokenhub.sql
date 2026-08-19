begin;

delete from public.model_configs
where type = 'image'
  and provider = 'tencent'
  and model_id in ('hunyuan-image', 'hunyuan-image-edit', 'hy-image-v3.0');

insert into public.model_configs (
  type, provider, model_id, name, description, text_model_id,
  sort_order, credit_cost, text_credit_cost,
  supports_generate, supports_edit, enabled
)
values (
  'image', 'tencent', 'hy-image-v3', '腾讯混元 Hy-Image 3.0',
  '国内备用 · 支持文生图与最多 3 张参考图', '',
  30, 3, 3, true, true, true
)
on conflict (type, provider, model_id) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  credit_cost = excluded.credit_cost,
  text_credit_cost = excluded.text_credit_cost,
  supports_generate = excluded.supports_generate,
  supports_edit = excluded.supports_edit,
  enabled = true,
  updated_at = now();

commit;

begin;

delete from public.model_configs
where type = 'video'
  and provider = 'tencent'
  and model_id = 'hunyuan-video';

insert into public.model_configs (
  type, provider, model_id, name, description, text_model_id,
  sort_order, credit_cost, text_credit_cost,
  supports_generate, supports_edit, enabled
)
values
  ('video', 'tencent', 'pixverse-video-c1', 'PixVerse C1', '腾讯 TokenHub · 高动态视频，适合图片动起来与 GIF', 'pixverse-video-c1', 20, 10, 20, true, true, true),
  ('video', 'tencent', 'kling-video-v3', 'Kling V3', '腾讯 TokenHub · 高质量视频，支持智能分镜', 'kling-video-v3', 30, 24, 40, true, true, true)
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

update public.model_configs
set enabled = false,
    description = case
      when model_id like '%kling%' then '海外备用 · 当前无额度，保留配置'
      else '海外备用 · 当前无额度，保留配置'
    end,
    updated_at = now()
where type = 'video' and provider = 'fal';

commit;

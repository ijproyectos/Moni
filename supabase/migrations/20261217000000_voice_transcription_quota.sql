-- Dictado por voz · transcripción de respaldo en el servidor.
--
-- El dictado por voz usa primero el reconocimiento del navegador (gratis, sin este costo). Cuando falla o no
-- existe (típico de Safari en iPhone / la PWA instalada, ver docs/DICTADO_POR_VOZ.md), el cliente puede mandar
-- un clip corto a la función transcribe-audio, que llama a la API de transcripción de OpenAI (costo real por uso).
--
-- Esta migración solo agrega 'voice_transcription' a la lista de features de IA que consume_ai_quota exige Plus
-- para usar — mismo criterio ya aplicado a 'parse_movements', 'parse_receipt' e 'insights_chat'. No crea tablas
-- ni cambia nada más: ai_usage y la firma de consume_ai_quota ya existen (20261029000000_ai_usage.sql /
-- 20261106000000_moni_plus.sql), solo se reemplaza el cuerpo de la función.
--
-- Rollback: volver a crear consume_ai_quota desde 20261106000000_moni_plus.sql (sin 'voice_transcription' en la lista).

begin;

create or replace function public.consume_ai_quota(p_feature text, p_daily_limit int default 30)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int;
  v_used int;
  v_day_start timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_feature is null or p_feature !~ '^[a-z][a-z0-9_]{0,39}$' then
    raise exception 'invalid_feature' using errcode = '22023';
  end if;

  if p_feature in ('parse_movements', 'parse_receipt', 'insights_chat', 'voice_transcription') and not exists (
    select 1 from public.plus_entitlements e where e.user_id = v_uid and e.expires_at > now()
  ) then
    raise exception 'plus_required' using errcode = '54000';
  end if;

  v_limit := greatest(1, least(coalesce(p_daily_limit, 30), 100));

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  v_day_start := date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
    at time zone 'America/Argentina/Buenos_Aires';

  select count(*)::int into v_used
  from public.ai_usage u
  where u.owner_id = v_uid and u.feature = p_feature and u.created_at >= v_day_start;

  if v_used >= v_limit then
    raise exception 'ai_quota_exceeded' using errcode = '54000';
  end if;

  insert into public.ai_usage (owner_id, feature) values (v_uid, p_feature);

  return v_limit - v_used - 1;
end;
$$;

revoke execute on function public.consume_ai_quota(text, int) from public, anon;
grant execute on function public.consume_ai_quota(text, int) to authenticated;

commit;

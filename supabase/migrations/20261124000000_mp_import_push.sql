-- Push instantáneo al importar un gasto de Mercado Pago (WU: "Moni amigo financiero", fase 1).
--
-- Hasta ahora import_mp_payments() (20261112000100) posteaba el gasto en silencio: la persona solo se enteraba al
-- abrir la app. Esta migración reemplaza la función (mismo cuerpo) y agrega, justo después de postear cada gasto
-- nuevo, un aviso push inmediato con private.run_push_cron (el mismo helper que ya usa el recordatorio de deuda:
-- 20261119000000_push_always_on_schedules.sql, 20261123000000_debt_reminder_push.sql). No es un digest nocturno:
-- se dispara en el momento en que se detecta cada gasto, una vez por gasto.
--
--   * Texto: «🐱 Nuevo gasto» / «Carrefour · $4.500». Al tocarla abre /actividad.
--   * Apagable sin tocar código: admin_settings.key = 'mp_expense_push_enabled' con enabled = false (sin fila =
--     encendido, igual que el resto de los avisos de private.run_push_cron).
--   * El push es best-effort: si push-send falla o no hay suscripción, el gasto se postea igual (el bloque
--     exception propio nunca cuenta como v_failed; ese contador es solo para el posteo del gasto en sí).
--   * Suscripciones y transferencias (v_op <> 'regular_payment' excluido por diseño) no disparan push de "nuevo
--     gasto" nuevo: siguen su propio camino (skipped_subscription) sin cambios.
--
-- No se tocan mp_sync, mp_webhook, ni ninguna tabla. Una transacción.
-- Rollback (vuelve a la versión anterior, sin el aviso push):
--   recrear public.import_mp_payments con el cuerpo de 20261112000100_mp_import_rpc.sql.

begin;

create or replace function public.import_mp_payments(p_owner uuid, p_payments jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_fallback uuid;
  v_posted int := 0;
  v_voided int := 0;
  v_skipped int := 0;
  v_review int := 0;
  v_failed int := 0;
  p jsonb;
  v_id text;
  v_status text;
  v_op text;
  v_amount numeric(14, 2);
  v_date date;
  v_merchant text;
  v_cat uuid;
  v_tx uuid;
  v_sub uuid;
  v_seen public.mp_imported_payments;
  v_push_body text;
begin
  if p_owner is null or p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payments) > 200 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if not public.is_plus_user(p_owner) then
    raise exception 'plus_required' using errcode = '54000';
  end if;

  -- One import per user at a time (concurrent runs queue here; dedupe keeps the second one idempotent).
  perform pg_advisory_xact_lock(hashtextextended('mp_import:' || p_owner::text, 0));

  select a.id into v_account
  from public.mp_connections c
  join public.accounts a on a.id = c.account_id and a.owner_id = p_owner and a.archived_at is null
  where c.user_id = p_owner;
  if v_account is null then
    raise exception 'account_unavailable' using errcode = '23503';
  end if;

  select c.id into v_fallback
  from public.categories c
  where c.owner_id = p_owner and c.kind = 'expense' and c.archived_at is null
  order by (lower(c.name) = 'otros') desc, c.created_at, c.id
  limit 1;

  for p in select value from jsonb_array_elements(p_payments) loop
    begin
      v_id := nullif(btrim(p ->> 'payment_id'), '');
      if v_id is null then
        raise exception 'invalid_payment' using errcode = '22023';
      end if;
      v_status := coalesce(p ->> 'status', '');
      v_op := coalesce(p ->> 'operation_type', '');

      select * into v_seen from public.mp_imported_payments m where m.payment_id = v_id for update;

      if found then
        if v_seen.owner_id <> p_owner then
          raise exception 'invalid_payment' using errcode = '22023';
        end if;
        if v_status in ('refunded', 'charged_back', 'cancelled') and v_seen.outcome = 'posted' then
          if v_seen.edited_at is null and not exists (
               select 1 from public.subscription_charges x
               where x.transaction_id = v_seen.transaction_id or x.linked_transaction_id = v_seen.transaction_id
             ) and not exists (
               select 1 from public.fixed_expense_payments f
               where f.transaction_id = v_seen.transaction_id and f.status = 'posted'
             ) then
            update public.transactions set status = 'voided'
            where id = v_seen.transaction_id and status = 'posted';
            update public.mp_imported_payments
            set outcome = 'voided', mp_status = v_status, updated_at = now()
            where payment_id = v_id;
            v_voided := v_voided + 1;
          else
            update public.mp_imported_payments
            set outcome = 'needs_review', mp_status = v_status, updated_at = now()
            where payment_id = v_id;
            v_review := v_review + 1;
          end if;
        else
          v_skipped := v_skipped + 1;
        end if;
        continue;
      end if;

      -- Unseen payment: only approved ones are ever stored.
      if v_status <> 'approved' or v_op not in ('regular_payment', 'money_transfer', 'recurring_payment') then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_amount := (p ->> 'amount')::numeric(14, 2);
      v_date := (coalesce(nullif(p ->> 'date_approved', ''), p ->> 'date_created')::timestamptz
                 at time zone 'America/Argentina/Buenos_Aires')::date;
      if v_date is null then
        raise exception 'invalid_payment' using errcode = '22023';
      end if;
      v_merchant := nullif(btrim(p ->> 'merchant'), '');

      if v_op = 'recurring_payment' then
        v_sub := null;
        select s.id into v_sub
        from public.subscriptions s
        where s.owner_id = p_owner and s.status = 'active' and s.amount = v_amount
          and (s.next_charge_on between v_date - 3 and v_date + 3
               or exists (select 1 from public.subscription_charges c
                          where c.subscription_id = s.id and c.due_on between v_date - 3 and v_date + 3))
        order by abs(s.next_charge_on - v_date), s.created_at
        limit 1;
        if v_sub is null then
          v_skipped := v_skipped + 1;
        else
          insert into public.mp_imported_payments
            (payment_id, owner_id, mp_status, outcome, amount, occurred_on, merchant, operation_type,
             suggested_subscription_id)
          values (v_id, p_owner, v_status, 'skipped_subscription', v_amount, v_date, left(v_merchant, 120), v_op, v_sub);
          v_skipped := v_skipped + 1;
        end if;
        continue;
      end if;

      -- The model-chosen category is re-validated: the owner's own, active, expense kind.
      v_cat := null;
      if (p ->> 'category_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select c.id into v_cat
        from public.categories c
        where c.id = (p ->> 'category_id')::uuid and c.owner_id = p_owner and c.kind = 'expense'
          and c.archived_at is null;
      end if;
      v_cat := coalesce(v_cat, v_fallback);
      if v_cat is null then
        raise exception 'category_unavailable' using errcode = '23503';
      end if;

      insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note)
      values (p_owner, v_account, v_cat, 'expense', v_amount, v_date, left(v_merchant, 200))
      returning id into v_tx;
      insert into public.mp_imported_payments
        (payment_id, owner_id, transaction_id, mp_status, outcome, amount, occurred_on, merchant, operation_type)
      values (v_id, p_owner, v_tx, v_status, 'posted', v_amount, v_date, left(v_merchant, 120), v_op);
      v_posted := v_posted + 1;

      -- Best-effort push: never rolls back the already-posted expense, never counts as v_failed.
      begin
        v_push_body := coalesce(nullif(left(regexp_replace(v_merchant, '[[:cntrl:]]', '', 'g'), 40), ''), 'Un gasto')
                       || ' · $' || regexp_replace(trunc(v_amount)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g')
                       || case when v_amount <> trunc(v_amount)
                               then ',' || lpad(((v_amount - trunc(v_amount)) * 100)::int::text, 2, '0')
                               else '' end;
        perform private.run_push_cron(
          jsonb_build_object(
            'kind', 'expense',
            'title', '🐱 Nuevo gasto',
            'body', v_push_body,
            'audience', 'user',
            'user_id', p_owner,
            'url', '/actividad'
          ),
          'mp_expense_push_enabled'
        );
      exception when others then
        null;
      end;
    exception when others then
      -- Rolls back this payment only. Neither the payload nor the message is logged (privacy, R2.8).
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object('posted', v_posted, 'voided', v_voided, 'skipped', v_skipped,
                            'needs_review', v_review, 'failed', v_failed);
end;
$$;

revoke execute on function public.import_mp_payments(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_mp_payments(uuid, jsonb) to service_role;

commit;

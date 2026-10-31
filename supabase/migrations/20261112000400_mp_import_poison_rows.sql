-- Mercado Pago expense auto-import (Plus), hardening: poison-row policy for import_mp_payments.
--
-- Problem: a payment that fails EVERY time (no active expense category, a malformed amount, ...) was counted as
-- `failed`, which makes the whole sync run partial, so the cursor never advanced and the window grew forever.
--
-- Policy: the RPC counts consecutive failed runs per payment in public.mp_import_failures. Up to 2 failures the
-- payment is still reported as `failed` (the run stays partial and retries: transient errors heal on their own). On
-- the 3rd failed run the payment is QUARANTINED: it is stored in mp_imported_payments as outcome 'needs_review' with
-- no transaction (amount, date, merchant and status are kept, so nothing is lost silently) and reported under
-- `needs_review`, NOT under `failed`. The run can then complete and the cursor moves on. A quarantined payment is a
-- "seen" payment: later runs skip it. The app shows the count of such payments (needs_review without a
-- transaction) so the person can add them by hand. A successful insert clears the counter.
--
-- The return shape of import_mp_payments is unchanged: {posted, voided, skipped, needs_review, failed}.
-- Privacy: only the payment id, owner and a counter are stored here; nothing is logged.
--
-- Apply AFTER 20261112000300_mp_dismiss_duplicate.sql.
-- Rollback: restore import_mp_payments from 20261112000100_mp_import_rpc.sql, then
--   drop table public.mp_import_failures;
-- (quarantined rows stay in public.mp_imported_payments as needs_review.)

begin;

create table public.mp_import_failures (
  payment_id text primary key check (char_length(payment_id) between 1 and 100),
  owner_id uuid not null references auth.users (id) on delete cascade,
  attempts smallint not null default 1 check (attempts >= 1),
  updated_at timestamptz not null default now()
);

alter table public.mp_import_failures enable row level security;
revoke all on table public.mp_import_failures from public, anon, authenticated;
grant select on table public.mp_import_failures to service_role;

create or replace function public.import_mp_payments(p_owner uuid, p_payments jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_max_attempts constant int := 3;
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
  v_attempts int;
  v_quarantined boolean;
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
    v_id := null;
    v_status := null;
    v_op := null;
    v_amount := null;
    v_date := null;
    v_merchant := null;
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
      delete from public.mp_import_failures f where f.payment_id = v_id and f.owner_id = p_owner;
      v_posted := v_posted + 1;
    exception when others then
      -- The sub-transaction above is rolled back. Neither the payload nor the message is logged (privacy, R2.8).
      -- Count the failure; from the c_max_attempts-th consecutive failed run the payment is quarantined.
      v_quarantined := false;
      if v_id is not null then
        begin
          insert into public.mp_import_failures as f (payment_id, owner_id)
          values (v_id, p_owner)
          on conflict (payment_id) do update
            set attempts = least(f.attempts + 1, 1000), updated_at = now()
            where f.owner_id = p_owner
          returning f.attempts into v_attempts;

          if v_attempts >= c_max_attempts then
            -- Re-read what can still be read; whatever cannot be parsed falls back to a neutral value.
            begin v_amount := (p ->> 'amount')::numeric(14, 2); exception when others then v_amount := null; end;
            begin
              v_date := (coalesce(nullif(p ->> 'date_approved', ''), p ->> 'date_created')::timestamptz
                         at time zone 'America/Argentina/Buenos_Aires')::date;
            exception when others then v_date := null; end;
            v_merchant := nullif(btrim(p ->> 'merchant'), '');
            if exists (select 1 from public.mp_imported_payments m where m.payment_id = v_id) then
              update public.mp_imported_payments m
              set outcome = 'needs_review', updated_at = now()
              where m.payment_id = v_id and m.owner_id = p_owner and m.outcome = 'posted';
            else
              insert into public.mp_imported_payments
                (payment_id, owner_id, transaction_id, mp_status, outcome, amount, occurred_on, merchant, operation_type)
              values (v_id, p_owner, null, left(coalesce(nullif(v_status, ''), 'unknown'), 40), 'needs_review',
                      greatest(coalesce(v_amount, 0), 0), coalesce(v_date, current_date), left(v_merchant, 120),
                      nullif(v_op, ''));
            end if;
            delete from public.mp_import_failures f where f.payment_id = v_id and f.owner_id = p_owner;
            v_quarantined := true;
          end if;
        exception when others then
          v_quarantined := false;
        end;
      end if;
      if v_quarantined then
        v_review := v_review + 1;
      else
        v_failed := v_failed + 1;
      end if;
    end;
  end loop;

  return jsonb_build_object('posted', v_posted, 'voided', v_voided, 'skipped', v_skipped,
                            'needs_review', v_review, 'failed', v_failed);
end;
$$;

revoke execute on function public.import_mp_payments(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_mp_payments(uuid, jsonb) to service_role;

commit;

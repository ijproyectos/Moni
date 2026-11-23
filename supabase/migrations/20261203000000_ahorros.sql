-- Ahorros: lo que la persona tiene ahorrado en pesos y en dólares, SIN meta ni objetivo.
--
-- Es un libro propio, separado de las Metas y del dinero para gastar:
--   * Cada asiento es un saldo inicial («opening»: ahorros que ya tenía, sin crear un ingreso), un aporte («deposit») o un retiro
--     («withdrawal»), en UNA moneda (ARS o USD). Los importes de cada moneda se suman por separado: nunca se convierten ni se mezclan.
--   * No crea ni toca movimientos: no es un ingreso ni un gasto de consumo, no cambia account_balances y no entra en los totales
--     del mes.
--   * Un aporte en pesos puede salir de una cuenta propia (account_id): el dinero NO se duplica, queda RESERVADO en esa cuenta
--     (igual que las metas: saldo real - reservado = libre), y no puede reservarse dos veces el mismo dinero porque se bloquea la cuenta
--     y se cuentan juntas las reservas de metas y de ahorros. Un retiro puede volver a una cuenta (baja esa reserva) o sacarse sin cuenta.
--     Las cuentas son solo en pesos: los dólares no tienen cuenta de origen.
--   * Los asientos no se borran: se anulan (status = 'voided'), y se rechaza anular si dejaría un saldo negativo.
--
-- Modifica UNA función existente, public.savings_account_reserved(uuid): ahora suma a la reserva de las metas la de los ahorros
-- de esa cuenta (para que metas y ahorros nunca reserven la misma plata). Con ahorros vacíos devuelve exactamente lo de antes.
-- Aplicar DESPUÉS de 20261202000000_group_push_and_invitations.sql, con respaldo previo. NO aplicada en producción.
--
-- Rollback (solo mientras no haya asientos): restaurar savings_account_reserved desde 20261103000000 y
--   drop function public.create_ahorro_entry(text, text, numeric, date, text, uuid, uuid), public.void_ahorro_entry(uuid),
--     public.ahorro_balance(uuid, text), public.ahorro_account_reserved(uuid);
--   drop table public.ahorro_entries;

begin;

create table public.ahorro_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  currency text not null check (currency in ('ARS', 'USD')),
  kind text not null check (kind in ('opening', 'deposit', 'withdrawal')),
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  occurred_on date not null,
  note text check (note is null or char_length(note) <= 200),
  -- Pesos only: the account the money was set aside from (deposit) or went back to (withdrawal).
  account_id uuid references public.accounts (id) on delete no action,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  request_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'voided') = (voided_at is not null)),
  check (account_id is null or currency = 'ARS'),
  check (kind <> 'opening' or account_id is null)
);

create unique index ahorro_entries_request_key on public.ahorro_entries (owner_id, request_key) where request_key is not null;
create index ahorro_entries_owner_idx on public.ahorro_entries (owner_id, currency, occurred_on desc, created_at desc);
create index ahorro_entries_account_idx on public.ahorro_entries (account_id) where account_id is not null;

create trigger ahorro_entries_set_updated_at
before update on public.ahorro_entries
for each row execute function public.set_updated_at();

alter table public.ahorro_entries enable row level security;
revoke all on table public.ahorro_entries from anon, authenticated;
grant select on table public.ahorro_entries to authenticated;
create policy "ahorro_entries_select_own" on public.ahorro_entries
for select to authenticated using (owner_id = (select auth.uid()));

-- Balances ---------------------------------------------------------------------------------------------------------------------------
create or replace function public.ahorro_balance(p_owner uuid, p_currency text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(case e.kind when 'withdrawal' then -e.amount else e.amount end), 0)
  from public.ahorro_entries e
  where e.owner_id = p_owner and e.currency = p_currency and e.status = 'posted'
$$;

-- What the savings keep reserved in one account (deposits from it minus withdrawals back to it).
create or replace function public.ahorro_account_reserved(p_account uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(case e.kind when 'withdrawal' then -e.amount else e.amount end), 0)
  from public.ahorro_entries e
  where e.account_id = p_account and e.status = 'posted'
$$;

-- Read helpers: they run with the caller's rights (RLS: only their own entries), and public.savings_account_reserved, which the goals
-- screens call as the person, uses ahorro_account_reserved. Same grants as savings_account_reserved.
revoke execute on function public.ahorro_balance(uuid, text), public.ahorro_account_reserved(uuid) from public, anon;
grant execute on function public.ahorro_balance(uuid, text), public.ahorro_account_reserved(uuid) to authenticated;

-- Goals and savings reserve from the SAME free money of an account, counted once each.
create or replace function public.savings_account_reserved(p_account uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(public.savings_goal_reserved(g.id)), 0) + public.ahorro_account_reserved(p_account)
  from public.savings_goals g
  where g.account_id = p_account and g.status in ('active', 'paused', 'completed')
$$;

-- Writes -----------------------------------------------------------------------------------------------------------------------------
create or replace function public.create_ahorro_entry(
  p_currency text,
  p_kind text,
  p_amount numeric,
  p_on date default null,
  p_note text default null,
  p_account uuid default null,
  p_request_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_today date := public.subscription_today();
  v_free numeric;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_request_key is not null then
    select id into v_id from public.ahorro_entries where owner_id = v_owner and request_key = p_request_key;
    if found then
      return v_id;
    end if;
  end if;
  if p_currency is null or p_currency not in ('ARS', 'USD') then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('opening', 'deposit', 'withdrawal') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_on is not null and (p_on > v_today or p_on < v_today - 3650) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_account is not null and (p_currency <> 'ARS' or p_kind = 'opening') then
    raise exception 'invalid_account' using errcode = '22023';
  end if;

  -- One writer at a time per person and currency: two simultaneous withdrawals cannot both take the same money.
  perform pg_advisory_xact_lock(hashtext('ahorro:' || v_owner::text || ':' || p_currency));

  if p_account is not null then
    perform public.check_savings_account(v_owner, p_account);
    if p_kind = 'deposit' then
      v_free := public.lock_savings_account_free(p_account);
      if round(p_amount, 2) > v_free then
        raise exception 'not_enough_free_money' using errcode = '23514', detail = v_free::text;
      end if;
    else
      perform 1 from public.accounts where id = p_account for update;
      if round(p_amount, 2) > public.ahorro_account_reserved(p_account) then
        raise exception 'not_enough_saved_in_account' using errcode = '23514';
      end if;
    end if;
  end if;

  if p_kind = 'withdrawal' and round(p_amount, 2) > public.ahorro_balance(v_owner, p_currency) then
    raise exception 'not_enough_savings' using errcode = '23514', detail = public.ahorro_balance(v_owner, p_currency)::text;
  end if;

  insert into public.ahorro_entries (owner_id, currency, kind, amount, occurred_on, note, account_id, request_key)
  values (v_owner, p_currency, p_kind, round(p_amount, 2), coalesce(p_on, v_today), nullif(btrim(p_note), ''), p_account, p_request_key)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.void_ahorro_entry(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  e public.ahorro_entries%rowtype;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into e from public.ahorro_entries where id = p_entry and owner_id = v_owner;
  if not found then
    raise exception 'entry_not_found' using errcode = '23503';
  end if;
  perform pg_advisory_xact_lock(hashtext('ahorro:' || v_owner::text || ':' || e.currency));
  select * into e from public.ahorro_entries where id = p_entry for update;
  if e.status <> 'posted' then
    raise exception 'entry_voided' using errcode = '23514';
  end if;

  if e.kind in ('opening', 'deposit') then
    if public.ahorro_balance(v_owner, e.currency) - e.amount < 0 then
      raise exception 'would_go_negative' using errcode = '23514';
    end if;
    if e.account_id is not null then
      perform 1 from public.accounts where id = e.account_id for update;
      if public.ahorro_account_reserved(e.account_id) - e.amount < 0 then
        raise exception 'would_go_negative' using errcode = '23514';
      end if;
    end if;
  elsif e.account_id is not null then
    -- Cancelling a withdrawal back to an account reserves that money again: it has to be free.
    if round(e.amount, 2) > public.lock_savings_account_free(e.account_id) then
      raise exception 'not_enough_free_money' using errcode = '23514';
    end if;
  end if;

  update public.ahorro_entries set status = 'voided', voided_at = now() where id = e.id;
end;
$$;

revoke execute on function public.create_ahorro_entry(text, text, numeric, date, text, uuid, uuid) from public, anon;
revoke execute on function public.void_ahorro_entry(uuid) from public, anon;
grant execute on function public.create_ahorro_entry(text, text, numeric, date, text, uuid, uuid) to authenticated;
grant execute on function public.void_ahorro_entry(uuid) to authenticated;

commit;

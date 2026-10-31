-- Mercado Pago expense auto-import (Plus), hardening: ensure_mp_wallet reuses an existing Mercado Pago account.
--
-- The first version only reused kind = 'wallet' named exactly 'Mercado Pago', so a person who already had
-- "mercado pago", " Mercado Pago ", "MercadoPago" or a Mercado Pago account saved as a bank account got a duplicate.
-- It now reuses the oldest ACTIVE ARS account whose name matches case-insensitively, ignoring surrounding and inner
-- whitespace, of a wallet-like kind: 'wallet' or 'bank' (cash and credit cards are never reused). Wallets win over
-- banks when both exist. Otherwise a new "Mercado Pago" wallet is created, as before.
--
-- A new migration (not an edit of 20261112000000) keeps the history of the migration chain intact even if that file
-- was already applied somewhere. Apply AFTER 20261112000400_mp_import_poison_rows.sql.
-- Rollback: re-run the ensure_mp_wallet definition from 20261112000000_mp_expense_autoimport.sql.

begin;

create or replace function public.ensure_mp_wallet(p_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user is null then
    raise exception 'invalid_user' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp_wallet:' || p_user::text, 0));

  select a.id into v_id
  from public.accounts a
  where a.owner_id = p_user
    and a.archived_at is null
    and a.currency = 'ARS'
    and a.kind in ('wallet', 'bank')
    and lower(regexp_replace(a.name, '\s+', '', 'g')) = 'mercadopago'
  order by (a.kind = 'wallet') desc, a.created_at, a.id
  limit 1;

  if v_id is null then
    insert into public.accounts (owner_id, name, kind, currency, opening_balance)
    values (p_user, 'Mercado Pago', 'wallet', 'ARS', 0)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.ensure_mp_wallet(uuid) from public, anon, authenticated;
grant execute on function public.ensure_mp_wallet(uuid) to service_role;

commit;

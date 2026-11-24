-- Moni Plus billing with RevenueCat (StoreKit / Play Billing), for the native app distributed on the App Store and
-- Google Play. This is a SECOND writer of public.plus_entitlements (see 20261106000000_moni_plus.sql), alongside
-- Mercado Pago (20261107000000_mp_plus_billing.sql). Mercado Pago is NOT removed and keeps billing existing web
-- subscribers; it is simply not offered as a payment option inside the native app build (client-side decision, not
-- a database one). Both sources write the same public.plus_entitlements row: whichever last granted/renewed wins.
--
--   * public.revenuecat_events: one row per processed RevenueCat webhook event. Its primary key is the event id
--     RevenueCat assigns, so a redelivered webhook (RevenueCat retries on anything but a 2xx) is applied once.
--   * public.grant_plus_from_revenuecat(): sets the caller's Plus expiry to EXACTLY what RevenueCat reports
--     (`expiration_at_ms`), unlike grant_plus_from_payment() which has to add "one month" itself because Mercado
--     Pago only confirms a payment, never a period end. RevenueCat already resolved proration, trials and the
--     store's own renewal date, so the incoming value is authoritative and is written as-is (no greatest()/add).
--     Idempotent on p_event_id. Returns the new expiry, or NULL when the event was already processed (replay).
--
-- RevenueCat's app_user_id is expected to be the Supabase auth user id (the client initializes the SDK with it,
-- see src/features/subscription-native), so p_user here is just that id cast to uuid by the Edge Function.
--
-- Wrapped in one transaction. Apply AFTER 20261107000000_mp_plus_billing.sql.
-- Rollback: drop function public.grant_plus_from_revenuecat(uuid, text, timestamptz);
--   drop table public.revenuecat_events;
-- (entitlements already granted from RevenueCat stay in plus_entitlements until they expire, same as Mercado Pago.)

begin;

create table public.revenuecat_events (
  event_id text primary key check (char_length(event_id) between 1 and 100),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 40),
  created_at timestamptz not null default now()
);

create index revenuecat_events_user_idx on public.revenuecat_events (user_id, created_at desc);

alter table public.revenuecat_events enable row level security;

revoke all on table public.revenuecat_events from public, anon, authenticated;
grant select on table public.revenuecat_events to authenticated, service_role;

create policy "revenuecat_events_select_own" on public.revenuecat_events
for select to authenticated using (user_id = (select auth.uid()));

-- Credit ---------------------------------------------------------------------------------------------

create or replace function public.grant_plus_from_revenuecat(
  p_user uuid,
  p_event_id text,
  p_event_type text,
  p_expires_at timestamptz
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows int;
  v_expires timestamptz;
begin
  if p_user is null or p_event_id is null or p_event_type is null or p_expires_at is null then
    raise exception 'invalid_event' using errcode = '22023';
  end if;

  insert into public.revenuecat_events (event_id, user_id, event_type)
  values (p_event_id, p_user, p_event_type)
  on conflict (event_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return null;
  end if;

  insert into public.plus_entitlements as e (user_id, source, granted_at, expires_at)
  values (p_user, 'revenuecat', now(), p_expires_at)
  on conflict (user_id) do update
    set source = 'revenuecat',
        granted_at = now(),
        expires_at = p_expires_at
  returning e.expires_at into v_expires;

  return v_expires;
end;
$$;

-- Grants ---------------------------------------------------------------------------------------------

revoke execute on function public.grant_plus_from_revenuecat(uuid, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.grant_plus_from_revenuecat(uuid, text, text, timestamptz)
to service_role;

commit;

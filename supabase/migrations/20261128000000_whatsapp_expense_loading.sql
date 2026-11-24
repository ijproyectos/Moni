-- Second slice of the WhatsApp integration (see supabase/functions/whatsapp-webhook): lets a linked phone number
-- load an expense (or income) by texting Moni in free-form Spanish.
--
--   * public.whatsapp_links: the only place a WhatsApp phone number (wa_id) is tied to a Moni account (user_id).
--     One-to-one both ways. No self-service UI exists yet to create this row (a future, separate feature); today
--     it is only ever inserted by hand for testing. service_role only: this is internal plumbing, not something
--     the owner reads or writes from the app.
--   * public.whatsapp_expense_log: one row per transaction created from a WhatsApp message. Exists ONLY so
--     "deshacer"/"borrar" can find and remove the single most recent one, and so a retried webhook delivery (Meta
--     resends the same wamid when it does not get a timely 200) can be recognized and skipped instead of creating a
--     duplicate expense. wamid is NOT unique here on purpose: one message can report more than one movement
--     ("gasté 500 en nafta y 200 en cafe" -> two rows, same wamid). The idempotency check is "does a row for this
--     wamid exist at all", not "at most one". transaction_id cascades on delete so removing the transaction (from
--     the app, or via the undo path) never leaves an orphaned log row.
--
-- One transaction. Rollback: drop table public.whatsapp_expense_log, public.whatsapp_links.

begin;

create table public.whatsapp_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  wa_id text not null unique check (char_length(wa_id) between 1 and 20),
  linked_at timestamptz not null default now()
);

alter table public.whatsapp_links enable row level security;

revoke all on table public.whatsapp_links from public, anon, authenticated;
grant select, insert on table public.whatsapp_links to service_role;

create table public.whatsapp_expense_log (
  id uuid primary key default gen_random_uuid(),
  wamid text not null check (char_length(wamid) between 1 and 100),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null unique references public.transactions (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index whatsapp_expense_log_user_created_idx
  on public.whatsapp_expense_log (user_id, created_at desc);
create index whatsapp_expense_log_wamid_idx on public.whatsapp_expense_log (wamid);

alter table public.whatsapp_expense_log enable row level security;

revoke all on table public.whatsapp_expense_log from public, anon, authenticated;
grant select, insert, delete on table public.whatsapp_expense_log to service_role;

commit;

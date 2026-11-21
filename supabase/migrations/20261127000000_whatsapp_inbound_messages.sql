-- First slice of the WhatsApp integration (see supabase/functions/whatsapp-webhook): stores every inbound message
-- as-is, keyed by WhatsApp's own message id (wamid) so a Meta retry inserts nothing twice.
--
-- Intentionally NOT linked to auth.users yet: wa_id (the sender's phone number, as WhatsApp formats it) is not
-- proven to belong to any Moni account. Linking a phone number to a signed-in user is a separate feature (an
-- opt-in flow is still to be designed) and will likely add a `user_id` column (nullable until linked) rather than
-- a new table. Until then this is an append-only inbox: service_role only, no end-user access.
--
-- One transaction. Rollback: drop table public.whatsapp_inbound_messages.

begin;

create table public.whatsapp_inbound_messages (
  wamid text primary key check (char_length(wamid) between 1 and 100),
  wa_id text not null check (char_length(wa_id) between 1 and 20),
  message_type text not null check (char_length(message_type) between 1 and 30),
  body text check (body is null or char_length(body) <= 4096),
  sent_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index whatsapp_inbound_messages_wa_id_idx
  on public.whatsapp_inbound_messages (wa_id, sent_at desc);

alter table public.whatsapp_inbound_messages enable row level security;

revoke all on table public.whatsapp_inbound_messages from public, anon, authenticated;
grant select, insert on table public.whatsapp_inbound_messages to service_role;

commit;

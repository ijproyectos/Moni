-- Datos para transferencias: the alias and the CBU / CVU of a bank account or a wallet, so Moni can tell people where to
-- transfer in the summaries of shared expenses and trips.
--
-- Before this there was nowhere real to keep them: the alias lived only in an in-memory simulation (and the CBU / CVU
-- nowhere). They are OPTIONAL and belong to the account of the person who owns it (RLS already restricts accounts to
-- their owner; nobody else can read them).
--
--   accounts.transfer_alias   6 to 20 characters: letters, numbers, dots and hyphens (the Argentine alias format).
--   accounts.transfer_cbu     the 22 digits of a CBU (banks) or a CVU (wallets).
--
-- Rules
--   * Only banks and wallets can have them: cash and credit cards cannot (check), so the data never sits on a
--     medium that cannot receive a transfer.
--   * Editing them is an UPDATE of these two columns only: balances and movements are not touched (they come from
--     transactions, not from accounts).
--   * Nothing here shares them: they only leave the app when the person chooses an account and confirms it while
--     building a summary.
--
-- Additive (two nullable columns, three checks, one column-level grant). Apply AFTER 20261107000000_personal_trips.sql.
-- Rollback:
--   alter table public.accounts drop constraint accounts_transfer_kind_check, drop constraint accounts_transfer_alias_check,
--     drop constraint accounts_transfer_cbu_check, drop column transfer_alias, drop column transfer_cbu;

begin;

alter table public.accounts
  add column transfer_alias text,
  add column transfer_cbu text,
  add constraint accounts_transfer_alias_check
    check (transfer_alias is null or transfer_alias ~ '^[A-Za-z0-9.-]{6,20}$'),
  add constraint accounts_transfer_cbu_check
    check (transfer_cbu is null or transfer_cbu ~ '^[0-9]{22}$'),
  add constraint accounts_transfer_kind_check
    check ((transfer_alias is null and transfer_cbu is null) or kind in ('bank', 'wallet'));

-- Written by the app when the person edits them (RLS: only on their own accounts).
grant update (transfer_alias, transfer_cbu) on table public.accounts to authenticated;

commit;

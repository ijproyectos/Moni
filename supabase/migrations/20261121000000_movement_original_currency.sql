-- Movements loaded in US dollars.
--
-- A movement is still stored in ARS (transactions.amount): balances, budgets and reports keep working untouched.
-- When the person types it in dollars, the original figure and the rate used are kept next to it so the app can
-- show "US$ 20 · dólar tarjeta $1.350" and the edit form can reopen it in dollars.
--
--   original_amount    amount as typed, in original_currency (numeric(14,2), > 0)
--   original_currency  'USD' (MVP: the only second currency, like profiles.secondary_currency)
--   fx_rate            ARS per USD used to convert (numeric(12,4), > 0)
--
-- All three are null for a plain peso movement, and all three are set together (check below).
-- Purely additive: nullable columns, no data touched, no existing policy or function changed.
--
-- Rollback (loses only the dollar annotations; amounts in ARS stay as they are):
--   alter table public.transactions
--     drop constraint transactions_original_currency_check,
--     drop column original_amount, drop column original_currency, drop column fx_rate;

alter table public.transactions
  add column original_amount numeric(14,2),
  add column original_currency char(3),
  add column fx_rate numeric(12,4),
  add constraint transactions_original_currency_check check (
    (original_amount is null and original_currency is null and fx_rate is null)
    or (original_amount > 0 and original_currency = 'USD' and fx_rate > 0)
  );

comment on column public.transactions.original_amount is 'Amount as typed when the movement was loaded in a foreign currency; amount holds the ARS equivalent.';
comment on column public.transactions.original_currency is 'Currency of original_amount (MVP: USD only).';
comment on column public.transactions.fx_rate is 'ARS per unit of original_currency used to convert original_amount into amount.';

grant insert (original_amount, original_currency, fx_rate) on table public.transactions to authenticated;
grant update (original_amount, original_currency, fx_rate) on table public.transactions to authenticated;

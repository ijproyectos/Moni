-- Undo of 20261103000000_savings_goals.sql. Only for the case you want to remove Metas again: it deletes the goals and
-- their history (the reserves), never an account, movement or transfer. Run it only if no goal matters to you.
begin;
drop function if exists public.get_savings_overview(date), public.create_savings_goal(text, text, numeric, uuid, date, numeric, text, numeric, boolean, date, uuid),
  public.update_savings_goal(uuid, text, text, numeric, uuid, date, text, numeric, boolean, date), public.set_savings_goal_status(uuid, text, boolean),
  public.add_goal_deposit(uuid, numeric, date, text, uuid), public.withdraw_goal_reserve(uuid, numeric, date, text, uuid),
  public.void_goal_movement(uuid), public.snooze_goal_reminder(uuid, date), public.skip_goal_reminder(uuid), public.advance_goal_reminder(uuid),
  public.lock_savings_account_free(uuid), public.check_savings_account(uuid, uuid), public.savings_next_reminder_cycle(date, text, int, date),
  public.savings_account_reserved(uuid), public.savings_goal_reserved(uuid), public.savings_reminder_due_on(date, text, int);
drop table if exists public.savings_movements, public.savings_goals;
commit;
notify pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════
-- PHASE 3B — atomic money mutations. Ledger law encoded in SQL:
--   trade.pnl records FULL P&L; balance moves by SETTLEMENT deltas;
--   upfront premiums move at fill time. Invariant:
--   starting_balance + Σ(trades.pnl) = balance
-- ══════════════════════════════════════════════════════════════

-- ── Helper: ownership + serialization gate ──────────────────────
create or replace function public._assert_account_owner(p_account_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  select user_id into v_user from accounts
   where id = p_account_id for update;            -- lock until txn end
  if v_user is null then raise exception 'account % not found', p_account_id; end if;
  if v_user <> auth.uid() then raise exception 'account % not owned by caller', p_account_id; end if;
end $$;

-- ── Helper: close one position atomically (log + delete + cash) ─
create or replace function public._settle_and_log(
  p_account_id uuid, p_position_id uuid,
  p_exit_price numeric, p_reason text
) returns numeric                       -- settlement cash delta
language plpgsql security definer set search_path = public
as $$
declare v_pos positions%ROWTYPE; v_dir int; v_mult int;
        v_pnl numeric; v_cash numeric;
begin
  select * into v_pos from positions
   where id = p_position_id and account_id = p_account_id;
  if not found then raise exception 'position % missing', p_position_id; end if;

  v_dir  := case when v_pos.side = 'long' then 1 else -1 end;
  v_mult := case when v_pos.instrument_type = 'equity' then 1 else 100 end;
  v_pnl  := (p_exit_price - v_pos.entry_price) * v_pos.quantity * v_mult * v_dir;
  v_cash := case when v_pos.instrument_type = 'equity' then v_pnl
                 else v_dir * p_exit_price * v_pos.quantity * 100 end;

  insert into trades (account_id, user_id, side, quantity, entry_price,
                      exit_price, pnl, opened_at, closed_at, close_reason,
                      strategy_id, instrument_type, strike)
  values (p_account_id, v_pos.user_id, v_pos.side, v_pos.quantity,
          v_pos.entry_price, p_exit_price, v_pnl, v_pos.opened_at, now(),
          p_reason, v_pos.strategy_id, v_pos.instrument_type, v_pos.strike);

  delete from positions where id = p_position_id;
  return v_cash;
end $$;

-- ── 1. Fills: insert legs + upfront premium, one txn ────────────
create or replace function public.apply_fill(
  p_account_id uuid, p_legs jsonb
) returns table (inserted_ids uuid[], new_balance numeric)
language plpgsql security definer set search_path = public
as $$
declare v_leg jsonb; v_dir int; v_id uuid; v_ids uuid[] := '{}';
        v_upfront numeric := 0; v_net_put numeric := 0;
        v_net_call numeric := 0; v_shares numeric := 0;
        v_user uuid; v_status text;
begin
  perform _assert_account_owner(p_account_id);
  select user_id, status into v_user, v_status from accounts where id = p_account_id;
  if v_status <> 'active' then raise exception 'account not active'; end if;

  -- PASS 1: validate (coverage rule — bounded tail risk) before any write
  for v_leg in select * from jsonb_array_elements(p_legs) loop
    v_dir := case when v_leg->>'side' = 'long' then 1 else -1 end;
    if v_leg->>'instrument_type' = 'put'
      then v_net_put  := v_net_put  + v_dir * (v_leg->>'quantity')::numeric;
    elsif v_leg->>'instrument_type' = 'call'
      then v_net_call := v_net_call + v_dir * (v_leg->>'quantity')::numeric;
    elsif v_leg->>'side' = 'long'
      then v_shares   := v_shares   + (v_leg->>'quantity')::numeric;
    end if;
  end loop;
  if v_net_put < -0.000001 then
    raise exception 'uncovered net short puts (%)', v_net_put; end if;
  if v_net_call + v_shares / 100.0 < -0.000001 then
    raise exception 'uncovered net short calls (%)', v_net_call; end if;

  -- PASS 2: write
  for v_leg in select * from jsonb_array_elements(p_legs) loop
    v_dir := case when v_leg->>'side' = 'long' then 1 else -1 end;
    if v_leg->>'instrument_type' <> 'equity' then
      v_upfront := v_upfront - (v_leg->>'entry_price')::numeric
                   * (v_leg->>'quantity')::numeric * 100 * v_dir;
    end if;
    insert into positions (account_id, user_id, instrument_type, side, quantity,
                           entry_price, strike, entry_iv, strategy_id,
                           expiration_date, stop_loss_price, take_profit_price)
    values (p_account_id, v_user,
            v_leg->>'instrument_type', v_leg->>'side',
            (v_leg->>'quantity')::numeric, (v_leg->>'entry_price')::numeric,
            (v_leg->>'strike')::numeric, (v_leg->>'entry_iv')::numeric,
            (v_leg->>'strategy_id')::uuid, v_leg->>'expiration_date',
            (v_leg->>'stop_loss_price')::numeric, (v_leg->>'take_profit_price')::numeric)
    returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end loop;

  if v_upfront <> 0 then
    update accounts set balance = balance + v_upfront where id = p_account_id;
  end if;
  return query select v_ids,
    (select balance from accounts where id = p_account_id);
end $$;

-- ── 2. Close listed positions (SL/TP/manual) ────────────────────
create or replace function public.close_positions(
  p_account_id uuid, p_exits jsonb, p_reason text
) returns numeric                        -- total settlement applied
language plpgsql security definer set search_path = public
as $$
declare v_exit jsonb; v_total numeric := 0;
begin
  perform _assert_account_owner(p_account_id);
  if p_reason not in ('manual','sl','tp','day_end','liquidation','finalized') then
    raise exception 'invalid close reason %', p_reason;
  end if;
  if (select status from accounts where id = p_account_id) <> 'active' then
    raise exception 'account not active';
  end if;
  for v_exit in select * from jsonb_array_elements(p_exits) loop
    v_total := v_total + _settle_and_log(p_account_id,
      (v_exit->>'position_id')::uuid, (v_exit->>'exit_price')::numeric, p_reason);
  end loop;
  if v_total <> 0 then
    update accounts set balance = balance + v_total where id = p_account_id;
  end if;
  return v_total;
end $$;

-- ── 3. Day close: settle all + purge pendings + roll the day ────
create or replace function public.day_close(
  p_account_id uuid, p_exits jsonb
) returns json
language plpgsql security definer set search_path = public
as $$
declare v_exit jsonb; v_total numeric := 0; v_open int;
        v_old_dse numeric; v_bal numeric; v_day numeric;
begin
  perform _assert_account_owner(p_account_id);
  if (select status from accounts where id = p_account_id) <> 'active' then
    raise exception 'account not active';
  end if;
  select count(*) into v_open from positions where account_id = p_account_id;
  if v_open <> coalesce(jsonb_array_length(p_exits), 0) then
    raise exception 'exits (%) do not cover open positions (%) — refetch and retry',
      coalesce(jsonb_array_length(p_exits), 0), v_open;
  end if;

  select day_start_equity into v_old_dse from accounts where id = p_account_id;
  for v_exit in select * from jsonb_array_elements(coalesce(p_exits, '[]'::jsonb)) loop
    v_total := v_total + _settle_and_log(p_account_id,
      (v_exit->>'position_id')::uuid, (v_exit->>'exit_price')::numeric, 'day_end');
  end loop;
  if v_total <> 0 then
    update accounts set balance = balance + v_total where id = p_account_id;
  end if;
  delete from pending_orders where account_id = p_account_id;

  select balance into v_bal from accounts where id = p_account_id;
  v_day := v_bal - v_old_dse;
  update accounts
     set day_start_equity = v_bal,
         daily_pnls = daily_pnls || v_day,
         day_started_at = now()
   where id = p_account_id;

  return json_build_object('settled', v_total, 'day_pnl', v_day, 'balance', v_bal);
end $$;

-- ── 4. Finalize (pass/fail): settle all + status + funded child ─
create or replace function public.finalize_account(
  p_account_id uuid, p_status text,
  p_fail_reason text default null, p_exits jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public
as $$
declare v_exit jsonb; v_total numeric := 0; v_open int;
        v_phase text; v_starting numeric; v_child uuid; v_bal numeric;
begin
  perform _assert_account_owner(p_account_id);
  if p_status not in ('passed','failed') then
    raise exception 'invalid final status %', p_status; end if;
  select phase, starting_balance into v_phase, v_starting
    from accounts where id = p_account_id;

  select count(*) into v_open from positions where account_id = p_account_id;
  if v_open <> coalesce(jsonb_array_length(p_exits), 0) then
    raise exception 'exits do not cover open positions — refetch and retry'; end if;
  for v_exit in select * from jsonb_array_elements(coalesce(p_exits,'[]'::jsonb)) loop
    v_total := v_total + _settle_and_log(p_account_id,
      (v_exit->>'position_id')::uuid, (v_exit->>'exit_price')::numeric, 'finalized');
  end loop;
  if v_total <> 0 then
    update accounts set balance = balance + v_total where id = p_account_id;
  end if;
  delete from pending_orders where account_id = p_account_id;
  update accounts set status = p_status, fail_reason = p_fail_reason
   where id = p_account_id;

  v_child := null;
  if p_status = 'passed' and v_phase = 'evaluation' then
    if not exists (select 1 from accounts where source_account_id = p_account_id) then
      insert into accounts (user_id, symbol, epoch, starting_balance, balance,
                            peak_equity, day_start_equity, status, phase,
                            payment_status, source_account_id)
      select user_id, symbol, epoch, v_starting, v_starting, v_starting,
             v_starting, 'active', 'funded', 'pending', p_account_id
        from accounts where id = p_account_id
      returning id into v_child;   -- UNIQUE index guards twin-mints
    end if;
  end if;

  select balance into v_bal from accounts where id = p_account_id;
  return json_build_object('balance', v_bal, 'funded_account_id', v_child);
end $$;

-- ── 5–8. Small scoped writes ────────────────────────────────────
create or replace function public.set_replay_index(
  p_account_id uuid, p_index int) returns void
language sql security definer set search_path = public
as $$ update accounts set replay_bar_index = p_index
      where id = p_account_id and user_id = auth.uid() and status = 'active' $$;

create or replace function public.update_peak_equity(
  p_account_id uuid, p_peak numeric) returns void
language sql security definer set search_path = public
as $$ update accounts set peak_equity = p_peak
      where id = p_account_id and user_id = auth.uid()
        and status = 'active' and peak_equity < p_peak $$;  -- never lowers

create or replace function public.place_pending_order(
  p_account_id uuid, p_side text, p_order_type text, p_quantity numeric,
  p_trigger numeric, p_sl numeric default null, p_tp numeric default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform _assert_account_owner(p_account_id);
  if (select status from accounts where id = p_account_id) <> 'active' then
    raise exception 'account not active'; end if;
  if p_side not in ('long','short') or p_order_type not in ('limit','stop')
     or p_quantity <= 0 or p_trigger <= 0 then
    raise exception 'invalid order parameters'; end if;
  delete from pending_orders where account_id = p_account_id;  -- one resting order max
  insert into pending_orders (account_id, user_id, side, order_type, quantity,
                              trigger_price, stop_loss_price, take_profit_price)
  values (p_account_id, auth.uid(), p_side, p_order_type, p_quantity,
          p_trigger, p_sl, p_tp)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancel_pending_order(
  p_account_id uuid, p_order_id uuid) returns void
language sql security definer set search_path = public
as $$ delete from pending_orders
      where id = p_order_id and account_id = p_account_id
        and user_id = auth.uid() $$;
export type AccountStatus = "active" | "passed" | "failed";
export type FailReason = "daily_loss" | "trailing_drawdown" | null;
export type Side = "long" | "short";
export type AccountPhase = "evaluation" | "funded";
export type OrderType = "market" | "limit" | "stop";
export type InstrumentType = "equity" | "call" | "put";
export type OptionType = "call" | "put";
export type PaymentStatus = "not_required" | "pending" | "paid" | "failed";

export function isOptionType(value: InstrumentType): value is OptionType {
  return value === "call" || value === "put";
}

export function isEquityType(value: InstrumentType): value is "equity" {
  return value === "equity";
}

export interface Account {
  id: string;
  user_id: string;
  symbol: string;
  phase: AccountPhase;
  starting_balance: number;
  balance: number;
  peak_equity: number;
  day_start_equity: number;
  day_started_at: string;
  replay_bar_index: number;
  daily_pnls: number[];
  leverage: number;
  source_account_id: string | null;
  status: AccountStatus;
  payment_status: PaymentStatus;
  fail_reason: FailReason;
  epoch: string;
  created_at: string;
}

export interface Position {
  id: string;
  account_id: string;
  user_id: string;
  instrument_type: InstrumentType;
  side: Side;
  quantity: number;
  entry_price: number;
  strike: number | null;
  entry_iv: number | null;
  strategy_id: string | null;
  expiration_date: string | null;
  opened_at: string;
  stop_loss_price: number | null;
  take_profit_price: number | null;
}

export interface Trade {
  id: string;
  account_id: string;
  user_id: string;
  instrument_type: InstrumentType;
  side: Side;
  quantity: number;
  entry_price: number;
  exit_price: number;
  strike: number | null;
  pnl: number;
  opened_at: string;
  closed_at: string;
  close_reason: string;
  strategy_id: string | null;
}

export interface PendingOrder {
  id: string;
  account_id: string;
  user_id: string;
  side: Side;
  order_type: "limit" | "stop";
  quantity: number;
  trigger_price: number;
  created_at: string;
  stop_loss_price: number | null;
  take_profit_price: number | null;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  status: "pending" | "processing" | "completed" | "rejected";
  created_at: string;
  completed_at: string | null;
}

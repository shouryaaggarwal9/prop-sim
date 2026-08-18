"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function requestWithdrawal(accountId: string, amount: number) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify account is funded, active, and belongs to user
  const { data: account } = await supabase
    .from("accounts")
    .select("balance, status, phase")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!account || account.phase !== "funded" || account.status !== "active") {
    return { error: "Invalid account for withdrawal." };
  }
  if (amount <= 0 || amount > account.balance) {
    return { error: "Withdrawal amount exceeds available balance." };
  }

  const { error } = await supabase.from("withdrawals").insert({
    user_id: user.id,
    account_id: accountId,
    amount,
    status: "pending",
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function getWithdrawals(accountId: string) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

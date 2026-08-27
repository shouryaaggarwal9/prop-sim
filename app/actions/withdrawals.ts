"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function requestWithdrawal(accountId: string, amount: number) {
  if (amount <= 0) return { error: "Amount must be greater than zero." };

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data, error } = await supabase.rpc("request_withdrawal", {
    p_account_id: accountId,
    p_amount: amount,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/trade/${accountId}`);
  return { data };
}

export async function getWithdrawals(accountId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data ?? [];
}
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";
import type { Account } from "@/lib/trading/types";

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return <DashboardClient initialAccounts={(accounts as Account[]) ?? []} />;
}

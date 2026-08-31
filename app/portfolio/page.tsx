import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import PortfolioClient from "./PortfolioClient";
import type { Account } from "@/lib/trading/types";

export default async function PortfolioPage() {
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

  return (
    <div className="flex-1 px-4 py-6 md:px-8">
      <PortfolioClient initialAccounts={(accounts as Account[]) ?? []} />
    </div>
  );
}

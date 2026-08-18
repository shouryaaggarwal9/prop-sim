import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import TradeClient from "./TradeClient";

export default async function TradePage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Verify ownership before rendering the client component
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) redirect("/dashboard");

  return <TradeClient accountId={accountId} />;
}

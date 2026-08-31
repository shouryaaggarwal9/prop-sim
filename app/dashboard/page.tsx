import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-6">
      <DashboardClient />
    </div>
  );
}

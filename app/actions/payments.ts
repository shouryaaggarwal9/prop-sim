"use server";

import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const EVALUATION_FEE_CENTS = 10000; // $100.00 — change to whatever you want

export async function createCheckoutSession(accountId: string) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify ownership and that payment is actually pending
  const { data: account } = await supabase
    .from("accounts")
    .select("id, status, payment_status, phase")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!account || account.payment_status !== "pending") {
    throw new Error("No payment required for this account.");
  }

  // Create Stripe checkout session (test mode)
  const session = await stripe.checkout.sessions.create({
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "PropSim Funded Account Activation",
            description: `Evaluation fee for ${account.phase} account`,
          },
          unit_amount: EVALUATION_FEE_CENTS,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/trade/${accountId}?payment=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/trade/${accountId}?payment=canceled`,
    metadata: {
      accountId,
      userId: user.id,
    },
  });

  // Record pending payment in our DB
  await supabase.from("payments").insert({
    user_id: user.id,
    account_id: accountId,
    amount: EVALUATION_FEE_CENTS,
    currency: "usd",
    stripe_session_id: session.id,
    status: "pending",
    type: "evaluation_fee",
  });

  redirect(session.url!);
}

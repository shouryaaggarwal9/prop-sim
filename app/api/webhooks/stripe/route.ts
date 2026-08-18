import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature")!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const accountId = session.metadata.accountId;

    // Server-to-server client with the NEW secret key (not legacy service_role)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { error: accountErr } = await supabase
      .from("accounts")
      .update({ status: "active", payment_status: "paid" })
      .eq("id", accountId);

    if (accountErr) {
      console.error("Failed to activate account:", accountErr);
      return NextResponse.json({ error: accountErr.message }, { status: 500 });
    }

    const { error: paymentErr } = await supabase
      .from("payments")
      .update({
        status: "succeeded",
        stripe_payment_intent_id: session.payment_intent,
      })
      .eq("stripe_session_id", session.id);

    if (paymentErr) {
      console.error("Failed to update payment:", paymentErr);
      return NextResponse.json({ error: paymentErr.message }, { status: 500 });
    }

    console.log("Account activated via webhook:", accountId);
  }

  return NextResponse.json({ received: true });
}

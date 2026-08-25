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

    // Server-to-server client (service role bypasses RLS by design).
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // AUTHORITY: the payments row — matched by Stripe session id, NOT metadata.
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("*")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (payErr) {
      console.error("[webhook] payments lookup failed:", payErr);
      return NextResponse.json({ error: payErr.message }, { status: 500 }); // retry-worthy
    }
    if (!payment) {
      // Unknown session — config drift or foreign environment. Do NOT 500
      // (Stripe would retry forever); scream in logs instead.
      console.error("[webhook] no payments row for session", session.id);
      return NextResponse.json({ received: true });
    }

    // AMOUNT MATCH: cents vs cents.
    if (session.amount_total !== payment.amount) {
      console.error(
        `[webhook] AMOUNT MISMATCH session ${session.id}: stripe=${session.amount_total} db=${payment.amount}`,
      );
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("id", payment.id);
      return NextResponse.json({ error: "amount mismatch" }, { status: 400 });
    }

    // 3A-1

    // IDEMPOTENCY: redeliveries converge instead of re-activating.
    if (payment.status === "succeeded") {
      await supabase
        .from("accounts") // harmless if already paid — guard below no-ops
        .update({ payment_status: "paid" })
        .eq("id", payment.account_id)
        .eq("payment_status", "pending");
      return NextResponse.json({ received: true });
    }

    // ACTIVATE — guarded at SQL level: only flips a genuinely-pending account.
    const { data: activated, error: accErr } = await supabase
      .from("accounts")
      .update({ payment_status: "paid" })
      .eq("id", payment.account_id)
      .eq("payment_status", "pending")
      .select("id");

    if (accErr) {
      console.error("[webhook] account activation failed:", accErr);
      return NextResponse.json({ error: accErr.message }, { status: 500 }); // retry-worthy
    }
    if (!activated || activated.length === 0) {
      console.error(
        `[webhook] account ${payment.account_id} was not pending — manual inspection advised`,
      );
    }

    const { error: updErr } = await supabase
      .from("payments")
      .update({
        status: "succeeded",
        stripe_payment_intent_id: session.payment_intent ?? null,
      })
      .eq("id", payment.id)
      .eq("status", "pending"); // idempotent redelivery guard

    if (updErr) {
      console.error("[webhook] payment settle failed:", updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    console.log("[webhook] activated:", payment.account_id);
  }

  return NextResponse.json({ received: true });
}

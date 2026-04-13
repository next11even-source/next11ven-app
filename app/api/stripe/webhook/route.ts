import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { onUserUpgradedToPremium } from '@/lib/mailerlite'

export const dynamic = 'force-dynamic'

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // Stripe API 2026-03-25.dahlia: subscription is on invoice.parent.subscription_details.subscription
  const subRef = invoice.parent?.subscription_details?.subscription
  if (!subRef) return null
  return typeof subRef === 'string' ? subRef : subRef.id
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Stripe webhook] signature verification failed:', message)
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 })
  }

  const supabase = serviceSupabase()

  try {
    switch (event.type) {
      // ── Subscription created / reactivated ──────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubscriptionChange(supabase, sub)
        break
      }

      // ── Payment succeeded (safe redundant flip) ──────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = getSubscriptionIdFromInvoice(invoice)
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          await handleSubscriptionChange(supabase, sub)
        }
        break
      }

      // ── Subscription cancelled / expired ────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(supabase, sub)
        break
      }

      // ── Payment failed ───────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = getSubscriptionIdFromInvoice(invoice)
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          if (sub.status === 'past_due' || sub.status === 'unpaid') {
            await revokeAccess(supabase, sub)
          }
        }
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[Stripe webhook] handler error:', err)
    return NextResponse.json({ error: 'Internal handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveUserId(
  supabase: ReturnType<typeof serviceSupabase>,
  sub: Stripe.Subscription
): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id
  if (fromMeta) return fromMeta

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  return data?.id ?? null
}

async function handleSubscriptionChange(
  supabase: ReturnType<typeof serviceSupabase>,
  sub: Stripe.Subscription
) {
  const userId = await resolveUserId(supabase, sub)
  if (!userId) {
    console.error('[Stripe webhook] could not resolve user for subscription', sub.id)
    return
  }

  const isActive = sub.status === 'active' || sub.status === 'trialing'
  const role = sub.metadata?.role as string | undefined
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const priceId = sub.items.data[0]?.price?.id ?? null

  // Check existing premium state before updating — only tag on first activation
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('email, role, premium')
    .eq('id', userId)
    .single()

  await supabase
    .from('profiles')
    .update({
      premium: isActive,
      stripe_customer_id: customerId,
    })
    .eq('id', userId)

  // Fire MailerLite tag only when premium flips to true (not on renewals)
  if (isActive && !existingProfile?.premium && existingProfile?.email) {
    const profileRole = role ?? existingProfile.role ?? null
    onUserUpgradedToPremium(existingProfile.email, profileRole).catch(err =>
      console.error('[MailerLite] onUserUpgradedToPremium error:', err)
    )
  }

  await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    role: role ?? null,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' })
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof serviceSupabase>,
  sub: Stripe.Subscription
) {
  await revokeAccess(supabase, sub)
}

async function revokeAccess(
  supabase: ReturnType<typeof serviceSupabase>,
  sub: Stripe.Subscription
) {
  const userId = await resolveUserId(supabase, sub)
  if (!userId) return

  await supabase
    .from('profiles')
    .update({ premium: false })
    .eq('id', userId)

  await supabase
    .from('subscriptions')
    .update({
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', sub.id)
}

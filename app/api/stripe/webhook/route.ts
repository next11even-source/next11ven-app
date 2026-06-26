import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { onUserUpgradedToPremium } from '@/lib/mailerlite'
import {
  sendExtraMessagesPurchaseEmail,
  sendPaymentFailedEmail,
} from '@/lib/email'
import { reportError } from '@/lib/alert'

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

      // ── One-time message pack purchase ──────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.type === 'message_pack') {
          await handleMessagePackPurchase(supabase, session)
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
        await handlePaymentFailedNotifications(supabase, invoice)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[Stripe webhook] handler error:', err)
    reportError('/api/stripe/webhook', err, `event: ${event.type}`)
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

  const isFirstActivation = isActive && !existingProfile?.premium

  await supabase
    .from('profiles')
    .update({
      premium: isActive,
      stripe_customer_id: customerId,
    })
    .eq('id', userId)

  // Fire MailerLite tag only when premium flips to true (not on renewals)
  if (isFirstActivation && existingProfile?.email) {
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
    current_period_start: sub.items.data[0]?.current_period_start
      ? new Date(sub.items.data[0].current_period_start * 1000).toISOString()
      : null,
    current_period_end: sub.items.data[0]?.current_period_end
      ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' })

  // Upsert quota row for premium players on each subscription event
  const profileRole = role ?? existingProfile?.role
  const isPlayerRole = profileRole === 'player' || profileRole === 'admin'
  if (isActive && isPlayerRole && sub.items.data[0]?.current_period_start) {
    const periodStart = new Date(sub.items.data[0].current_period_start * 1000).toISOString()
    const periodEnd = new Date(sub.items.data[0].current_period_end * 1000).toISOString()
    await supabase.from('player_message_quota').upsert({
      player_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      messages_used: 0,
      messages_limit: 3,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'player_id,period_start', ignoreDuplicates: true })
  }
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof serviceSupabase>,
  sub: Stripe.Subscription
) {
  const userId = await resolveUserId(supabase, sub)
  if (!userId) return

  await supabase.from('profiles').update({ premium: false, actively_looking: false }).eq('id', userId)
  await supabase.from('subscriptions').update({
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }).eq('stripe_subscription_id', sub.id)

  // Queue win-back email in 3 days (step 98, processed by drip cron)
  await supabase.from('drip_jobs').insert({
    recipient_id: userId,
    message_id: null,
    sequence_step: 98,
    send_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    sent: false,
  })
}

async function handlePaymentFailedNotifications(
  supabase: ReturnType<typeof serviceSupabase>,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer
    ? (typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id)
    : null
  if (!customerId) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, sms_opt_in, last_sms_at')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!profile) return

  // One dunning episode per retry cycle: Stripe fires payment_failed on every
  // retry (~4 over 2 weeks). If a step-99 follow-up was queued for this user
  // in the last 14 days, this is the same failure — send nothing further.
  // (Access revocation is handled separately and is unaffected.)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
  const { data: existingJob } = await supabase
    .from('drip_jobs')
    .select('id')
    .eq('recipient_id', profile.id)
    .eq('sequence_step', 99)
    .gte('send_at', fourteenDaysAgo)
    .limit(1)
    .maybeSingle()
  if (existingJob) return

  // Email — transactional, never suppressed
  if (profile.email) {
    sendPaymentFailedEmail({ to: profile.email, toName: profile.full_name }).catch(err =>
      console.error('[Stripe webhook] payment_failed email error:', err)
    )
  }

  // SMS — check opt-in and 24h rate limit
  const appUrl = process.env.APP_URL ?? 'https://app.next11ven.com'
  const lastSms = profile.last_sms_at ? new Date(profile.last_sms_at) : null
  const smsAllowed = !lastSms || Date.now() - lastSms.getTime() > 86_400_000

  if (
    smsAllowed &&
    process.env.TWILIO_ENABLED !== 'false' &&
    profile.phone &&
    profile.sms_opt_in === true &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    try {
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization:
              'Basic ' +
              Buffer.from(
                `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
              ).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: process.env.TWILIO_FROM_NUMBER,
            To: profile.phone,
            Body: `Your NEXT11VEN premium payment failed. Update your card to restore access: ${appUrl}/dashboard/premium`,
          }),
        }
      )
      await supabase
        .from('profiles')
        .update({ last_sms_at: new Date().toISOString() })
        .eq('id', profile.id)
    } catch (err) {
      console.error('[Stripe webhook] payment_failed SMS error:', err)
    }
  }

  // Queue 48h follow-up (step 99, processed by drip cron)
  await supabase.from('drip_jobs').insert({
    recipient_id: profile.id,
    message_id: null,
    sequence_step: 99,
    send_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    sent: false,
  })
}

async function handleMessagePackPurchase(
  supabase: ReturnType<typeof serviceSupabase>,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.supabase_user_id
  const credits = parseInt(session.metadata?.credits ?? '5', 10)

  if (!userId) {
    console.error('[Stripe webhook] message_pack: missing supabase_user_id in metadata')
    return
  }

  const { error } = await supabase.rpc('add_message_credits', {
    p_user_id: userId,
    p_amount: credits,
  })

  if (error) {
    console.error('[Stripe webhook] message_pack: failed to add credits:', error)
    return
  }

  // Fetch updated profile for confirmation email
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name, purchased_message_credits')
    .eq('id', userId)
    .single()

  if (profile?.email) {
    sendExtraMessagesPurchaseEmail({
      to: profile.email,
      playerName: profile.full_name,
      credits,
      totalCredits: profile.purchased_message_credits ?? credits,
    }).catch(err => console.error('[Email] extra messages confirmation error:', err))
  }
}

async function revokeAccess(
  supabase: ReturnType<typeof serviceSupabase>,
  sub: Stripe.Subscription
) {
  const userId = await resolveUserId(supabase, sub)
  if (!userId) return

  await supabase
    .from('profiles')
    .update({ premium: false, actively_looking: false })
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

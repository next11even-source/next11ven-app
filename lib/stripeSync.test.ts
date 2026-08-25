import { describe, it, expect } from 'vitest'
import { needsStripeSync, STRIPE_SYNC_RECHECK_DAYS } from './stripeSync'

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

describe('needsStripeSync', () => {
  it('never asks about a premium user', () => {
    expect(needsStripeSync({ premium: true, stripe_synced_at: null })).toBe(false)
    expect(needsStripeSync({ premium: true, stripe_synced_at: daysAgo(999) })).toBe(false)
  })

  it('asks when the user has never been checked', () => {
    expect(needsStripeSync({ premium: false, stripe_synced_at: null })).toBe(true)
    expect(needsStripeSync({ premium: false })).toBe(true)
    expect(needsStripeSync({})).toBe(true)
  })

  it('does not ask again inside the recheck window — the whole point', () => {
    expect(needsStripeSync({ premium: false, stripe_synced_at: daysAgo(0) })).toBe(false)
    expect(needsStripeSync({ premium: false, stripe_synced_at: daysAgo(1) })).toBe(false)
    expect(
      needsStripeSync({ premium: false, stripe_synced_at: daysAgo(STRIPE_SYNC_RECHECK_DAYS - 1) })
    ).toBe(false)
  })

  it('asks again once the window has passed, so the net still re-casts', () => {
    expect(
      needsStripeSync({ premium: false, stripe_synced_at: daysAgo(STRIPE_SYNC_RECHECK_DAYS + 1) })
    ).toBe(true)
  })

  it('re-syncs on an unparseable timestamp rather than stranding the user on free', () => {
    expect(needsStripeSync({ premium: false, stripe_synced_at: 'not-a-date' })).toBe(true)
    expect(needsStripeSync({ premium: false, stripe_synced_at: '' })).toBe(true)
  })
})

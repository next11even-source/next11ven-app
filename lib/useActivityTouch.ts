'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'

const STAMP_PREFIX = 'n11_last_active_day'

/**
 * Activity touch — writes profiles.last_active for the signed-in user.
 *
 * Powers the tier-blind, activity-first ordering on the player/coach browse
 * lists, the Recently Active marquees, and the "Active" recency chips.
 *
 * Throttled to at most one write per user per browser per day so navigation
 * doesn't spam the DB. The stamp is keyed by user id — a shared browser must
 * not suppress the second account's touch.
 *
 * MUST be called from every persistent layout, for every role. A role that
 * only ever renders layouts without this hook will look permanently inactive
 * no matter how often they sign in.
 *
 * @param userId Pass the id if the caller has already resolved it (avoids a
 *   second auth round-trip). Pass `undefined` to let the hook resolve it, or
 *   `null` while it's still loading / signed out.
 */
export function useActivityTouch(userId?: string | null) {
  useEffect(() => {
    if (userId === null) return

    const supabase = createClient()

    const touch = (id: string) => {
      try {
        const key = `${STAMP_PREFIX}:${id}`
        const today = new Date().toISOString().slice(0, 10)
        if (localStorage.getItem(key) === today) return
        localStorage.setItem(key, today)
      } catch {
        // localStorage unavailable (private mode) — fall through and write
        // anyway rather than silently going dark on this browser.
      }
      supabase
        .from('profiles')
        .update({ last_active: new Date().toISOString() })
        .eq('id', id)
        .then(() => {})
    }

    if (userId) {
      touch(userId)
      return
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) touch(user.id)
    })
  }, [userId])
}

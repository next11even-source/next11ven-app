/**
 * Shared audience filter type + query builder for the broadcast composer.
 * Used by both the preview and send API routes so filter logic stays in one place.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { HIDDEN_PROFILE_FILTER } from '@/lib/hiddenProfiles'

export type AudienceFilter = {
  role: 'all' | 'player' | 'coach'
  tier: 'all' | 'pro' | 'free'
  joined: 'all' | '7d' | '14d' | '30d' | '90d'
  activity: 'all' | 'never_active' | 'active_30d'
}

export type Recipient = {
  id: string
  email: string
  full_name: string | null
}

const JOINED_DAYS: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }

export async function getAudienceRecipients(
  service: SupabaseClient,
  filter: AudienceFilter
): Promise<Recipient[]> {
  let q = service
    .from('profiles')
    .select('id, email, full_name')
    .eq('approved', true)
    .eq('email_marketing_opt_out', false)
    .not('email', 'is', null)
    .not('id', 'in', HIDDEN_PROFILE_FILTER)
    .limit(5000)

  if (filter.role === 'player') q = q.in('role', ['player', 'admin'])
  else if (filter.role === 'coach') q = q.eq('role', 'coach')
  else q = q.in('role', ['player', 'coach', 'admin'])

  if (filter.tier === 'pro') q = q.eq('premium', true)
  else if (filter.tier === 'free') q = q.eq('premium', false)

  if (filter.joined !== 'all') {
    const days = JOINED_DAYS[filter.joined] ?? 0
    if (days) q = q.gte('created_at', new Date(Date.now() - days * 86_400_000).toISOString())
  }

  if (filter.activity === 'never_active') q = q.is('last_active', null)
  else if (filter.activity === 'active_30d') q = q.gte('last_active', new Date(Date.now() - 30 * 86_400_000).toISOString())

  const { data, error } = await q
  if (error) throw error
  return (data ?? []).filter(r => r.email) as Recipient[]
}

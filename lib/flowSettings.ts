/**
 * Flow-level and feature-flag helpers.
 *
 * Reads from flow_settings and feature_flags tables.
 * All reads fail-open: a missing row is treated as enabled (flow_settings)
 * or false (feature_flags), so a DB error never silently enables a feature
 * that was supposed to be gated.
 *
 * All functions are non-blocking on failure — they return the safe default
 * rather than throwing, so a DB hiccup never stops a cron mid-run.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns a map of { [flowId]: enabled } for the requested flow IDs.
 * Missing rows default to true (fail-open — don't accidentally disable a working flow).
 * Callers should use service-role client so RLS doesn't interfere.
 */
export async function getFlowSettings(
  supabase: SupabaseClient,
  flowIds: string[]
): Promise<Record<string, boolean>> {
  if (flowIds.length === 0) return {}

  const defaults: Record<string, boolean> = {}
  for (const id of flowIds) defaults[id] = true

  try {
    const { data, error } = await supabase
      .from('flow_settings')
      .select('flow_id, enabled')
      .in('flow_id', flowIds)

    if (error || !data) return defaults

    const result = { ...defaults }
    for (const row of data) {
      result[row.flow_id] = row.enabled
    }
    return result
  } catch {
    return defaults
  }
}

/**
 * Convenience: check a single flow. Returns true if enabled or row missing.
 */
export async function isFlowEnabled(
  supabase: SupabaseClient,
  flowId: string
): Promise<boolean> {
  const settings = await getFlowSettings(supabase, [flowId])
  return settings[flowId] ?? true
}

/**
 * Read the native_onboarding feature flag.
 * Returns false if the row is missing or if the DB errors — fail-safe,
 * because the "false" branch falls back to MailerLite which is already
 * working, so a DB hiccup never accidentally cuts over to an untested path.
 */
export async function isNativeOnboardingEnabled(
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_id', 'native_onboarding')
      .maybeSingle()

    if (error || !data) return false
    return data.enabled === true
  } catch {
    return false
  }
}

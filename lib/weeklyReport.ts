// Weekly Telegram report formatter.
// Pure functions — takes the analytics_weekly_snapshot() payload (current + prior week)
// and renders the Telegram HTML message with week-over-week deltas on every line.
//
// Labelling convention: (7d) = this-week flow · (now) = current total/stock · (24h) = today.

export type Metrics = Record<string, number | null>

// ─── format + delta helpers ───────────────────────────────────────────────────

function pounds(pence: number | null | undefined): string {
  const v = (pence ?? 0) / 100
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

function signedPounds(pence: number): string {
  return `${pence >= 0 ? '+' : '−'}${pounds(Math.abs(pence))}`
}

// Δ annotation for a plain count
function d(cur: number | null, prev: number | null | undefined): string {
  if (cur === null) return ''
  if (prev === undefined || prev === null) return ''
  const diff = cur - prev
  if (diff === 0) return ' <i>(±0)</i>'
  return diff > 0 ? ` <i>(↑${diff})</i>` : ` <i>(↓${Math.abs(diff)})</i>`
}

// Δ annotation for money (pence in, £ delta out)
function dMoney(cur: number | null, prev: number | null | undefined): string {
  if (cur === null) return ''
  if (prev === undefined || prev === null) return ''
  const diff = cur - prev
  if (diff === 0) return ' <i>(±0)</i>'
  return diff > 0 ? ` <i>(↑${pounds(diff)})</i>` : ` <i>(↓${pounds(Math.abs(diff))})</i>`
}

// Δ annotation for percentage-point metrics (nullable)
function dPts(cur: number | null, prev: number | null | undefined): string {
  if (cur === null || prev === undefined || prev === null) return ''
  const diff = cur - prev
  if (diff === 0) return ' <i>(±0)</i>'
  return diff > 0 ? ` <i>(↑${diff}pts)</i>` : ` <i>(↓${Math.abs(diff)}pts)</i>`
}

const pct = (n: number | null) => (n === null || n === undefined ? '—' : `${n}%`)
const num = (n: number | null) => (n === null || n === undefined ? '—' : String(n))

function rate(numer: number, denom: number): number | null {
  if (!denom) return null
  return Math.round((numer / denom) * 100)
}

function arpuPence(m: Metrics): number | null {
  const subs = m.active_subs ?? 0
  if (!subs) return null
  return Math.round((m.mrr_pence ?? 0) / subs)
}

export function buildReport(cur: Metrics, prev: Metrics | null): string {
  const p = (k: string) => (prev ? prev[k] : undefined)
  const L: string[] = []

  const weekLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  L.push(`📊 <b>NEXT11VEN — WEEKLY REPORT</b>`)
  L.push(`🗓 <i>${weekLabel} · last 7 days vs prior week</i>`)
  if (!prev) L.push(`<i>⚠️ first snapshot — deltas start next week</i>`)

  // ── 💰 Money (current) ──────────────────────────────────────────────────────
  const arpu = arpuPence(cur)
  const arpuPrev = prev ? arpuPence(prev) : undefined
  const newMrr = cur.new_premium_player_pence ?? 0
  const netMrr = newMrr - (cur.voluntary_churn_pence ?? 0)
  L.push('')
  L.push(`💰 <b>MONEY</b> <i>(now)</i>`)
  L.push(`💷 MRR (players): <b>${pounds(cur.mrr_pence)}</b>${dMoney(cur.mrr_pence, p('mrr_pence'))}`)
  L.push(`📈 ARPU: <b>${arpu === null ? '—' : pounds(arpu)}</b>${dMoney(arpu, arpuPrev)}`)
  L.push(`👥 Active premium players: <b>${num(cur.active_subs)}</b>${d(cur.active_subs, p('active_subs'))}`)
  L.push(`🔄 Net MRR this week (new − churn): <b>${signedPounds(netMrr)}</b>`)

  // ── 🆕 Premium movement (this week) ─────────────────────────────────────────
  L.push('')
  L.push(`🆕 <b>PREMIUM MOVEMENT</b> <i>(7d)</i>`)
  L.push(`⬆️ New premium players: <b>${num(cur.new_premium_player_count)}</b> · ${pounds(cur.new_premium_player_pence)}/mo${d(cur.new_premium_player_count, p('new_premium_player_count'))}`)
  L.push(`⬇️ Voluntary churn: <b>${num(cur.voluntary_churn_count)}</b> · ${pounds(cur.voluntary_churn_pence)}/mo${d(cur.voluntary_churn_count, p('voluntary_churn_count'))}`)
  L.push(`⚠️ In dunning (failed payment): <b>${num(cur.dunning_count)}</b> · ${pounds(cur.dunning_pence)}/mo${d(cur.dunning_count, p('dunning_count'))}`)
  const netPrem = (cur.new_premium_player_count ?? 0) - (cur.voluntary_churn_count ?? 0)
  L.push(`➕ Net premium change: <b>${netPrem >= 0 ? '+' : '−'}${Math.abs(netPrem)}</b>`)

  const adoption = rate(cur.actively_looking_premium ?? 0, cur.premium_players ?? 0)
  const adoptionPrev = prev ? rate(p('actively_looking_premium') ?? 0, p('premium_players') ?? 0) : undefined
  const newPremPlayers = cur.new_premium_player_count ?? 0
  const conv = rate(newPremPlayers, cur.active_free_players ?? 0)
  L.push(`🎯 Actively Looking adoption: <b>${pct(adoption)}</b> of premium${dPts(adoption, adoptionPrev)}`)
  L.push(`💸 Conversion (new ÷ active free): <b>${pct(conv)}</b> <i>(${newPremPlayers}/${num(cur.active_free_players)})</i>`)

  // ── 🚀 Growth (this week) ───────────────────────────────────────────────────
  L.push('')
  L.push(`🚀 <b>GROWTH</b> <i>(7d)</i>`)
  const totalSignups = (cur.new_players ?? 0) + (cur.new_coaches ?? 0)
  const totalSignupsPrev = prev ? (p('new_players') ?? 0) + (p('new_coaches') ?? 0) : undefined
  L.push(`✍️ Sign-ups: <b>${totalSignups}</b> (${num(cur.new_players)} players · ${num(cur.new_coaches)} coaches)${d(totalSignups, totalSignupsPrev)}`)
  const completed = (cur.new_players_completed ?? 0) + (cur.new_coaches_completed ?? 0)
  L.push(`✅ Activated (completed profile): <b>${completed}</b> (${num(cur.new_players_completed)} · ${num(cur.new_coaches_completed)})`)
  L.push(`🗂 Total registered <i>(now)</i>: <b>${num(cur.total_players)}</b> players · <b>${num(cur.total_coaches)}</b> coaches${d(cur.total_players, p('total_players'))}`)
  const totalApproved = (cur.total_players ?? 0) + (cur.total_coaches ?? 0)
  const migPct = rate(cur.ever_signed_in ?? 0, totalApproved)
  L.push(`🔄 Migration: <b>${pct(migPct)}</b> of approved users have signed into the new app <i>(${num(cur.ever_signed_in)}/${totalApproved})</i>`)

  // ── 🔥 Active users ─────────────────────────────────────────────────────────
  L.push('')
  L.push(`🔥 <b>ACTIVE USERS</b>`)
  L.push(`📅 WAU <i>(7d)</i>: <b>${num(cur.wau_total)}</b> (${num(cur.wau_players)} players · ${num(cur.wau_coaches)} coaches)${d(cur.wau_total, p('wau_total'))}`)
  const returning = (cur.wau_total ?? 0) - (cur.wau_new ?? 0)
  L.push(`   ↳ ${returning} returning · ${num(cur.wau_new)} new`)
  L.push(`☀️ DAU <i>(24h)</i>: <b>${num(cur.dau)}</b>${d(cur.dau, p('dau'))}`)

  // ── 📋 Supply ───────────────────────────────────────────────────────────────
  L.push('')
  L.push(`📋 <b>SUPPLY</b>`)
  L.push(`📢 Opportunities posted <i>(7d)</i>: <b>${num(cur.opportunities_posted)}</b>${d(cur.opportunities_posted, p('opportunities_posted'))} · ${num(cur.opportunities_total)} live`)
  L.push(`📨 Applications <i>(7d)</i>: <b>${num(cur.applications_submitted)}</b>${d(cur.applications_submitted, p('applications_submitted'))}`)
  L.push(`↩️ Response rate <i>(7d)</i>: <b>${pct(cur.application_response_rate_pct)}</b>${dPts(cur.application_response_rate_pct, p('application_response_rate_pct'))}`)
  L.push(`🟢 Actively Looking <i>(now)</i>: <b>${num(cur.actively_looking_live)}</b>${d(cur.actively_looking_live, p('actively_looking_live'))}`)
  L.push(`🆓 Free agents <i>(now)</i>: <b>${num(cur.total_free_agents)}</b>${d(cur.total_free_agents, p('total_free_agents'))}`)

  // ── 💬 Messaging (this week) ────────────────────────────────────────────────
  L.push('')
  L.push(`💬 <b>MESSAGING</b> <i>(7d)</i>`)
  L.push(`✉️ Sent: <b>${num(cur.messages_total)}</b> (${num(cur.messages_coach_first)} by coaches · ${num(cur.messages_player_first)} by players)${d(cur.messages_total, p('messages_total'))}`)
  const med = cur.median_first_reply_hours
  L.push(`⏱ Median time to first reply: <b>${med === null || med === undefined ? '—' : `${med}h`}</b>`)

  // ── ⭐ Shortlists & views ────────────────────────────────────────────────────
  L.push('')
  L.push(`⭐ <b>SHORTLISTS &amp; VIEWS</b>`)
  L.push(`📌 New shortlists <i>(7d)</i>: <b>${num(cur.new_shortlists)}</b>${d(cur.new_shortlists, p('new_shortlists'))} · ${num(cur.total_shortlisted)} total`)
  L.push(`👀 Profile views <i>(7d)</i>: <b>${num(cur.profile_views_total)}</b>${d(cur.profile_views_total, p('profile_views_total'))}`)
  const avg = cur.avg_views_per_active_player
  L.push(`📊 Avg views / active player: <b>${avg === null || avg === undefined ? '—' : avg}</b>`)

  // ── 📒 Game Performance Tracker ─────────────────────────────────────────────
  // Only rendered once the tracker rpc is feeding the snapshot (post-launch).
  if (cur.tracker_matches_total !== undefined) {
    L.push('')
    L.push(`📒 <b>GAME PERFORMANCE TRACKER</b>`)
    L.push(`📝 Matches logged <i>(7d)</i>: <b>${num(cur.tracker_matches_7d)}</b>${d(cur.tracker_matches_7d, p('tracker_matches_7d'))} · ${num(cur.tracker_matches_total)} total`)
    L.push(`👤 Players logging <i>(now)</i>: <b>${num(cur.tracker_players_total)}</b>${d(cur.tracker_players_total, p('tracker_players_total'))}`)
    L.push(`🆕 First-time loggers <i>(7d)</i>: <b>${num(cur.tracker_new_players_7d)}</b>${d(cur.tracker_new_players_7d, p('tracker_new_players_7d'))}`)
  }

  return L.join('\n')
}

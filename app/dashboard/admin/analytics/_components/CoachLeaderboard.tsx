'use client'

import { useMemo, useState } from 'react'
import type { CoachLeaderboard, CoachLeaderboardEntry } from './types'
import { SectionLabel, LoadingCard } from './ui'

// ─── Testimonial angle ────────────────────────────────────────────────────
// The ask lands differently depending on what the coach actually got out of
// the platform. This turns raw counts into the story you'd open the outreach
// message with, so the list is directly actionable rather than just ranked.

type Angle = { label: string; pitch: string; color: string; bg: string }

export function getTestimonialAngle(c: CoachLeaderboardEntry): Angle {
  if (c.applications_accepted > 0) {
    return {
      label: 'Accepted a player',
      pitch: `Accepted ${c.applications_accepted} application${c.applications_accepted === 1 ? '' : 's'} — ask about the player they brought in.`,
      color: '#2d5fc4', bg: 'rgba(45,95,196,0.15)',
    }
  }
  if (c.conversations_with_reply >= 3) {
    return {
      label: 'Two-way conversations',
      pitch: `${c.conversations_with_reply} players replied to them — ask how the response rate compares to their usual channels.`,
      color: '#2d5fc4', bg: 'rgba(45,95,196,0.15)',
    }
  }
  if (c.conversations_with_reply > 0) {
    return {
      label: 'Getting replies',
      pitch: `${c.conversations_with_reply} player${c.conversations_with_reply === 1 ? '' : 's'} replied — ask what made them reach out to that player.`,
      color: '#a78bfa', bg: 'rgba(168,139,250,0.15)',
    }
  }
  if (c.applications_received >= 5) {
    return {
      label: 'Roles pulling applicants',
      pitch: `${c.applications_received} applications across ${c.opportunities_posted} role${c.opportunities_posted === 1 ? '' : 's'} — ask about the quality of the applicants.`,
      color: '#a78bfa', bg: 'rgba(168,139,250,0.15)',
    }
  }
  if (c.opportunities_posted > 0) {
    return {
      label: 'Posts roles',
      pitch: 'Posting but not yet converting — better as a feedback call than a testimonial ask.',
      color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',
    }
  }
  if (c.shortlisted > 0 || c.player_views >= 20) {
    return {
      label: 'Scouting only',
      pitch: 'Browsing and shortlisting, no outbound yet — nudge them to message before asking for anything.',
      color: '#8892aa', bg: 'rgba(136,146,170,0.12)',
    }
  }
  return {
    label: 'Light usage',
    pitch: 'Not enough usage to have a story yet.',
    color: '#8892aa', bg: 'rgba(136,146,170,0.12)',
  }
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function warmthLabel(days: number | null): { text: string; color: string } {
  if (days === null) return { text: 'Never signed in', color: '#ef4444' }
  if (days === 0) return { text: 'Active today', color: '#2d5fc4' }
  if (days <= 7) return { text: `Active ${days}d ago`, color: '#2d5fc4' }
  if (days <= 30) return { text: `Active ${days}d ago`, color: '#a78bfa' }
  if (days <= 90) return { text: `Cold — ${days}d ago`, color: '#f59e0b' }
  return { text: `Dormant — ${days}d ago`, color: '#ef4444' }
}

type Sort = 'score' | 'replies' | 'recent'

const SORT_LABELS: Record<Sort, string> = {
  score: 'Value',
  replies: 'Replies',
  recent: 'Recency',
}

export function CoachLeaderboardTab({ data, loading }: {
  data: CoachLeaderboard | null
  loading: boolean
}) {
  const [sort, setSort] = useState<Sort>('score')
  const [readyOnly, setReadyOnly] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!data) return []
    const base = readyOnly
      ? data.coaches.filter(c => c.applications_accepted > 0 || c.conversations_with_reply > 0)
      : data.coaches
    const sorted = [...base]
    if (sort === 'replies') {
      sorted.sort((a, b) => b.conversations_with_reply - a.conversations_with_reply || b.score - a.score)
    } else if (sort === 'recent') {
      sorted.sort((a, b) =>
        new Date(b.last_sign_in_at ?? 0).getTime() - new Date(a.last_sign_in_at ?? 0).getTime())
    }
    return sorted
  }, [data, sort, readyOnly])

  const copyEmails = () => {
    const emails = rows.map(c => c.email).filter(Boolean).join(', ')
    if (!emails) return
    navigator.clipboard.writeText(emails)
    setCopied('all')
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <div className="px-4 pt-4"><LoadingCard /></div>
  if (!data) {
    return (
      <div className="px-4 pt-4">
        <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>Couldn&apos;t load the coach leaderboard.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Why this ranking exists — stops it being read as a vanity list */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <p className="text-sm font-bold mb-1" style={{ color: '#e8dece' }}>Testimonial targets</p>
        <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
          Ranked by proof of value, not clicks. Accepted applications and player replies
          carry the most weight — a coach who only browsed has nothing to quote.
        </p>
      </div>

      {/* Summary */}
      <section>
        <SectionLabel>The pool</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SummaryTile label="Testimonial-ready" value={data.proof_of_value_coaches}
            sub="Got a reply or an acceptance" color="#2d5fc4" />
          <SummaryTile label="Any usage" value={data.engaged_coaches}
            sub={`of ${data.total_coaches} approved coaches`} color="#a78bfa" />
          <SummaryTile label="Active (30d)" value={data.active_30d}
            sub="Signed in this month" color="#e8dece" />
          <SummaryTile label="On the list" value={data.coaches.length}
            sub="Top 40 by value score" color="#e8dece" />
        </div>
      </section>

      {/* Controls */}
      <div className="space-y-2">
        <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          {(['score', 'replies', 'recent'] as Sort[]).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className="flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: sort === s ? '#2d5fc4' : 'transparent',
                color: sort === s ? '#fff' : '#8892aa',
              }}>
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReadyOnly(v => !v)}
            className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: readyOnly ? 'rgba(45,95,196,0.15)' : '#13172a',
              border: `1px solid ${readyOnly ? '#2d5fc4' : '#1e2235'}`,
              color: readyOnly ? '#2d5fc4' : '#8892aa',
            }}>
            {readyOnly ? 'Testimonial-ready only' : 'Show all'}
          </button>
          <button onClick={copyEmails}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#8892aa' }}>
            {copied === 'all' ? 'Copied' : `Copy ${rows.length} emails`}
          </button>
        </div>
      </div>

      {/* Ranked list */}
      <section className="space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>
              No coaches match this filter yet.
            </p>
          </div>
        ) : rows.map((c, i) => (
          <CoachRow key={c.id} coach={c} rank={i + 1} maxScore={rows[0]?.score || 1} />
        ))}
      </section>
    </div>
  )
}

function SummaryTile({ label, value, sub, color }: {
  label: string; value: number; sub: string; color: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <span className="text-2xl font-black leading-none block"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
        {value.toLocaleString()}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider block mt-1"
        style={{ color: '#e8dece', fontSize: 10 }}>{label}</span>
      <span className="text-xs" style={{ color: '#8892aa' }}>{sub}</span>
    </div>
  )
}

function CoachRow({ coach, rank, maxScore }: {
  coach: CoachLeaderboardEntry; rank: number; maxScore: number
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const angle = getTestimonialAngle(coach)
  const warmth = warmthLabel(daysSince(coach.last_sign_in_at))
  const pct = Math.max(4, Math.round((coach.score / maxScore) * 100))

  const copyEmail = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!coach.email) return
    navigator.clipboard.writeText(coach.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg font-black leading-none w-6 flex-shrink-0 pt-0.5"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: rank <= 3 ? '#2d5fc4' : '#8892aa' }}>
            {rank}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>
                {coach.full_name ?? 'Unnamed coach'}
              </span>
              {coach.premium && (
                <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                  style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4', fontSize: 10 }}>PRO</span>
              )}
              {coach.is_agent && (
                <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                  style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 10 }}>AGENT</span>
              )}
            </div>
            <p className="text-xs truncate" style={{ color: '#8892aa' }}>
              {[coach.club, coach.coaching_role].filter(Boolean).join(' · ') || '—'}
            </p>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                style={{ backgroundColor: angle.bg, color: angle.color }}>
                {angle.label}
              </span>
              <span className="text-xs truncate" style={{ color: warmth.color }}>{warmth.text}</span>
            </div>

            {/* Score bar — relative to the top-ranked coach */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: angle.color }} />
              </div>
              <span className="text-xs font-black flex-shrink-0"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#8892aa' }}>
                {coach.score}
              </span>
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid #1e2235', paddingTop: 12 }}>
          <p className="text-xs leading-relaxed" style={{ color: '#e8dece' }}>{angle.pitch}</p>

          <div className="grid grid-cols-3 gap-2">
            <Metric label="Replies" value={coach.conversations_with_reply} sub={`of ${coach.conversations} convos`} />
            <Metric label="Accepted" value={coach.applications_accepted} sub={`of ${coach.applications_received} apps`} />
            <Metric label="Players msgd" value={coach.players_contacted} sub={`${coach.messages_sent} messages`} />
            <Metric label="Shortlisted" value={coach.shortlisted} sub={`${coach.shortlisted_30d} in 30d`} />
            <Metric label="Roles posted" value={coach.opportunities_posted} sub={`${coach.opportunities_active} active`} />
            <Metric label="Profile views" value={coach.player_views} sub={`${coach.player_views_30d} in 30d`} />
          </div>

          <div className="flex flex-wrap gap-2">
            {coach.email && (
              <>
                <a href={`mailto:${coach.email}`} onClick={e => e.stopPropagation()}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                  Email
                </a>
                <button onClick={copyEmail}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#8892aa' }}>
                  {copied ? 'Copied' : coach.email}
                </button>
              </>
            )}
            {coach.phone && (
              <a href={`tel:${coach.phone}`} onClick={e => e.stopPropagation()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#8892aa' }}>
                {coach.phone}
              </a>
            )}
            <a href={`/dashboard/coach/${coach.id}`} onClick={e => e.stopPropagation()}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#8892aa' }}>
              Profile
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-lg p-2" style={{ backgroundColor: '#0a0a0a' }}>
      <span className="text-lg font-black leading-none block"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: value > 0 ? '#e8dece' : '#8892aa' }}>
        {value}
      </span>
      <span className="text-xs block" style={{ color: '#8892aa', fontSize: 10 }}>{label}</span>
      <span className="text-xs block" style={{ color: '#8892aa', fontSize: 9 }}>{sub}</span>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { RoleBadge, SectionLabel, LoadingCard } from './ui'
import type { MessageEntry, RecentApplication, RecentLogin, ShowcaseWaitlist, MessageStats, PlatformStats } from './types'

export function OpsTab({
  msgLog, msgLoading, msgTotal,
  recentLogins, loginsLoading,
  recentApps, appsLoading,
  showcaseWaitlist, showcaseLoading,
  messageStats, messageStatsLoading,
  platformStats,
}: {
  msgLog: MessageEntry[]
  msgLoading: boolean
  msgTotal: number
  recentLogins: RecentLogin[]
  loginsLoading: boolean
  recentApps: RecentApplication[]
  appsLoading: boolean
  showcaseWaitlist: ShowcaseWaitlist | null
  showcaseLoading: boolean
  messageStats: MessageStats | null
  messageStatsLoading: boolean
  platformStats: PlatformStats | null
}) {
  const [showAllMessages, setShowAllMessages] = useState(false)
  const [showAllApps, setShowAllApps] = useState(false)
  const [showAllLogins, setShowAllLogins] = useState(false)
  const [showShowcaseList, setShowShowcaseList] = useState(false)

  const migrationPct = platformStats && platformStats.funnel.approved > 0
    ? Math.round((platformStats.ever_signed_in / platformStats.funnel.approved) * 100)
    : 0

  return (
    <div className="px-4 pt-4 space-y-4 pb-8">

      {/* ── Migration Tracker ─────────────────────────────────────────── */}
      {platformStats && (
        <section>
          <SectionLabel>Migration Tracker</SectionLabel>
          <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Users signed in to new app</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
                {platformStats.ever_signed_in} / {platformStats.funnel.approved}
              </span>
            </div>
            <div className="w-full rounded-full h-2" style={{ backgroundColor: '#1e2235' }}>
              <div className="h-2 rounded-full transition-all" style={{
                width: `${migrationPct}%`,
                backgroundColor: migrationPct >= 75 ? '#60a5fa' : migrationPct >= 40 ? '#f59e0b' : '#2d5fc4',
              }} />
            </div>
            <p className="text-xs" style={{ color: '#8892aa' }}>{migrationPct}% migrated</p>
          </div>
        </section>
      )}

      {/* ── Last 30 Days ──────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Last 30 Days</SectionLabel>
        {messageStatsLoading ? <LoadingCard /> : messageStats ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl p-4 flex flex-col gap-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>
                {messageStats.messagesSent}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>Messages Sent</span>
            </div>
            <div className="rounded-xl p-4 flex flex-col gap-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>
                {messageStats.newConversations}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>New Conversations</span>
            </div>
            <div className="rounded-xl p-4 flex flex-col gap-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#f59e0b' }}>
                {messageStats.applicationsSubmitted}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>Applications</span>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Recently Online ───────────────────────────────────────────── */}
      <section>
        <SectionLabel>Recently Online</SectionLabel>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
          {loginsLoading ? (
            <div className="flex items-center justify-center py-8" style={{ backgroundColor: '#13172a' }}>
              <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
            </div>
          ) : recentLogins.length === 0 ? (
            <div className="py-8 text-center" style={{ backgroundColor: '#13172a' }}>
              <p className="text-sm" style={{ color: '#8892aa' }}>No sign-in data yet.</p>
            </div>
          ) : (
            <>
              <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                {(showAllLogins ? recentLogins.slice(0, 15) : recentLogins.slice(0, 5)).map((u, i) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: i === 0 ? '#0d1020' : '#13172a' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                          {u.full_name ?? u.email ?? '—'}
                        </span>
                        <RoleBadge role={u.role} />
                      </div>
                      {u.club && <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>{u.club}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs tabular-nums" style={{ color: '#8892aa' }}>
                        {new Date(u.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                      <p className="text-xs tabular-nums" style={{ color: '#3a4055' }}>
                        {new Date(u.last_sign_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {recentLogins.length > 5 && (
                <button
                  onClick={() => setShowAllLogins(v => !v)}
                  className="w-full px-4 py-2.5 text-xs font-semibold text-center transition-colors"
                  style={{ backgroundColor: '#0d1020', borderTop: '1px solid #1e2235', color: '#8892aa' }}>
                  {showAllLogins ? 'Show less' : `See ${Math.min(recentLogins.length, 15) - 5} more`}
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Message Log ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Message Log</SectionLabel>
          {msgTotal > 0 && <span className="text-xs" style={{ color: '#8892aa' }}>{msgTotal.toLocaleString()} total</span>}
        </div>
        {msgLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
          </div>
        ) : msgLog.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>No messages yet.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            <div className="divide-y" style={{ borderColor: '#1e2235' }}>
              {(showAllMessages ? msgLog : msgLog.slice(0, 5)).map((m, i) => (
                <div key={m.id} className="px-4 py-3" style={{ backgroundColor: i === 0 ? '#0d1020' : '#13172a' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <RoleBadge role={m.sender_role} />
                        <span className="text-xs font-bold truncate" style={{ color: '#e8dece' }}>{m.sender_name ?? '—'}</span>
                        {m.sender_club && <span className="text-xs truncate" style={{ color: '#8892aa' }}>· {m.sender_club}</span>}
                        <span className="text-xs" style={{ color: '#3a4055' }}>→</span>
                        <span className="text-xs font-semibold truncate" style={{ color: '#8892aa' }}>{m.other_name ?? '—'}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
                        {m.content.length > 100 ? m.content.slice(0, 100) + '…' : m.content}
                      </p>
                    </div>
                    <p className="text-xs flex-shrink-0 tabular-nums" style={{ color: '#3a4055' }}>
                      {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {msgLog.length > 5 && (
              <button
                onClick={() => setShowAllMessages(v => !v)}
                className="w-full px-4 py-2.5 text-xs font-semibold text-center transition-colors"
                style={{ backgroundColor: '#0d1020', borderTop: '1px solid #1e2235', color: '#8892aa' }}>
                {showAllMessages ? 'Show less' : `See ${msgLog.length - 5} more recent`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Recent Applications ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Recent Applications</SectionLabel>
          {recentApps.length > 0 && <span className="text-xs" style={{ color: '#8892aa' }}>{recentApps.length} total</span>}
        </div>
        {appsLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
          </div>
        ) : recentApps.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>No applications yet.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            <div className="divide-y" style={{ borderColor: '#1e2235' }}>
              {(showAllApps ? recentApps : recentApps.slice(0, 5)).map((a, i) => (
                <div key={a.id} className="px-4 py-3" style={{ backgroundColor: i === 0 ? '#0d1020' : '#13172a' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <RoleBadge role="player" />
                        <span className="text-xs font-bold truncate" style={{ color: '#e8dece' }}>{a.player?.full_name ?? '—'}</span>
                        {a.player?.club && <span className="text-xs truncate" style={{ color: '#8892aa' }}>· {a.player.club}</span>}
                      </div>
                      <p className="text-xs" style={{ color: '#8892aa' }}>
                        Applied to <span style={{ color: '#e8dece' }}>{a.opportunity?.title ?? '—'}</span>
                        {a.opportunity?.club && <span> · {a.opportunity.club}</span>}
                      </p>
                      {a.coach?.full_name && (
                        <p className="text-xs" style={{ color: '#3a4055' }}>
                          Coach: {a.coach.full_name}{a.coach.club ? ` · ${a.coach.club}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                      <p className="text-xs tabular-nums" style={{ color: '#8892aa' }}>
                        {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold inline-block" style={{
                        backgroundColor: a.status === 'accepted' ? 'rgba(45,95,196,0.15)'
                          : a.status === 'rejected' ? 'rgba(239,68,68,0.12)'
                          : a.status === 'shortlisted' ? 'rgba(167,139,250,0.15)'
                          : 'rgba(136,146,170,0.12)',
                        color: a.status === 'accepted' ? '#2d5fc4'
                          : a.status === 'rejected' ? '#ef4444'
                          : a.status === 'shortlisted' ? '#a78bfa'
                          : '#8892aa',
                      }}>
                        {a.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {recentApps.length > 5 && (
              <button
                onClick={() => setShowAllApps(v => !v)}
                className="w-full px-4 py-2.5 text-xs font-semibold text-center transition-colors"
                style={{ backgroundColor: '#0d1020', borderTop: '1px solid #1e2235', color: '#8892aa' }}>
                {showAllApps ? 'Show less' : `See ${recentApps.length - 5} more`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Showcase Game 2 Waitlist ─────────────────────────────────── */}
      <section>
        <SectionLabel>Showcase Game 2 — Waitlist</SectionLabel>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
          {showcaseLoading ? (
            <div className="flex items-center justify-center py-6" style={{ backgroundColor: '#13172a' }}>
              <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
            </div>
          ) : showcaseWaitlist ? (
            <>
              <button
                onClick={() => setShowShowcaseList(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 transition-opacity hover:opacity-80"
                style={{ backgroundColor: '#13172a' }}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                    {showcaseWaitlist.total}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>
                      {showcaseWaitlist.total === 1 ? 'person registered interest' : 'people registered interest'}
                    </p>
                    <p className="text-xs" style={{ color: '#8892aa' }}>
                      {showcaseWaitlist.players.length} {showcaseWaitlist.players.length === 1 ? 'player' : 'players'} · {showcaseWaitlist.coaches.length} {showcaseWaitlist.coaches.length === 1 ? 'coach' : 'coaches'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold" style={{ color: '#8892aa' }}>{showShowcaseList ? 'Hide ↑' : 'View all ↓'}</span>
              </button>

              {showShowcaseList && showcaseWaitlist.total > 0 && (
                <div className="divide-y" style={{ borderColor: '#1e2235', borderTop: '1px solid #1e2235' }}>
                  {showcaseWaitlist.players.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: i % 2 === 0 ? '#0d1020' : '#13172a' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <RoleBadge role="player" />
                          <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? '—'}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {p.position && <span className="text-xs" style={{ color: '#2d5fc4' }}>{p.position}</span>}
                          {p.club && <span className="text-xs" style={{ color: '#8892aa' }}>· {p.club}</span>}
                        </div>
                      </div>
                      {p.showcase_waitlist_joined_at && (
                        <p className="text-xs tabular-nums flex-shrink-0 ml-3" style={{ color: '#8892aa' }}>
                          {new Date(p.showcase_waitlist_joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  ))}
                  {showcaseWaitlist.coaches.map((c, i) => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: (showcaseWaitlist.players.length + i) % 2 === 0 ? '#0d1020' : '#13172a' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <RoleBadge role="coach" />
                          <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{c.full_name ?? '—'}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {c.coaching_role && <span className="text-xs" style={{ color: '#a78bfa' }}>{c.coaching_role}</span>}
                          {c.club && <span className="text-xs" style={{ color: '#8892aa' }}>· {c.club}</span>}
                        </div>
                      </div>
                      {c.showcase_coach_waitlist_joined_at && (
                        <p className="text-xs tabular-nums flex-shrink-0 ml-3" style={{ color: '#8892aa' }}>
                          {new Date(c.showcase_coach_waitlist_joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {showShowcaseList && showcaseWaitlist.total === 0 && (
                <div className="px-4 py-4 text-center" style={{ backgroundColor: '#0d1020', borderTop: '1px solid #1e2235' }}>
                  <p className="text-xs" style={{ color: '#8892aa' }}>No one on the waitlist yet.</p>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-6 text-center" style={{ backgroundColor: '#13172a' }}>
              <p className="text-xs" style={{ color: '#8892aa' }}>Could not load waitlist data.</p>
            </div>
          )}
        </div>
      </section>

    </div>
  )
}

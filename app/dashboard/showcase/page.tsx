'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { showcaseConfig, TeamEntry } from '@/lib/showcase.config'

type UserState = {
  id: string
  role: string
  showcase_waitlist: boolean
  showcase_coach_waitlist: boolean
}

type Attendee = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  club: string | null
  showcase_team: number | null
  showcase_squad_number: number | null
}

type SearchResult = {
  id: string
  full_name: string | null
  position: string | null
  club: string | null
}

// Returns the attendee matching a teamsheet entry — checks manual slot first, then name/aliases
function resolveProfile(
  entry: TeamEntry,
  teamIndex: number,
  bySlot: Map<string, Attendee>,
  byName: Map<string, Attendee>
): Attendee | undefined {
  const slotKey = `${teamIndex + 1}:${entry.number}`
  if (bySlot.has(slotKey)) return bySlot.get(slotKey)
  if (!entry.name) return undefined
  const names = [entry.name, ...(entry.aliases ?? [])]
  for (const n of names) {
    const match = byName.get(n.toLowerCase().trim())
    if (match) return match
  }
  return undefined
}

export default function ShowcasePage() {
  const [user, setUser] = useState<UserState | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  // Admin link state
  const [linkingSlot, setLinkingSlot] = useState<{ team: number; number: number } | null>(null)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkResults, setLinkResults] = useState<SearchResult[]>([])
  const [linkSearching, setLinkSearching] = useState(false)
  const [linkSaving, setLinkSaving] = useState(false)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (!authUser) { setLoading(false); return }
      Promise.all([
        supabase
          .from('profiles')
          .select('id, role, showcase_waitlist, showcase_coach_waitlist')
          .eq('id', authUser.id)
          .single(),
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url, position, club, showcase_team, showcase_squad_number')
          .eq('showcase_attended', true)
          .eq('approved', true),
      ]).then(([profileRes, attendeesRes]) => {
        if (profileRes.data) setUser(profileRes.data as UserState)
        if (attendeesRes.data) setAttendees(attendeesRes.data as Attendee[])
        setLoading(false)
      })
    })
  }, [])

  // Debounced profile search for admin linking
  useEffect(() => {
    if (!linkQuery.trim() || linkQuery.trim().length < 2) {
      setLinkResults([])
      return
    }
    if (searchRef.current) clearTimeout(searchRef.current)
    setLinkSearching(true)
    searchRef.current = setTimeout(async () => {
      const res = await fetch(`/api/showcase/link?q=${encodeURIComponent(linkQuery.trim())}`)
      const json = await res.json()
      setLinkResults(json.results ?? [])
      setLinkSearching(false)
    }, 280)
  }, [linkQuery])

  async function handleLink(profileId: string) {
    if (!linkingSlot) return
    setLinkSaving(true)
    const res = await fetch('/api/showcase/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, team: linkingSlot.team, squadNumber: linkingSlot.number }),
    })
    if (res.ok) {
      // Refresh attendees
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, position, club, showcase_team, showcase_squad_number')
        .eq('showcase_attended', true)
        .eq('approved', true)
      if (data) setAttendees(data as Attendee[])
      setLinkingSlot(null)
      setLinkQuery('')
      setLinkResults([])
    }
    setLinkSaving(false)
  }

  async function joinPlayerWaitlist() {
    if (!user) return
    setJoining(true)
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ showcase_waitlist: true, showcase_waitlist_joined_at: new Date().toISOString() })
      .eq('id', user.id)
    setUser(u => u ? { ...u, showcase_waitlist: true } : u)
    setJoining(false)
  }

  async function joinCoachWaitlist() {
    if (!user) return
    setJoining(true)
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ showcase_coach_waitlist: true, showcase_coach_waitlist_joined_at: new Date().toISOString() })
      .eq('id', user.id)
    setUser(u => u ? { ...u, showcase_coach_waitlist: true } : u)
    setJoining(false)
  }

  async function removeAttendee(profileId: string) {
    setRemoving(profileId)
    const res = await fetch('/api/showcase/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: profileId }),
    })
    if (res.ok) setAttendees(prev => prev.filter(a => a.id !== profileId))
    setRemoving(null)
  }

  const backHref = user?.role === 'coach' ? '/dashboard/coach' : '/dashboard/player'
  const isAdmin = user?.role === 'admin'
  const hasVideo = Boolean(showcaseConfig.youtubeVideoId)
  const hasImages = showcaseConfig.images.length > 0

  // Build lookup maps
  const bySlot = new Map<string, Attendee>()
  const byName = new Map<string, Attendee>()
  for (const a of attendees) {
    if (a.showcase_team && a.showcase_squad_number) {
      bySlot.set(`${a.showcase_team}:${a.showcase_squad_number}`, a)
    }
    if (a.full_name) byName.set(a.full_name.toLowerCase().trim(), a)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-6 pb-4">
        <Link href={backHref}
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: '#8892aa', textDecoration: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </Link>
        <img src="/logo.jpg" alt="NEXT11VEN" className="h-8 w-auto" />
        <div style={{ width: 56 }} />
      </header>

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="px-4 pt-6 pb-10">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-6xl font-black uppercase leading-none"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', letterSpacing: '-0.01em' }}>
            {showcaseConfig.eventTitle}
          </h1>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.35)' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#60a5fa" stroke="none">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
            Sold Out
          </span>
        </div>
        <p className="text-xl font-bold mb-5"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
          {showcaseConfig.eventSubtitle}
        </p>
        <p className="text-sm leading-relaxed max-w-md" style={{ color: '#8892aa' }}>
          {showcaseConfig.bodyText}
        </p>
      </section>

      {/* ─── Waitlist CTA ─────────────────────────────────────────────────── */}
      {!loading && (() => {
        const isPlayerLike = user?.role === 'player' || isAdmin
        const isOnWaitlist = user?.role === 'coach'
          ? user?.showcase_coach_waitlist
          : user?.showcase_waitlist

        async function joinWaitlist() {
          if (user?.role === 'coach') joinCoachWaitlist()
          else joinPlayerWaitlist()
        }

        return (
          <section className="px-4 mb-10">
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'linear-gradient(140deg, #0d1a3a 0%, #13172a 100%)', border: '1px solid rgba(45,95,196,0.55)' }}>
              <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #2d5fc4, transparent)' }} />
              <div className="px-5 pt-5 pb-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#2d5fc4' }}>
                      Coming next
                    </p>
                    <h2 className="text-3xl font-black uppercase leading-none"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                      Showcase Game 2
                    </h2>
                  </div>
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(45,95,196,0.15)', border: '1px solid rgba(45,95,196,0.3)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm mb-4" style={{ color: '#8892aa' }}>
                  Want to be the first to hear about upcoming showcase games? Click below.
                </p>
                {isOnWaitlist ? (
                  <div className="rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider"
                    style={{ backgroundColor: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    You're on the list
                  </div>
                ) : (
                  <button
                    onClick={joinWaitlist}
                    disabled={joining}
                    className="w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
                    style={{ backgroundColor: '#e8dece', color: '#0a0a0a' }}>
                    {joining ? 'Joining…' : 'Register Your Interest'}
                  </button>
                )}
              </div>
            </div>
          </section>
        )
      })()}

      {/* ─── Highlights / YouTube ─────────────────────────────────────────── */}
      <section className="px-4 mb-10">
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#8892aa' }}>
          Highlights
        </p>
        {hasVideo ? (
          <>
            <div className="rounded-2xl overflow-hidden w-full md:max-w-2xl md:mx-auto" style={{ aspectRatio: '16/9' }}>
              <iframe
                src={`https://www.youtube.com/embed/${showcaseConfig.youtubeVideoId}`}
                title="Showcase Game 1 Highlights"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
                style={{ border: 0 }}
              />
            </div>
            <p className="text-xs mt-2.5 text-center" style={{ color: '#8892aa' }}>
              Enjoyed the highlights? 👍 Like the video and subscribe to our{' '}
              <a
                href="https://www.youtube.com/@next11ven"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#2d5fc4', textDecoration: 'underline' }}>
                YouTube channel
              </a>{' '}
              to stay up to date.
            </p>
          </>
        ) : (
          <div className="rounded-2xl overflow-hidden relative"
            style={{ backgroundColor: '#0d1020', border: '1px solid #1e2235', minHeight: 200 }}>
            <div className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'linear-gradient(#1e2235 1px, transparent 1px), linear-gradient(90deg, #1e2235 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute w-40 h-40 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(45,95,196,0.15) 0%, transparent 70%)' }} />
            </div>
            <div className="relative flex flex-col items-center justify-center py-14 px-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(45,95,196,0.15)', border: '1px solid rgba(45,95,196,0.4)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" fill="rgba(45,95,196,0.3)" />
                </svg>
              </div>
              <p className="text-base font-bold mb-1.5 text-center" style={{ color: '#e8dece' }}>
                Highlights dropping soon
              </p>
              <p className="text-xs text-center" style={{ color: '#8892aa' }}>
                Match footage is on its way
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ─── Teamsheet ────────────────────────────────────────────────────── */}
      <section className="px-4 mb-10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8892aa' }}>
            Teamsheet
          </p>
          {isAdmin && (
            <span className="text-xs px-2 py-0.5 rounded-md font-semibold"
              style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
              Admin — tap <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> to link
            </span>
          )}
        </div>

        {/* Stacked team layout — full width so names don't truncate */}
        <div className="flex flex-col gap-3">
          {showcaseConfig.teams.map((team, teamIndex) => (
            <div key={team.name} className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: '#13172a', border: `1px solid ${team.accentColor}30` }}>

              {/* Team header */}
              <div className="px-2.5 py-2 flex items-center gap-1.5"
                style={{ borderBottom: `1px solid ${team.accentColor}20`, background: `linear-gradient(90deg, ${team.accentColor}12 0%, transparent 100%)` }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: team.accentColor }} />
                <p className="text-xs font-black uppercase truncate"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: team.accentColor }}>
                  {team.name} · {team.kit}
                </p>
              </div>

              {/* Player rows */}
              <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                {team.players.map((entry) => {
                  if (!entry.name) return null
                  const profile = resolveProfile(entry, teamIndex, bySlot, byName)
                  const isLinking = linkingSlot?.team === teamIndex + 1 && linkingSlot?.number === entry.number

                  const rowContent = (
                    <div className="flex items-center gap-2 px-3 py-2">
                      {/* Squad number */}
                      <span className="text-sm font-black w-6 flex-shrink-0 text-right leading-none"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: team.accentColor }}>
                        {entry.number}
                      </span>

                      {/* Position badge */}
                      <span className="font-bold w-9 flex-shrink-0 text-center rounded leading-tight py-0.5"
                        style={{ backgroundColor: `${team.accentColor}18`, color: team.accentColor, fontSize: '10px' }}>
                        {entry.position ?? '—'}
                      </span>

                      {/* Name */}
                      <span className="flex-1 text-sm font-semibold min-w-0 truncate"
                        style={{ color: entry.name ? (profile ? '#e8dece' : '#606880') : '#3a4055' }}>
                        {entry.name ?? '—'}
                      </span>

                      {/* Goal / assist indicators */}
                      {(entry.goals || entry.assists) && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {entry.goals && Array.from({ length: entry.goals }).map((_, i) => (
                            <span key={i} style={{ fontSize: '9px', lineHeight: 1 }}>⚽</span>
                          ))}
                          {entry.assists && (
                            <span className="font-black" style={{ fontSize: '9px', color: '#f59e0b', lineHeight: 1 }}>A</span>
                          )}
                        </div>
                      )}

                      {/* Right icon */}
                      {profile ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                          {isAdmin && (
                            <button
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeAttendee(profile.id) }}
                              disabled={removing === profile.id}
                              className="w-4 h-4 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0"
                              style={{ backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)' }}>
                              {removing === profile.id
                                ? <span className="block w-1.5 h-1.5 rounded-full border border-t-transparent animate-spin" style={{ borderColor: '#ef4444', borderTopColor: 'transparent' }} />
                                : <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                              }
                            </button>
                          )}
                        </div>
                      ) : isAdmin && entry.name ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setLinkingSlot({ team: teamIndex + 1, number: entry.number }); setLinkQuery(''); setLinkResults([]) }}
                          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(45,95,196,0.15)', border: '1px solid rgba(45,95,196,0.4)' }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  )

                  return (
                    <div key={entry.number}>
                      {profile
                        ? <Link href={`/dashboard/player/players/${profile.id}`} style={{ textDecoration: 'none', display: 'block' }}>{rowContent}</Link>
                        : rowContent
                      }

                      {/* Inline link search — spans full width outside grid column */}
                      {isLinking && (
                        <div className="px-2.5 pb-2.5" style={{ borderTop: '1px solid #1e2235' }}>
                          <div className="flex items-center gap-1.5 mt-2 mb-1.5">
                            <input
                              autoFocus
                              type="text"
                              placeholder={`Search profile for #${entry.number} ${entry.name}…`}
                              value={linkQuery}
                              onChange={e => setLinkQuery(e.target.value)}
                              className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
                              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2d5fc4', color: '#e8dece', minWidth: 0 }}
                            />
                            <button
                              onClick={() => { setLinkingSlot(null); setLinkQuery(''); setLinkResults([]) }}
                              className="flex-shrink-0 text-xs px-2 py-1.5 rounded-lg"
                              style={{ color: '#8892aa', backgroundColor: '#1e2235' }}>
                              ✕
                            </button>
                          </div>
                          {linkSearching && (
                            <p className="text-xs py-1" style={{ color: '#8892aa' }}>Searching…</p>
                          )}
                          {linkResults.length > 0 && (
                            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
                              {linkResults.map(r => (
                                <button
                                  key={r.id}
                                  onClick={() => handleLink(r.id)}
                                  disabled={linkSaving}
                                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left disabled:opacity-50"
                                  style={{ borderBottom: '1px solid #1e2235', backgroundColor: '#0d1020' }}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate" style={{ color: '#e8dece' }}>{r.full_name}</p>
                                    <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                                      {[r.position, r.club].filter(Boolean).join(' · ')}
                                    </p>
                                  </div>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </button>
                              ))}
                            </div>
                          )}
                          {!linkSearching && linkQuery.trim().length >= 2 && linkResults.length === 0 && (
                            <p className="text-xs py-1" style={{ color: '#8892aa' }}>No profiles found</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* ─── Image carousel ───────────────────────────────────────────────── */}
      {hasImages && (
        <section className="mb-10">
          <div
            className="flex gap-3 overflow-x-auto px-4 pb-3"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            {showcaseConfig.images.map((src, i) => (
              <div key={i}
                className="flex-shrink-0 rounded-2xl overflow-hidden"
                style={{ width: 260, height: 175, scrollSnapAlign: 'start', border: '1px solid #1e2235' }}>
                <img src={src} alt={`Showcase Game 1 — photo ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          {showcaseConfig.galleryUrl && (
            <div className="px-4 mt-3">
              <a
                href={showcaseConfig.galleryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full rounded-xl px-4 py-3"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none' }}>
                <span className="text-sm font-semibold" style={{ color: '#e8dece' }}>View full gallery</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          )}
        </section>
      )}

    </div>
  )
}

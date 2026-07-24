'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import Breadcrumb from '@/app/components/Breadcrumb'

type ApplicantProfile = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  position: string | null
  club: string | null
  city: string | null
  playing_level: string | null
  coaching_level: string | null
  coaching_role: string | null
  approved: boolean | null
  approval_status: string | null
  created_at: string
  gdpr_consent: boolean | null
  phone: string | null
  password_set_at: string | null
  is_agent: boolean | null
}

type TabFilter = 'pending' | 'approved' | 'declined'

type ShowcaseCoach = {
  id: string
  full_name: string | null
  club: string | null
  city: string | null
  coaching_role: string | null
  showcase_confirmed_at: string | null
}

type ShowcasePayer = {
  id: string
  full_name: string | null
  email: string | null
  position: string | null
  club: string | null
  role: string | null
}

type UnmatchedPayer = {
  email: string
  name: string | null
  amount: number
}

type OrphanedUser = {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  full_name: string | null
  has_profile: boolean
  current_approval_status: string | null
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function AdminPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<ApplicantProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabFilter>('pending')
  const [processing, setProcessing] = useState<string | null>(null)
  const [agentSaving, setAgentSaving] = useState<string | null>(null)
  const [counts, setCounts] = useState({ pending: 0, approved: 0, declined: 0 })
  const [reconciling, setReconciling] = useState(false)
  const [reconcileResult, setReconcileResult] = useState<{ granted: number; revoked: number; checked: number } | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const [orphaned, setOrphaned] = useState<OrphanedUser[]>([])
  const [orphanedLoading, setOrphanedLoading] = useState(false)
  const [orphanedLoaded, setOrphanedLoaded] = useState(false)
  const [showcaseCoaches, setShowcaseCoaches] = useState<ShowcaseCoach[]>([])
  const [showcaseLoading, setShowcaseLoading] = useState(false)
  const [showcaseLoaded, setShowcaseLoaded] = useState(false)

  const [payersMatched, setPayersMatched] = useState<ShowcasePayer[]>([])
  const [payersUnmatched, setPayersUnmatched] = useState<UnmatchedPayer[]>([])
  const [payersAlreadyEnabled, setPayersAlreadyEnabled] = useState<ShowcasePayer[]>([])
  const [payersLoading, setPayersLoading] = useState(false)
  const [payersLoaded, setPayersLoaded] = useState(false)
  const [payersEnabling, setPayersEnabling] = useState(false)
  const [payersEnabledCount, setPayersEnabledCount] = useState(0)
  const [rescuingId, setRescuingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [rescueRoles, setRescueRoles] = useState<Record<string, string>>({})
  const [rescueNames, setRescueNames] = useState<Record<string, string>>({})
  const [rescuedIds, setRescuedIds] = useState<Set<string>>(new Set())
  const [rescueErrors, setRescueErrors] = useState<Record<string, string>>({})
  const [lookupQuery, setLookupQuery] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: me } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (me?.role !== 'admin') { router.push('/dashboard/player'); return }

    const res = await fetch('/api/admin/profiles')
    if (!res.ok) { setLoading(false); return }
    const json = await res.json()

    const all = (json.profiles ?? []) as ApplicantProfile[]
    setProfiles(all)
    setCounts({
      pending: all.filter(p => !p.approval_status || p.approval_status === 'pending').length,
      approved: all.filter(p => p.approval_status === 'approved').length,
      declined: all.filter(p => p.approval_status === 'declined').length,
    })
    setLoading(false)
  }

  async function review(profileId: string, action: 'approve' | 'decline') {
    setProcessing(profileId)
    const res = await fetch('/api/admin/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: profileId, action }),
    })
    const data = await res.json()
    if (!data.error) {
      setProfiles(prev => prev.map(p =>
        p.id === profileId
          ? { ...p, approval_status: action === 'approve' ? 'approved' : 'declined' }
          : p
      ))
      setCounts(prev => {
        const old = profiles.find(p => p.id === profileId)
        const oldStatus = (old?.approval_status ?? 'pending') as TabFilter
        return {
          ...prev,
          [oldStatus]: Math.max(0, prev[oldStatus] - 1),
          [action === 'approve' ? 'approved' : 'declined']: prev[action === 'approve' ? 'approved' : 'declined'] + 1,
        }
      })
    }
    setProcessing(null)
  }

  async function toggleAgent(profileId: string, isAgent: boolean) {
    setAgentSaving(profileId)
    const res = await fetch('/api/admin/set-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: profileId, is_agent: isAgent }),
    })
    const data = await res.json()
    if (!data.error) {
      setProfiles(prev => prev.map(p =>
        p.id === profileId ? { ...p, is_agent: isAgent } : p
      ))
    }
    setAgentSaving(null)
  }

  async function loadOrphaned() {
    setOrphanedLoading(true)
    const res = await fetch('/api/admin/orphaned-users')
    if (res.ok) {
      const json = await res.json()
      const users: OrphanedUser[] = json.orphaned ?? []
      setOrphaned(users)
      // Pre-fill name inputs with whatever we have from metadata
      setRescueNames(prev => {
        const next = { ...prev }
        users.forEach(u => { if (u.full_name && !next[u.id]) next[u.id] = u.full_name })
        return next
      })
    }
    setOrphanedLoading(false)
    setOrphanedLoaded(true)
  }

  async function rescueProfile(userId: string) {
    const role = rescueRoles[userId]
    if (!role) return
    setRescuingId(userId)
    setRescueErrors(prev => { const next = { ...prev }; delete next[userId]; return next })
    try {
      const res = await fetch('/api/admin/rescue-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role, full_name: rescueNames[userId] ?? '' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setRescueErrors(prev => ({ ...prev, [userId]: json.error ?? `Error ${res.status}` }))
      } else {
        setRescuedIds(prev => new Set([...prev, userId]))
        const profRes = await fetch('/api/admin/profiles')
        if (profRes.ok) {
          const profJson = await profRes.json()
          const all = (profJson.profiles ?? []) as ApplicantProfile[]
          setProfiles(all)
          setCounts({
            pending: all.filter(p => !p.approval_status || p.approval_status === 'pending').length,
            approved: all.filter(p => p.approval_status === 'approved').length,
            declined: all.filter(p => p.approval_status === 'declined').length,
          })
        }
      }
    } catch (e) {
      setRescueErrors(prev => ({ ...prev, [userId]: 'Network error — try again' }))
    }
    setRescuingId(null)
  }

  async function loadShowcase() {
    setShowcaseLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, club, city, coaching_role, showcase_confirmed_at')
      .eq('role', 'coach')
      .eq('showcase_confirmed', true)
      .order('showcase_confirmed_at', { ascending: true })
    setShowcaseCoaches((data ?? []) as ShowcaseCoach[])
    setShowcaseLoading(false)
    setShowcaseLoaded(true)
  }

  async function loadShowcasePayers() {
    setPayersLoading(true)
    const res = await fetch('/api/admin/showcase-payers')
    const json = await res.json()
    setPayersMatched(json.matched ?? [])
    setPayersUnmatched(json.unmatched ?? [])
    setPayersAlreadyEnabled(json.already_enabled ?? [])
    setPayersLoading(false)
    setPayersLoaded(true)
  }

  async function enableShowcasePayers() {
    if (!payersMatched.length) return
    setPayersEnabling(true)
    const res = await fetch('/api/admin/showcase-payers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: payersMatched.map(p => p.id) }),
    })
    const json = await res.json()
    if (res.ok) {
      setPayersEnabledCount(json.count ?? 0)
      setPayersAlreadyEnabled(prev => [...prev, ...payersMatched])
      setPayersMatched([])
    }
    setPayersEnabling(false)
  }

  async function deleteOrphanedUser(userId: string) {
    if (!confirm('Permanently delete this account? This cannot be undone.')) return
    setDeletingId(userId)
    setRescueErrors(prev => { const next = { ...prev }; delete next[userId]; return next })
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setRescueErrors(prev => ({ ...prev, [userId]: json.error ?? `Error ${res.status}` }))
      } else {
        setOrphaned(prev => prev.filter(u => u.id !== userId))
      }
    } catch {
      setRescueErrors(prev => ({ ...prev, [userId]: 'Network error — try again' }))
    }
    setDeletingId(null)
  }

  const approvedNonAdmin = profiles.filter(p => p.approval_status === 'approved' || p.approved === true)
  const claimed = approvedNonAdmin.filter(p => p.password_set_at !== null)
  const claimedPlayers = claimed.filter(p => p.role === 'player' || p.role === 'admin')
  const claimedCoaches = claimed.filter(p => p.role === 'coach')
  const migrationPct = approvedNonAdmin.length > 0
    ? Math.round((claimed.length / approvedNonAdmin.length) * 100)
    : 0

  const lookupResults = lookupQuery.trim().length >= 2
    ? profiles.filter(p => {
        const q = lookupQuery.toLowerCase()
        return (
          p.full_name?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q) ||
          p.phone?.toLowerCase().includes(q)
        )
      }).slice(0, 10)
    : []

  const displayed = profiles.filter(p => {
    const status = p.approval_status ?? 'pending'
    return status === tab
  })
  const totalPages = Math.ceil(displayed.length / PAGE_SIZE)
  const paginated = displayed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const showingFrom = displayed.length === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = Math.min((page + 1) * PAGE_SIZE, displayed.length)

  const TABS: { key: TabFilter; label: string; color: string }[] = [
    { key: 'pending', label: 'Pending', color: '#f59e0b' },
    { key: 'approved', label: 'Approved', color: '#22c55e' },
    { key: 'declined', label: 'Declined', color: '#ef4444' },
  ]

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-3 pb-4" style={{ borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between mb-1">
          <Breadcrumb crumbs={[{ label: 'Home', href: '/dashboard/player' }, { label: 'Admin Panel' }]} />
          <button
            onClick={() => window.dispatchEvent(new Event('player:sidebar:open'))}
            className="p-2 rounded-lg"
            style={{ color: '#8892aa' }}
            aria-label="Open menu">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="17" y2="6" /><line x1="3" y1="10" x2="17" y2="10" /><line x1="3" y1="14" x2="17" y2="14" />
            </svg>
          </button>
        </div>
        <h1 className="text-3xl font-black uppercase mb-4 px-2"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Admin Panel
        </h1>

        {/* Stripe Reconcile */}
        <div className="mb-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Stripe Sync</p>
            <p className="text-xs" style={{ color: '#8892aa' }}>
              {reconcileResult
                ? `Done — ${reconcileResult.checked} checked · ${reconcileResult.granted} granted · ${reconcileResult.revoked} revoked`
                : 'Reconcile premium status against live Stripe data'}
            </p>
          </div>
          <button
            onClick={async () => {
              setReconciling(true)
              setReconcileResult(null)
              const res = await fetch('/api/admin/stripe-reconcile', { method: 'POST' })
              const data = await res.json()
              setReconcileResult(data.ok ? data : null)
              setReconciling(false)
            }}
            disabled={reconciling}
            className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
            style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
            {reconciling ? 'Syncing…' : 'Run Sync'}
          </button>
        </div>

        {/* Account Rescue — find signups that never made it through */}
        <div className="mb-4 rounded-xl overflow-hidden"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Account Rescue</p>
              <p className="text-xs" style={{ color: '#8892aa' }}>
                {orphanedLoaded
                  ? orphaned.length === 0
                    ? 'No incomplete signups found'
                    : `${orphaned.filter(u => !rescuedIds.has(u.id)).length} account${orphaned.filter(u => !rescuedIds.has(u.id)).length !== 1 ? 's' : ''} need attention`
                  : 'Find signups that never appeared in pending'}
              </p>
            </div>
            <button
              onClick={loadOrphaned}
              disabled={orphanedLoading}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
              style={{ backgroundColor: '#f59e0b', color: '#0a0a0a' }}>
              {orphanedLoading ? 'Scanning…' : orphanedLoaded ? 'Refresh' : 'Scan'}
            </button>
          </div>

          {orphanedLoaded && orphaned.length > 0 && (
            <div className="border-t divide-y" style={{ borderColor: '#1e2235' }}>
              {orphaned.map(u => {
                const rescued = rescuedIds.has(u.id)
                return (
                  <div key={u.id} className="px-4 py-3"
                    style={{ backgroundColor: rescued ? 'rgba(45,95,196,0.06)' : '#0d1020' }}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: rescued ? '#2d5fc4' : '#e8dece' }}>
                          {u.full_name ?? '(no name saved)'}
                        </p>
                        <p className="text-xs truncate" style={{ color: '#8892aa' }}>{u.email ?? '—'}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#3a4055' }}>
                          Signed up {timeAgo(u.created_at)}
                          {!u.has_profile && ' · no profile row'}
                          {u.has_profile && ' · profile incomplete'}
                        </p>
                      </div>
                      {rescued && (
                        <span className="text-xs px-2 py-1 rounded-lg font-bold flex-shrink-0"
                          style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
                          Moved to Pending
                        </span>
                      )}
                    </div>
                    {!rescued && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Full name (leave blank to use email prefix)"
                          value={rescueNames[u.id] ?? ''}
                          onChange={e => setRescueNames(prev => ({ ...prev, [u.id]: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                          style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
                        />
                        <div className="flex gap-2">
                          <select
                            value={rescueRoles[u.id] ?? ''}
                            onChange={e => setRescueRoles(prev => ({ ...prev, [u.id]: e.target.value }))}
                            className="flex-1 rounded-lg px-3 py-2 text-xs outline-none"
                            style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}>
                            <option value="">Assign role…</option>
                            <option value="player">Player</option>
                            <option value="coach">Coach</option>
                            <option value="fan">Fan</option>
                          </select>
                          <button
                            onClick={() => rescueProfile(u.id)}
                            disabled={!rescueRoles[u.id] || rescuingId === u.id || deletingId === u.id}
                            className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                            style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                            {rescuingId === u.id ? 'Saving…' : 'Save & Pend'}
                          </button>
                          <button
                            onClick={() => deleteOrphanedUser(u.id)}
                            disabled={rescuingId === u.id || deletingId === u.id}
                            className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                            style={{ backgroundColor: '#1e2235', border: '1px solid #ef4444', color: '#ef4444' }}>
                            {deletingId === u.id ? '…' : 'Delete'}
                          </button>
                        </div>
                        {rescueErrors[u.id] && (
                          <p className="text-xs px-1" style={{ color: '#ef4444' }}>
                            {rescueErrors[u.id]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {orphanedLoaded && orphaned.length === 0 && (
            <div className="border-t px-4 py-4 text-center" style={{ borderColor: '#1e2235' }}>
              <p className="text-xs" style={{ color: '#8892aa' }}>All auth accounts have complete profiles.</p>
            </div>
          )}
        </div>

        {/* Migration tracker */}
        <div className="mb-4 rounded-xl p-4 space-y-3"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-wide"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Migration Tracker
            </p>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
              {claimed.length} / {approvedNonAdmin.length} claimed
            </span>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs" style={{ color: '#8892aa' }}>Users signed in to new app</p>
              <p className="text-xs font-bold" style={{ color: migrationPct >= 75 ? '#60a5fa' : migrationPct >= 40 ? '#f59e0b' : '#8892aa' }}>
                {migrationPct}%
              </p>
            </div>
            <div className="w-full rounded-full h-2" style={{ backgroundColor: '#1e2235' }}>
              <div className="h-2 rounded-full transition-all"
                style={{ width: `${migrationPct}%`, backgroundColor: migrationPct >= 75 ? '#60a5fa' : migrationPct >= 40 ? '#f59e0b' : '#2d5fc4' }} />
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Players', value: claimedPlayers.length, color: '#2d5fc4' },
              { label: 'Coaches', value: claimedCoaches.length, color: '#a78bfa' },
              { label: 'Total', value: claimed.length, color: '#e8dece' },
            ].map(s => (
              <div key={s.label} className="rounded-lg px-2 py-2 text-center"
                style={{ backgroundColor: '#0d1020', border: '1px solid #1e2235' }}>
                <p className="text-lg font-black leading-none"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: s.color }}>
                  {s.value}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Showcase Day */}
        <div className="mb-4 rounded-xl overflow-hidden"
          style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4' }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Showcase Day — Confirmed Coaches</p>
              <p className="text-xs" style={{ color: '#8892aa' }}>
                {showcaseLoaded
                  ? `${showcaseCoaches.length} coach${showcaseCoaches.length !== 1 ? 'es' : ''} confirmed`
                  : 'See who has confirmed attendance'}
              </p>
            </div>
            <button
              onClick={loadShowcase}
              disabled={showcaseLoading}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
              style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
              {showcaseLoading ? 'Loading…' : showcaseLoaded ? 'Refresh' : 'Load'}
            </button>
          </div>

          {showcaseLoaded && showcaseCoaches.length > 0 && (
            <div className="border-t divide-y" style={{ borderColor: '#1e2235' }}>
              {showcaseCoaches.map((c, i) => (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xs font-bold w-5 flex-shrink-0" style={{ color: '#8892aa' }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{c.full_name ?? '—'}</p>
                    <p className="text-xs" style={{ color: '#8892aa' }}>
                      {[c.coaching_role, c.club, c.city].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  {c.showcase_confirmed_at && (
                    <p className="text-xs flex-shrink-0" style={{ color: '#60a5fa' }}>
                      {timeAgo(c.showcase_confirmed_at)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {showcaseLoaded && showcaseCoaches.length === 0 && (
            <div className="border-t px-4 py-4 text-center" style={{ borderColor: '#1e2235' }}>
              <p className="text-xs" style={{ color: '#8892aa' }}>No coaches confirmed yet.</p>
            </div>
          )}
        </div>

        {/* Showcase Game 1 — Stripe Payers */}
        <div className="mb-4 rounded-xl overflow-hidden"
          style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4' }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Showcase Game 1 — Stripe Payers</p>
              <p className="text-xs" style={{ color: '#8892aa' }}>
                {payersLoaded
                  ? `${payersMatched.length} to enable · ${payersAlreadyEnabled.length} already on · ${payersUnmatched.length} unmatched`
                  : 'Match £14.99 / £20 Stripe payments to profiles'}
              </p>
            </div>
            <button
              onClick={loadShowcasePayers}
              disabled={payersLoading}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
              style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
              {payersLoading ? 'Loading…' : payersLoaded ? 'Refresh' : 'Load'}
            </button>
          </div>

          {payersLoaded && (
            <div className="border-t" style={{ borderColor: '#1e2235' }}>

              {/* Matched — needs enabling */}
              {payersMatched.length > 0 && (
                <>
                  <div className="px-4 py-2 flex items-center justify-between"
                    style={{ backgroundColor: 'rgba(45,95,196,0.08)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#2d5fc4' }}>
                      {payersMatched.length} matched — not yet enabled
                    </p>
                    <button
                      onClick={enableShowcasePayers}
                      disabled={payersEnabling}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                      style={{ backgroundColor: '#e8dece', color: '#0a0a0a' }}>
                      {payersEnabling ? 'Enabling…' : `Enable all ${payersMatched.length}`}
                    </button>
                  </div>
                  <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                    {payersMatched.map((p, i) => (
                      <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="text-xs font-bold w-5 flex-shrink-0" style={{ color: '#8892aa' }}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? '—'}</p>
                          <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                            {[p.email, p.position, p.club].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                          {p.role ?? '?'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Already enabled */}
              {payersAlreadyEnabled.length > 0 && (
                <>
                  <div className="px-4 py-2" style={{ backgroundColor: 'rgba(96,165,250,0.06)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#60a5fa' }}>
                      {payersAlreadyEnabled.length} already enabled
                    </p>
                  </div>
                  <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                    {payersAlreadyEnabled.map((p, i) => (
                      <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="text-xs font-bold w-5 flex-shrink-0" style={{ color: '#8892aa' }}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: '#60a5fa' }}>{p.full_name ?? '—'}</p>
                          <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                            {[p.email, p.position, p.club].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Unmatched — paid but no profile found */}
              {payersUnmatched.length > 0 && (
                <>
                  <div className="px-4 py-2" style={{ backgroundColor: 'rgba(239,68,68,0.06)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ef4444' }}>
                      {payersUnmatched.length} unmatched — no profile found
                    </p>
                  </div>
                  <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                    {payersUnmatched.map((p, i) => (
                      <div key={i} className="px-4 py-3 flex items-center gap-3">
                        <span className="text-xs font-bold w-5 flex-shrink-0" style={{ color: '#8892aa' }}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{p.name ?? '—'}</p>
                          <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                            {p.email} · £{(p.amount / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {payersEnabledCount > 0 && payersMatched.length === 0 && (
                <div className="px-4 py-4 text-center">
                  <p className="text-xs font-bold" style={{ color: '#60a5fa' }}>
                    Done — {payersEnabledCount} player{payersEnabledCount !== 1 ? 's' : ''} enabled
                  </p>
                </div>
              )}

              {payersLoaded && payersMatched.length === 0 && payersAlreadyEnabled.length === 0 && payersUnmatched.length === 0 && (
                <div className="px-4 py-4 text-center">
                  <p className="text-xs" style={{ color: '#8892aa' }}>No £14.99 or £20 payments found in Stripe.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Lookup */}
        <div className="mb-4 rounded-xl overflow-hidden"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="px-4 py-3">
            <p className="text-sm font-bold mb-2" style={{ color: '#e8dece' }}>User Lookup</p>
            <input
              type="text"
              placeholder="Search by name, email or phone…"
              value={lookupQuery}
              onChange={e => setLookupQuery(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
            />
            {lookupQuery.trim().length > 0 && lookupQuery.trim().length < 2 && (
              <p className="text-xs mt-1.5" style={{ color: '#8892aa' }}>Type at least 2 characters…</p>
            )}
          </div>

          {lookupResults.length > 0 && (
            <div className="border-t divide-y" style={{ borderColor: '#1e2235' }}>
              {lookupResults.map(p => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{p.full_name ?? '(no name)'}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold uppercase"
                      style={{
                        backgroundColor: p.role === 'coach' ? (p.is_agent ? 'rgba(245,158,11,0.15)' : 'rgba(168,139,250,0.15)') : 'rgba(45,95,196,0.15)',
                        color: p.role === 'coach' ? (p.is_agent ? '#f59e0b' : '#a78bfa') : '#2d5fc4',
                      }}>
                      {p.role === 'coach' && p.is_agent ? 'agent' : (p.role ?? '?')}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: p.approval_status === 'approved' ? 'rgba(45,95,196,0.1)' : p.approval_status === 'declined' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                        color: p.approval_status === 'approved' ? '#60a5fa' : p.approval_status === 'declined' ? '#ef4444' : '#f59e0b',
                      }}>
                      {p.approval_status ?? 'pending'}
                    </span>
                    {p.role === 'coach' && (
                      <button
                        onClick={() => toggleAgent(p.id, !p.is_agent)}
                        disabled={agentSaving === p.id}
                        className="text-xs px-1.5 py-0.5 rounded-full font-bold uppercase disabled:opacity-50"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#8892aa', border: '1px solid #1e2235' }}>
                        {agentSaving === p.id ? '…' : p.is_agent ? 'Unset agent' : 'Mark agent'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs w-10 flex-shrink-0" style={{ color: '#8892aa' }}>Email</p>
                      <p className="text-xs font-medium" style={{ color: p.email ? '#e8dece' : '#3a4055' }}>
                        {p.email ?? '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs w-10 flex-shrink-0" style={{ color: '#8892aa' }}>Phone</p>
                      <p className="text-xs font-medium" style={{ color: p.phone ? '#e8dece' : '#3a4055' }}>
                        {p.phone ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {lookupQuery.trim().length >= 2 && lookupResults.length === 0 && (
            <div className="border-t px-4 py-4 text-center" style={{ borderColor: '#1e2235' }}>
              <p className="text-xs" style={{ color: '#8892aa' }}>No users found for "{lookupQuery}"</p>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {TABS.map(t => (
            <div key={t.key} className="rounded-xl px-3 py-2.5 text-center"
              style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              <p className="text-xl font-black" style={{ color: t.color }}>{counts[t.key]}</p>
              <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{t.label}</p>
            </div>
          ))}
        </div>

        {/* Tab selector */}
        <div className="flex gap-1.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(0) }}
              className="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: tab === t.key ? t.color : '#13172a',
                color: tab === t.key ? '#fff' : '#8892aa',
                border: tab === t.key ? 'none' : '1px solid #1e2235',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-8">
          <p className="text-xl font-black uppercase mb-2"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            No {tab} applicants
          </p>
          <p className="text-sm" style={{ color: '#8892aa' }}>
            {tab === 'pending' ? 'All caught up.' : `No ${tab} users yet.`}
          </p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
          {paginated.map(p => (
            <div key={p.id} className="rounded-2xl p-4"
              style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold" style={{ color: '#e8dece' }}>
                      {p.full_name ?? 'Unknown'}
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase"
                      style={{
                        backgroundColor: p.role === 'coach' ? (p.is_agent ? 'rgba(245,158,11,0.15)' : 'rgba(168,139,250,0.15)') : p.role === 'fan' ? 'rgba(136,146,170,0.15)' : 'rgba(45,95,196,0.15)',
                        color: p.role === 'coach' ? (p.is_agent ? '#f59e0b' : '#a78bfa') : p.role === 'fan' ? '#8892aa' : '#2d5fc4',
                      }}>
                      {p.role === 'coach' && p.is_agent ? 'agent' : (p.role ?? 'unknown')}
                    </span>
                    {p.role === 'coach' && (
                      <button
                        onClick={() => toggleAgent(p.id, !p.is_agent)}
                        disabled={agentSaving === p.id}
                        className="text-xs px-2 py-0.5 rounded-full font-bold uppercase disabled:opacity-50"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#8892aa', border: '1px solid #1e2235' }}>
                        {agentSaving === p.id ? '…' : p.is_agent ? 'Unset agent' : 'Mark agent'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{p.email ?? '—'}</p>
                </div>
                <p className="text-xs flex-shrink-0" style={{ color: '#8892aa' }}>{timeAgo(p.created_at)}</p>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
                {p.role === 'player' ? (
                  <>
                    <Detail label="Position" value={p.position} />
                    <Detail label="Club" value={p.club} />
                    <Detail label="City" value={p.city} />
                    <Detail label="Level" value={p.playing_level} />
                  </>
                ) : p.role === 'coach' ? (
                  <>
                    <Detail label="Role" value={p.coaching_role} />
                    <Detail label="Club" value={p.club} />
                    <Detail label="City" value={p.city} />
                    <Detail label="Level" value={p.coaching_level} />
                  </>
                ) : (
                  <Detail label="Type" value="Supporter / Viewer" />
                )}
                <Detail label="Phone" value={p.phone} />
                <Detail label="GDPR" value={p.gdpr_consent ? 'Consented' : 'Not consented'} />
              </div>

              {/* Actions */}
              {tab === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => review(p.id, 'approve')}
                    disabled={processing === p.id}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity"
                    style={{ backgroundColor: '#22c55e', color: '#fff', opacity: processing === p.id ? 0.5 : 1 }}>
                    {processing === p.id ? 'Processing…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => review(p.id, 'decline')}
                    disabled={processing === p.id}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity"
                    style={{ backgroundColor: '#1e2235', border: '1px solid #ef4444', color: '#ef4444', opacity: processing === p.id ? 0.5 : 1 }}>
                    Decline
                  </button>
                </div>
              )}

              {tab === 'approved' && (
                <button
                  onClick={() => review(p.id, 'decline')}
                  disabled={processing === p.id}
                  className="w-full py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: '#1e2235', border: '1px solid #1e2235', color: '#8892aa' }}>
                  Revoke Access
                </button>
              )}

              {tab === 'declined' && (
                <button
                  onClick={() => review(p.id, 'approve')}
                  disabled={processing === p.id}
                  className="w-full py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: '#1e2235', border: '1px solid #22c55e', color: '#22c55e' }}>
                  Approve
                </button>
              )}
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs" style={{ color: '#8892aa' }}>
                Showing {showingFrom}–{showingTo} of {displayed.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30"
                  style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}>
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30"
                  style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs" style={{ color: '#8892aa' }}>{label}</p>
      <p className="text-xs font-medium" style={{ color: value ? '#e8dece' : '#3a4055' }}>{value ?? '—'}</p>
    </div>
  )
}

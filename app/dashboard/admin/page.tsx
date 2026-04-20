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
  approval_status: string | null
  created_at: string
  gdpr_consent: boolean | null
  phone: string | null
  password_set_at: string | null
}

type TabFilter = 'pending' | 'approved' | 'declined'

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
  const [counts, setCounts] = useState({ pending: 0, approved: 0, declined: 0 })
  const [reconciling, setReconciling] = useState(false)
  const [reconcileResult, setReconcileResult] = useState<{ granted: number; revoked: number; checked: number } | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

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

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, position, club, city, playing_level, coaching_level, coaching_role, approval_status, created_at, gdpr_consent, phone, password_set_at')
      .or('role.neq.admin,role.is.null')
      .order('created_at', { ascending: false })

    const all = (data ?? []) as ApplicantProfile[]
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

  const approvedNonAdmin = profiles.filter(p => p.approval_status === 'approved')
  const claimed = approvedNonAdmin.filter(p => p.password_set_at !== null)
  const claimedPlayers = claimed.filter(p => p.role === 'player' || p.role === 'admin')
  const claimedCoaches = claimed.filter(p => p.role === 'coach')
  const migrationPct = approvedNonAdmin.length > 0
    ? Math.round((claimed.length / approvedNonAdmin.length) * 100)
    : 0

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
        <Breadcrumb crumbs={[{ label: 'Home', href: '/dashboard/player' }, { label: 'Admin Panel' }]} />
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
                        backgroundColor: p.role === 'coach' ? 'rgba(168,139,250,0.15)' : p.role === 'fan' ? 'rgba(136,146,170,0.15)' : 'rgba(45,95,196,0.15)',
                        color: p.role === 'coach' ? '#a78bfa' : p.role === 'fan' ? '#8892aa' : '#2d5fc4',
                      }}>
                      {p.role ?? 'unknown'}
                    </span>
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

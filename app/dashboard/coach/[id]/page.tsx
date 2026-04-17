'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import Breadcrumb from '@/app/components/Breadcrumb'

// ─── Types ────────────────────────────────────────────────────────────────────

type CoachProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  club: string | null
  city: string | null
  coaching_role: string | null
  coaching_level: string | null
  coaching_history: string | null
  last_active: string | null
}

type Opportunity = {
  id: string
  title: string
  position: string | null
  location: string | null
  level: string | null
  created_at: string
}

type ViewerProfile = {
  id: string
  role: string
}

function isActiveThisWeek(lastActive: string | null) {
  if (!lastActive) return false
  return Date.now() - new Date(lastActive).getTime() < 7 * 86400000
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #1e2235' }}>
      <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: value ? '#e8dece' : '#8892aa' }}>{value ?? '—'}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachPublicProfile() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [coach, setCoach] = useState<CoachProfile | null>(null)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [viewer, setViewer] = useState<ViewerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [showDMInput, setShowDMInput] = useState(false)
  const [dmText, setDmText] = useState('')
  const [dmSending, setDmSending] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/'); return }

        const [coachRes, viewerRes, oppsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, avatar_url, bio, club, city, coaching_role, coaching_level, coaching_history, last_active')
            .eq('id', id)
            .eq('role', 'coach')
            .single(),
          supabase
            .from('profiles')
            .select('id, role')
            .eq('id', user.id)
            .single(),
          supabase
            .from('opportunities')
            .select('id, title, position, location, level, created_at')
            .eq('coach_id', id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(10),
        ])

        if (coachRes.error || !coachRes.data) {
          setLoadError('Coach profile not found.')
          setLoading(false)
          return
        }

        setCoach(coachRes.data as CoachProfile)
        setViewer(viewerRes.data as ViewerProfile)
        setOpportunities((oppsRes.data ?? []) as Opportunity[])
        setLoading(false)
      } catch (err) {
        console.error('Error loading coach profile:', err)
        setLoadError('Something went wrong loading this profile.')
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function handleSendDM(e: React.FormEvent) {
    e.preventDefault()
    if (!dmText.trim()) return
    setDmSending(true)
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coach_id: id, content: dmText.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setToast(`Error: ${data.error}`)
        setTimeout(() => setToast(''), 3000)
      } else {
        setDmText('')
        setShowDMInput(false)
        setToast('Message sent ✓')
        setTimeout(() => setToast(''), 2500)
      }
    } catch {
      setToast('Failed to send — please try again')
      setTimeout(() => setToast(''), 3000)
    }
    setDmSending(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (loadError || !coach) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ backgroundColor: '#0a0a0a' }}>
        <p className="text-sm text-center" style={{ color: '#8892aa' }}>{loadError ?? 'Profile not found.'}</p>
        <button onClick={() => router.back()} className="text-sm" style={{ color: '#2d5fc4' }}>← Go back</button>
      </div>
    )
  }

  const active = isActiveThisWeek(coach.last_active)
  const initials = coach.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const subtitle = [coach.coaching_role, coach.club].filter(Boolean).join(' · ') || 'Coach'
  const isOwnProfile = viewer?.id === coach.id
  const viewerIsPlayer = viewer?.role === 'player' || viewer?.role === 'admin'

  const backHref = viewerIsPlayer ? '/dashboard/player' : '/dashboard/coach'
  const backLabel = viewerIsPlayer ? 'Home' : 'Home'

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg"
          style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#e8dece', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-3 pb-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: backLabel, href: backHref },
          { label: coach.full_name ?? 'Coach' },
        ]} />
        {active && (
          <span className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#60a5fa' }} />
            Active
          </span>
        )}
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center px-6 pt-7 pb-5 text-center">
        <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center mb-4"
          style={{ border: '3px solid #2d5fc4', backgroundColor: '#1a1f3a' }}>
          {coach.avatar_url ? (
            <img src={coach.avatar_url} alt={coach.full_name ?? ''} className="w-full h-full object-cover object-top" />
          ) : (
            <span className="font-black text-4xl"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
              {initials}
            </span>
          )}
        </div>

        <h1 className="text-3xl font-black uppercase leading-none"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          {coach.full_name ?? 'Coach'}
        </h1>
        <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>{subtitle}</p>

        {/* Message button — players only, not own profile */}
        {!isOwnProfile && viewerIsPlayer && (
          <div className="w-full mt-5 px-2">
            {showDMInput ? (
              <form onSubmit={handleSendDM} className="space-y-2">
                <textarea
                  autoFocus
                  value={dmText}
                  onChange={e => setDmText(e.target.value)}
                  placeholder={`Message ${coach.full_name?.split(' ')[0] ?? 'coach'}…`}
                  rows={3}
                  className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#e8dece' }}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowDMInput(false)}
                    className="flex-1 py-3 rounded-2xl text-sm font-bold"
                    style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={!dmText.trim() || dmSending}
                    className="flex-1 py-3 rounded-2xl text-sm font-bold"
                    style={{ backgroundColor: dmText.trim() ? '#2d5fc4' : '#1e2235', color: '#fff' }}>
                    {dmSending ? 'Sending…' : 'Send Message'}
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowDMInput(true)}
                className="w-full py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2"
                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Message Coach
              </button>
            )}
          </div>
        )}

        {/* Own profile edit shortcut */}
        {isOwnProfile && (
          <Link href="/dashboard/profile"
            className="mt-5 flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-sm font-bold uppercase tracking-wider"
            style={{ border: '1px solid #2d5fc4', color: '#2d5fc4', textDecoration: 'none' }}>
            Edit Your Profile
          </Link>
        )}
      </div>

      <div className="px-4 space-y-4 pb-8">

        {/* Coaching Info */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
            <h2 className="text-base font-bold uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Coaching Info</h2>
          </div>
          <div className="px-4">
            <Row label="Role" value={coach.coaching_role} />
            <Row label="Level" value={coach.coaching_level} />
            <Row label="Club / Organisation" value={coach.club} />
            <Row label="Location" value={coach.city} />
          </div>
        </div>

        {/* Bio */}
        {coach.bio && (
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <h2 className="text-base font-bold uppercase mb-3"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>About</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>{coach.bio}</p>
          </div>
        )}

        {/* Coaching History */}
        {coach.coaching_history && (
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <h2 className="text-base font-bold uppercase mb-3"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Coaching History</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#8892aa' }}>{coach.coaching_history}</p>
          </div>
        )}

        {/* Active Opportunities */}
        {opportunities.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Open Opportunities
            </h2>
            {opportunities.map(opp => (
              <div key={opp.id} className="rounded-2xl p-4 space-y-1"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{opp.title}</p>
                <p className="text-xs" style={{ color: '#8892aa' }}>
                  {[opp.position, opp.level, opp.location].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Privacy note */}
        {!isOwnProfile && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" />
            </svg>
            <p className="text-xs" style={{ color: '#8892aa' }}>
              Phone &amp; email are private. Use the message button to make contact.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}

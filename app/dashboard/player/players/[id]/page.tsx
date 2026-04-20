'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import Breadcrumb from '@/app/components/Breadcrumb'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'

// ─── Types ────────────────────────────────────────────────────────────────────

type PublicProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  secondary_position: string | null
  club: string | null
  city: string | null
  location: string | null
  playing_level: string | null
  foot: string | null
  height: string | null
  status: string | null
  goals: number
  assists: number
  appearances: number
  season: string | null
  highlight_urls: string[]
  bio: string | null
  premium: boolean
  streak_weeks: number
  last_active: string | null
}

type ViewerProfile = {
  id: string
  premium: boolean
  role: string
  city: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  available:      { label: 'Available',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  open_to_offers: { label: 'Open to Offers', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  not_available:  { label: 'Not Available',  color: '#8892aa', bg: 'rgba(136,146,170,0.1)' },
}

function isActiveThisWeek(lastActive: string | null) {
  if (!lastActive) return false
  return Date.now() - new Date(lastActive).getTime() < 7 * 86400000
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
      <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{value}</p>
      <p className="text-xs uppercase tracking-wider mt-0.5" style={{ color: '#8892aa' }}>{label}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #1e2235' }}>
      <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: value ? '#e8dece' : '#8892aa' }}>{value ?? '—'}</span>
    </div>
  )
}

// ─── YouTube embed ────────────────────────────────────────────────────────────

function getYouTubeId(url: string) {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)
  return match?.[1] ?? null
}

function HighlightEmbed({ url }: { url: string }) {
  const id = getYouTubeId(url)
  if (id) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
      style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#2d5fc4' }}>
      View highlight reel
    </a>
  )
}

// ─── Premium Lock Banner ──────────────────────────────────────────────────────

function PremiumLock({ message, cta }: { message: string; cta: string }) {
  return (
    <Link href="/dashboard/player/premium"
      className="flex items-center gap-3 rounded-xl px-4 py-3.5"
      style={{ backgroundColor: 'rgba(45,95,196,0.08)', border: '1px dashed #2d5fc4', textDecoration: 'none' }}>
      <span className="text-lg">🔒</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>{message}</p>
        <p className="text-xs mt-0.5" style={{ color: '#2d5fc4' }}>{cta}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  )
}

// ─── Folder Modal ─────────────────────────────────────────────────────────────

function FolderModal({
  folders,
  onSave,
  onClose,
}: {
  folders: string[]
  onSave: (folder: string) => void
  onClose: () => void
}) {
  const [newFolder, setNewFolder] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const suggestions = folders.length > 0 ? folders : ['Shortlist', 'Wingers', 'Strikers', 'Defenders', 'Midfielders']

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 space-y-4"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', maxHeight: '70vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black uppercase text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Save to Folder
          </h3>
          <button onClick={onClose} style={{ color: '#8892aa' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Existing folders */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>
              {folders.length > 0 ? 'Your folders' : 'Quick add'}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map(f => (
                <button key={f} onClick={() => onSave(f)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}>
                  📁 {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New folder */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>New folder</p>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={newFolder}
              onChange={e => setNewFolder(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newFolder.trim() && onSave(newFolder.trim())}
              placeholder="e.g. Left Wingers"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
            />
            <button
              onClick={() => newFolder.trim() && onSave(newFolder.trim())}
              disabled={!newFolder.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-bold"
              style={{ backgroundColor: newFolder.trim() ? '#2d5fc4' : '#1e2235', color: newFolder.trim() ? '#fff' : '#8892aa' }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlayerPublicProfile() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { openSidebar } = useSidebar()
  const [player, setPlayer] = useState<PublicProfile | null>(null)
  const [viewer, setViewer] = useState<ViewerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Coach shortlist state
  const [savedFolder, setSavedFolder] = useState<string | null>(null)
  const [folders, setFolders] = useState<string[]>([])
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveToast, setSaveToast] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showDMInput, setShowDMInput] = useState(false)
  const [dmText, setDmText] = useState('')
  const [dmSending, setDmSending] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/'); return }

        const [playerRes, viewerRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name, avatar_url, position, secondary_position, club, city, location, playing_level, foot, height, status, goals, assists, appearances, season, highlight_urls, bio, premium, streak_weeks, last_active').eq('id', id).single(),
          supabase.from('profiles').select('id, premium, role, city').eq('id', user.id).single(),
        ])

        if (playerRes.error) {
          console.error('Player load error:', playerRes.error)
          setLoadError(playerRes.error.message)
          setLoading(false)
          return
        }
        if (!playerRes.data) { router.push('/dashboard/player/players'); return }

        setPlayer({ ...playerRes.data, highlight_urls: playerRes.data.highlight_urls ?? [] } as PublicProfile)
        setViewer(viewerRes.data as ViewerProfile)

        // Record view — players and coaches only, not fans
        const viewerRole = viewerRes.data?.role ?? null
        if (user.id !== id && viewerRole !== 'fan') {
          const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
          supabase
            .from('player_views')
            .select('id')
            .eq('player_id', id)
            .eq('viewer_id', user.id)
            .gte('viewed_at', oneHourAgo)
            .limit(1)
            .then(({ data }) => {
              if (!data || data.length === 0) {
                supabase.from('player_views').insert({
                  player_id: id,
                  viewer_id: user.id,
                  viewer_role: viewerRole,
                  viewed_at: new Date().toISOString(),
                }).then(() => {})
              }
            })
        }

        // Load coach shortlist state (non-blocking, errors are silent)
        if (viewerRes.data?.role === 'coach' && user.id !== id) {
          const [savedRes, foldersRes] = await Promise.all([
            supabase.from('coach_saved_players').select('folder_name').eq('coach_id', user.id).eq('player_id', id).maybeSingle(),
            supabase.from('coach_saved_players').select('folder_name').eq('coach_id', user.id),
          ])
          if (!savedRes.error) setSavedFolder(savedRes.data?.folder_name ?? null)
          if (!foldersRes.error) {
            const uniqueFolders = [...new Set((foldersRes.data ?? []).map(r => r.folder_name))]
            setFolders(uniqueFolders)
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Unexpected error loading player profile:', err)
        setLoadError('Something went wrong loading this profile.')
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function handleSaveToFolder(folderName: string) {
    if (!viewer) return
    setSaving(true)
    setShowFolderModal(false)
    const supabase = createClient()
    await supabase.from('coach_saved_players').upsert(
      { coach_id: viewer.id, player_id: id, folder_name: folderName },
      { onConflict: 'coach_id,player_id' }
    )
    setSavedFolder(folderName)
    if (!folders.includes(folderName)) setFolders(f => [...f, folderName])
    setSaving(false)
    setSaveToast(`Saved to "${folderName}"`)
    setTimeout(() => setSaveToast(''), 2500)
  }

  async function handleSendDM(e: React.FormEvent) {
    e.preventDefault()
    if (!dmText.trim()) return
    setDmSending(true)
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: id, content: dmText.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setSaveToast(`Error: ${data.error}`)
      } else {
        setDmText('')
        setShowDMInput(false)
        setSaveToast('Message sent ✓')
        setTimeout(() => setSaveToast(''), 2500)
        router.push(`/dashboard/coach/messages?player=${id}`)
      }
    } catch {
      setSaveToast('Failed to send — please try again')
      setTimeout(() => setSaveToast(''), 2500)
    }
    setDmSending(false)
  }

  async function handleRemove() {
    if (!viewer) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('coach_saved_players').delete().eq('coach_id', viewer.id).eq('player_id', id)
    setSavedFolder(null)
    setSaving(false)
    setSaveToast('Removed from shortlist')
    setTimeout(() => setSaveToast(''), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ backgroundColor: '#0a0a0a' }}>
        <p className="text-sm text-center" style={{ color: '#8892aa' }}>Failed to load profile.</p>
        <p className="text-xs text-center font-mono px-4 py-2 rounded-lg" style={{ color: '#f87171', backgroundColor: '#1a1215', border: '1px solid #f8717130' }}>{loadError}</p>
        <button onClick={() => router.back()} className="text-sm" style={{ color: '#2d5fc4' }}>← Go back</button>
      </div>
    )
  }

  if (!player) return null

  const statusCfg = player.status ? STATUS_CONFIG[player.status] : null
  const active = isActiveThisWeek(player.last_active)
  const initials = player.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const isOwnProfile = viewer?.id === player.id
  const viewerIsPremium = viewer?.premium ?? false
  const viewerIsCoach = viewer?.role === 'coach'

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {/* Toast */}
      {saveToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg"
          style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#e8dece', whiteSpace: 'nowrap' }}>
          {saveToast}
        </div>
      )}

      {/* Folder modal */}
      {showFolderModal && (
        <FolderModal
          folders={folders}
          onSave={handleSaveToFolder}
          onClose={() => setShowFolderModal(false)}
        />
      )}

      {/* Header bar with breadcrumb */}
      <div className="px-4 pt-3 pb-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid #1e2235' }}>
        <button onClick={openSidebar} className="flex flex-col gap-1.5 flex-shrink-0" style={{ width: 20 }}>
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
        </button>
        <Breadcrumb crumbs={[
          { label: 'Players', href: '/dashboard/player/players' },
          { label: player.full_name ?? 'Player' },
        ]} />
        <div className="flex gap-2 ml-auto">
          {player.premium && (
            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(45,95,196,0.9)', color: '#fff' }}>PRO</span>
          )}
          {active && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#60a5fa' }} />
              Active
            </span>
          )}
        </div>
      </div>

      {/* Profile header — circular avatar, centered */}
      <div className="flex flex-col items-center px-6 pt-7 pb-5 text-center">
        {/* Avatar circle */}
        <div className="relative mb-4">
          <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              border: `3px solid ${statusCfg ? statusCfg.color : '#1e2235'}`,
              backgroundColor: '#1a1f3a',
            }}>
            {player.avatar_url ? (
              <img src={player.avatar_url} alt={player.full_name ?? ''} className="w-full h-full object-cover object-top" />
            ) : (
              <span className="font-black text-4xl" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                {initials}
              </span>
            )}
          </div>
          {/* Status dot */}
          {statusCfg && (
            <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
              style={{ backgroundColor: statusCfg.color, borderColor: '#0a0a0a' }} />
          )}
        </div>

        {/* Name */}
        <h1 className="text-3xl font-black uppercase leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          {player.full_name ?? 'Player'}
        </h1>

        {/* Position · Club */}
        <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>
          {[player.position, player.club].filter(Boolean).join(' · ') || 'Player'}
        </p>

        {/* Status badge */}
        {statusCfg && (
          <span className="inline-block mt-3 text-xs px-3 py-1 rounded-full font-medium"
            style={{ color: statusCfg.color, backgroundColor: statusCfg.bg }}>
            {statusCfg.label}
          </span>
        )}

        {/* ── Action buttons — coach only, right below the photo ── */}
        {!isOwnProfile && viewerIsCoach && (
          <div className="w-full mt-5 space-y-2 px-2">
            {/* DM button */}
            {showDMInput ? (
              <form onSubmit={handleSendDM} className="space-y-2">
                <textarea
                  autoFocus
                  value={dmText}
                  onChange={e => setDmText(e.target.value)}
                  placeholder={`Message ${player.full_name?.split(' ')[0] ?? 'player'}… (they'll get an SMS alert)`}
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
                Send Message
              </button>
            )}

            {/* Save to shortlist — premium coaches only */}
            {savedFolder ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm"
                  style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}>
                  <span>📁</span> Saved to <strong>{savedFolder}</strong>
                </div>
                <button onClick={handleRemove} disabled={saving}
                  className="px-4 py-3 rounded-2xl text-sm"
                  style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#8892aa' }}>
                  Remove
                </button>
              </div>
            ) : viewerIsPremium ? (
              <button onClick={() => setShowFolderModal(true)} disabled={saving}
                className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}>
                📁 Save to Shortlist
              </button>
            ) : (
              <PremiumLock
                message="Shortlisting is a Coach Pro feature"
                cta="Upgrade to save players & get status alerts"
              />
            )}
          </div>
        )}
      </div>

      <div className="px-4 space-y-4 pb-8">

        {/* Stats */}
        {(player.goals > 0 || player.assists > 0 || player.appearances > 0) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                Season Stats
              </h2>
              {player.season && <span className="text-xs" style={{ color: '#8892aa' }}>{player.season}</span>}
            </div>
            <div className="flex gap-3">
              <StatTile label="Goals" value={player.goals} />
              <StatTile label="Assists" value={player.assists} />
              <StatTile label="Apps" value={player.appearances} />
            </div>
          </div>
        )}

        {/* Football Info */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
            <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Football Info</h2>
          </div>
          <div className="px-4">
            <Row label="Position" value={[player.position, player.secondary_position].filter(Boolean).join(' / ') || null} />
            <Row label="Playing Level" value={player.playing_level} />
            <Row label="Strongest Foot" value={player.foot} />
            <Row label="Height" value={player.height} />
            <Row label="Location" value={[player.city, player.location].filter(Boolean).join(', ') || null} />
          </div>
        </div>

        {/* Bio */}
        {player.bio && (
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <h2 className="text-base font-bold uppercase mb-3" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>About</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>{player.bio}</p>
          </div>
        )}

        {/* Highlights */}
        {player.highlight_urls.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Highlights</h2>
            {player.highlight_urls.map((url, i) => <HighlightEmbed key={i} url={url} />)}
          </div>
        )}

        {/* Streak */}
        {player.streak_weeks > 0 && (
          <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <span className="text-xl">🔥</span>
            <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>
              {player.streak_weeks}-week active streak
            </p>
          </div>
        )}

        {/* Privacy note — visible to all non-owners */}
        {!isOwnProfile && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" />
            </svg>
            <p className="text-xs" style={{ color: '#8892aa' }}>
              Phone &amp; email are private. Use DMs to make first contact.
            </p>
          </div>
        )}

        {/* Own profile shortcut */}
        {isOwnProfile && (
          <Link href="/dashboard/player/profile"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-sm font-bold uppercase tracking-wider"
            style={{ border: '1px solid #2d5fc4', color: '#2d5fc4', textDecoration: 'none' }}>
            Edit Your Profile
          </Link>
        )}

      </div>
    </div>
  )
}

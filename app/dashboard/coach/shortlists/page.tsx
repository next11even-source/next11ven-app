'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import Breadcrumb from '@/app/components/Breadcrumb'

type PlayerProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  club: string | null
  city: string | null
  status: string | null
  playing_level: string | null
}

type SavedRow = {
  id: string
  player_id: string
  folder_name: string
  created_at: string
}

type SavedPlayer = SavedRow & { player: PlayerProfile | null }

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  free_agent:    { label: 'Free Agent',                  color: '#60a5fa' },
  signed:        { label: 'Signed to a club',            color: '#8892aa' },
  loan_dual_reg: { label: 'Looking for Loan / Dual Reg', color: '#a78bfa' },
  just_exploring:{ label: 'Just Exploring',              color: '#f59e0b' },
}

function isAvailable(status: string | null) {
  return status === 'free_agent' || status === 'loan_dual_reg' || status === 'just_exploring'
}

export default function ShortlistsPage() {
  const router = useRouter()
  const [saved, setSaved] = useState<SavedPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    // Two queries to avoid join cardinality ambiguity
    const { data: rows } = await supabase
      .from('coach_saved_players')
      .select('id, player_id, folder_name, created_at')
      .eq('coach_id', user.id)
      .order('folder_name')
      .order('created_at', { ascending: false })

    if (!rows || rows.length === 0) { setLoading(false); return }

    const playerIds = rows.map((r: SavedRow) => r.player_id)
    const { data: players } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, position, club, city, status, playing_level')
      .in('id', playerIds)

    const playerMap = Object.fromEntries((players ?? []).map((p: PlayerProfile) => [p.id, p]))
    setSaved(rows.map((r: SavedRow) => ({ ...r, player: playerMap[r.player_id] ?? null })))
    setLoading(false)
  }

  async function removePlayer(savedId: string) {
    setRemoving(savedId)
    const supabase = createClient()
    await supabase.from('coach_saved_players').delete().eq('id', savedId)
    setSaved(prev => prev.filter(s => s.id !== savedId))
    setRemoving(null)
  }

  async function renameFolder(from: string, to: string) {
    if (!to.trim() || to.trim() === from) { setRenaming(null); return }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('coach_saved_players')
      .update({ folder_name: to.trim() })
      .eq('coach_id', user.id)
      .eq('folder_name', from)
    setSaved(prev => prev.map(s => s.folder_name === from ? { ...s, folder_name: to.trim() } : s))
    setRenaming(null)
  }

  const folders = [...new Set(saved.map(s => s.folder_name))]
  const byFolder: Record<string, SavedPlayer[]> = Object.fromEntries(
    folders.map(f => [f, saved.filter(s => s.folder_name === f)])
  )
  const availableNow = saved.filter(s => isAvailable(s.player?.status ?? null))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-3 pb-4"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center gap-3">
          <Breadcrumb crumbs={[{ label: 'Home', href: '/dashboard/coach' }, { label: 'Shortlists' }]} />
          <span className="ml-auto text-xs" style={{ color: '#8892aa' }}>{saved.length} player{saved.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {saved.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center space-y-3">
          <span className="text-5xl">📁</span>
          <p className="font-black uppercase text-xl" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            No players saved yet
          </p>
          <p className="text-sm" style={{ color: '#8892aa' }}>
            Browse players and tap &quot;Save to Shortlist&quot; to build your recruitment folders.
          </p>
          <Link href="/dashboard/player/players"
            className="mt-2 px-6 py-3 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
            Browse Players
          </Link>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-6">

          {/* Available Now alert */}
          {availableNow.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #60a5fa40', backgroundColor: 'rgba(96,165,250,0.06)' }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #60a5fa20' }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#60a5fa' }} />
                <p className="text-sm font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#60a5fa' }}>
                  Available Now — {availableNow.length} player{availableNow.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: '#60a5fa10' }}>
                {availableNow.map(s => {
                  const p = s.player
                  const statusCfg = p?.status ? STATUS_CONFIG[p.status] : null
                  const initials = p?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
                  return (
                    <Link key={s.id} href={`/dashboard/player/players/${s.player_id}`}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ textDecoration: 'none' }}>
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: '#1a1f3a' }}>
                        {p?.avatar_url
                          ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-black" style={{ color: '#2d5fc4' }}>{initials}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{p?.full_name ?? 'Player'}</p>
                        <p className="text-xs truncate" style={{ color: '#8892aa' }}>{p?.position ?? '—'} · {p?.club ?? p?.city ?? '—'}</p>
                      </div>
                      {statusCfg && (
                        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ color: statusCfg.color, backgroundColor: `${statusCfg.color}15` }}>
                          {statusCfg.label}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Folders */}
          {folders.map(folder => {
            const players = byFolder[folder]
            const isRenaming = renaming?.from === folder
            return (
              <div key={folder}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">📁</span>
                  {isRenaming ? (
                    <form onSubmit={e => { e.preventDefault(); renameFolder(folder, renaming.to) }}
                      className="flex items-center gap-2 flex-1">
                      <input
                        autoFocus
                        value={renaming.to}
                        onChange={e => setRenaming({ from: folder, to: e.target.value })}
                        className="flex-1 rounded-lg px-3 py-1 text-sm outline-none"
                        style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#e8dece' }}
                      />
                      <button type="submit" className="text-xs px-3 py-1.5 rounded" style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>Save</button>
                      <button type="button" onClick={() => setRenaming(null)} className="text-xs" style={{ color: '#8892aa' }}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <h2 className="font-black uppercase text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                        {folder}
                      </h2>
                      <span className="text-xs ml-1" style={{ color: '#8892aa' }}>({players.length})</span>
                      <button onClick={() => setRenaming({ from: folder, to: folder })}
                        className="ml-auto text-xs" style={{ color: '#8892aa' }}>
                        Rename
                      </button>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  {players.map(s => {
                    const p = s.player
                    const statusCfg = p?.status ? STATUS_CONFIG[p.status] : null
                    const initials = p?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
                    const available = isAvailable(p?.status ?? null)
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                        style={{ backgroundColor: '#13172a', border: `1px solid ${available ? '#60a5fa30' : '#1e2235'}` }}>
                        <Link href={`/dashboard/player/players/${s.player_id}`}
                          className="flex items-center gap-3 flex-1 min-w-0"
                          style={{ textDecoration: 'none' }}>
                          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: '#1a1f3a' }}>
                            {p?.avatar_url
                              ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover object-top" />
                              : <span className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>{initials}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{p?.full_name ?? 'Player'}</p>
                              {available && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#60a5fa' }} />}
                            </div>
                            <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
                              {p?.position ?? '—'} · {p?.playing_level ?? p?.club ?? p?.city ?? '—'}
                            </p>
                            {statusCfg && (
                              <span className="text-xs" style={{ color: statusCfg.color }}>{statusCfg.label}</span>
                            )}
                          </div>
                        </Link>
                        <button onClick={() => removePlayer(s.id)} disabled={removing === s.id}
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full"
                          style={{ color: removing === s.id ? '#1e2235' : '#8892aa' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <Link href="/dashboard/player/players"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-sm font-bold uppercase"
            style={{ border: '1px dashed #1e2235', color: '#8892aa', textDecoration: 'none' }}>
            + Browse more players
          </Link>
        </div>
      )}
    </div>
  )
}

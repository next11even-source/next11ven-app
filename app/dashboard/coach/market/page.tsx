'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { getLevelConfig } from '@/lib/opportunityLevel'
import { Suspense } from 'react'
import { POSITIONS } from '@/lib/positions'
import { LEVELS } from '@/lib/levels'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'messages' | 'opportunities' | 'shortlists' | 'activity' | 'players'

type Conversation = {
  id: string
  player_id: string
  last_message_at: string
  initiated_by: string | null
  player: { full_name: string | null; avatar_url: string | null; position: string | null; club: string | null; status: string | null } | null
  last_message?: string
  unread?: number
}

type Message = {
  id: string
  sender_id: string
  content: string
  created_at: string
  read_at: string | null
}

type Opportunity = {
  id: string
  title: string
  club: string | null
  location: string | null
  position: string | null
  level: string | null
  urgent: boolean
  deadline: string | null
  is_active: boolean
  created_at: string
  application_count: number
}

type SavedPlayer = {
  id: string
  player_id: string
  folder_name: string
  player: { id: string; full_name: string | null; avatar_url: string | null; position: string | null; club: string | null; status: string | null; playing_level: string | null } | null
}

type Application = {
  id: string
  created_at: string
  status: string
  message: string | null
  opportunity: { id: string; title: string; club: string | null; level: string | null } | null
  player: { id: string; full_name: string | null; avatar_url: string | null; position: string | null; club: string | null } | null
}

type ShortlistAlert = {
  id: string
  created_at: string
  is_read: boolean
  old_status: string | null
  new_status: string | null
  player: { id: string; full_name: string | null; avatar_url: string | null; position: string | null; club: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function Avatar({ name, url, size = 40, color = '#2d5fc4' }: { name: string | null; url: string | null; size?: number; color?: string }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  if (url) return <img src={url} alt={name ?? ''} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs"
      style={{ width: size, height: size, backgroundColor: '#1e2235', color }}>
      {initials}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
    </div>
  )
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({ conversation, coachId, onBack }: { conversation: Conversation; coachId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const p = conversation.player

  useEffect(() => {
    loadMessages()
    const supabase = createClient()
    supabase.from('messages').update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id).neq('sender_id', coachId).is('read_at', null).then(() => {})
  }, [conversation.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadMessages() {
    const supabase = createClient()
    const { data } = await supabase.from('messages')
      .select('id, sender_id, content, created_at, read_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
    setMessages((data as Message[]) ?? [])
    setLoading(false)
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: conversation.player_id, content: text }),
      })
      const data = await res.json()
      if (data.message) setMessages(prev => [...prev, data.message as Message])
    } catch { /* silent */ }
    setSending(false)
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <button onClick={onBack} style={{ color: '#8892aa' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <Avatar name={p?.full_name ?? null} url={p?.avatar_url ?? null} size={36} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{p?.full_name ?? 'Player'}</p>
          <p className="text-xs truncate" style={{ color: '#8892aa' }}>{p?.position ?? '—'}{p?.club ? ` · ${p.club}` : ''}</p>
        </div>
        <Link href={`/dashboard/player/players/${conversation.player_id}`}
          className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#8892aa', textDecoration: 'none' }}>
          Profile
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? <LoadingSpinner /> : messages.length === 0 ? (
          <p className="text-center text-sm py-10" style={{ color: '#8892aa' }}>Start the conversation below.</p>
        ) : messages.map(msg => {
          const isMe = msg.sender_id === coachId
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-xs">
                <div className="px-4 py-2.5 rounded-2xl text-sm"
                  style={{
                    backgroundColor: isMe ? '#2d5fc4' : '#13172a',
                    color: '#e8dece',
                    borderBottomRightRadius: isMe ? 4 : undefined,
                    borderBottomLeftRadius: !isMe ? 4 : undefined,
                    border: isMe ? 'none' : '1px solid #1e2235',
                  }}>
                  {msg.content}
                </div>
                <p className={`text-xs mt-1 ${isMe ? 'text-right' : ''}`} style={{ color: '#8892aa' }}>
                  {timeAgo(msg.created_at)}{isMe && msg.read_at && ' · Read'}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex items-end gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #1e2235', backgroundColor: 'rgba(10,10,10,0.97)' }}>
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as unknown as React.FormEvent) } }}
          placeholder="Type a message…" rows={1}
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none resize-none"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece', maxHeight: 120 }} />
        <button type="submit" disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ backgroundColor: input.trim() ? '#2d5fc4' : '#1e2235' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  )
}

// ─── Messages Tab ─────────────────────────────────────────────────────────────

function MessagesTab({ coachId }: { coachId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [activeTab, setActiveTab] = useState<'messages' | 'requests'>('messages')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('conversations')
      .select('id, player_id, last_message_at, initiated_by')
      .eq('coach_id', coachId)
      .order('last_message_at', { ascending: false })

    if (!data?.length) { setLoading(false); return }

    const playerIds = data.map(c => c.player_id)
    const { data: players } = await supabase.from('profiles')
      .select('id, full_name, avatar_url, position, club, status').in('id', playerIds)
    const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))

    const convIds = data.map(c => c.id)
    const { data: lastMsgs } = await supabase.from('messages')
      .select('conversation_id, content, created_at').in('conversation_id', convIds).order('created_at', { ascending: false })
    const lastMsgMap: Record<string, string> = {}
    for (const msg of (lastMsgs ?? [])) {
      if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg.content
    }

    const { data: unreadData } = await supabase.from('messages').select('conversation_id')
      .in('conversation_id', convIds).neq('sender_id', coachId).is('read_at', null)
    const unreadMap: Record<string, number> = {}
    for (const msg of (unreadData ?? [])) {
      unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] ?? 0) + 1
    }

    setConversations(data.map(c => ({
      ...c, player: playerMap[c.player_id] ?? null,
      last_message: lastMsgMap[c.id], unread: unreadMap[c.id] ?? 0,
    })))
    setLoading(false)
  }

  if (selected) return <ChatView conversation={selected} coachId={coachId} onBack={() => { setSelected(null); load() }} />

  const myMessages = conversations.filter(c => c.initiated_by !== c.player_id)
  const requests = conversations.filter(c => c.initiated_by === c.player_id)
  const requestsUnread = requests.reduce((sum, c) => sum + (c.unread ?? 0), 0)
  const displayed = activeTab === 'messages' ? myMessages : requests

  return (
    <div className="space-y-3 px-4 py-4">
      {/* Sub-tabs */}
      <div className="flex gap-1">
        {(['messages', 'requests'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{
              backgroundColor: activeTab === t ? '#2d5fc4' : 'transparent',
              color: activeTab === t ? '#fff' : '#8892aa',
              border: activeTab === t ? 'none' : '1px solid #1e2235',
            }}>
            {t === 'messages' ? 'Messages' : 'Requests'}
            {t === 'requests' && requestsUnread > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: '#e8dece', color: '#0a0a0a', fontSize: 10 }}>
                {requestsUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : displayed.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>
            {activeTab === 'messages' ? 'No messages sent yet. Find a player and start a conversation.' : 'No player requests yet.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
          {displayed.map((conv, i) => (
            <button key={conv.id} onClick={() => setSelected(conv)}
              className="flex items-center gap-3 w-full px-4 py-4 text-left transition-colors"
              style={{ backgroundColor: '#13172a', borderBottom: i < displayed.length - 1 ? '1px solid #1e2235' : undefined }}>
              <div className="relative">
                <Avatar name={conv.player?.full_name ?? null} url={conv.player?.avatar_url ?? null} size={44} />
                {(conv.unread ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: '#f87171', color: '#fff', fontSize: 9 }}>
                    {conv.unread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{conv.player?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs flex-shrink-0 ml-2" style={{ color: '#8892aa' }}>{timeAgo(conv.last_message_at)}</p>
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
                  {conv.player?.position ?? '—'}{conv.player?.club ? ` · ${conv.player.club}` : ''}
                </p>
                {conv.last_message && (
                  <p className="text-xs truncate mt-0.5" style={{ color: (conv.unread ?? 0) > 0 ? '#e8dece' : '#8892aa' }}>
                    {conv.last_message}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Opportunities Tab ────────────────────────────────────────────────────────

function OpportunitiesTab({ coachId }: { coachId: string }) {
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('opportunities')
      .select('id, title, club, location, position, level, urgent, deadline, is_active, created_at')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        if (!data?.length) { setLoading(false); return }
        const withCounts = await Promise.all(data.map(async o => {
          const { count } = await supabase.from('applications')
            .select('*', { count: 'exact', head: true }).eq('opportunity_id', o.id)
          return { ...o, application_count: count ?? 0 }
        }))
        setOpps(withCounts as Opportunity[])
        setLoading(false)
      })
  }, [coachId])

  const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
          {opps.length} role{opps.length !== 1 ? 's' : ''} posted
        </p>
        <Link href="/dashboard/coach/opportunities"
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
          + Post Role
        </Link>
      </div>

      {loading ? <LoadingSpinner /> : opps.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>No opportunities posted yet.</p>
          <Link href="/dashboard/coach/opportunities"
            className="inline-block mt-3 text-xs px-4 py-2 rounded-full font-semibold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
            Post your first role
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {opps.map(opp => {
            const lvl = getLevelConfig(opp.level)
            const dl = opp.deadline ? daysLeft(opp.deadline) : null
            return (
              <Link key={opp.id} href="/dashboard/coach/opportunities"
                className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none', display: 'flex' }}>
                {/* Level badge */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl"
                  style={{ width: 44, height: 44, backgroundColor: lvl.bg, border: `1px solid ${lvl.color}40` }}>
                  <span className="font-black uppercase leading-none" style={{ color: lvl.color, fontSize: 9 }}>{lvl.line1}</span>
                  <span className="font-black uppercase leading-none mt-0.5" style={{ color: lvl.color, fontSize: lvl.line2.length <= 2 ? 14 : 9 }}>{lvl.line2}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{opp.title}</p>
                    {opp.urgent && <span className="text-xs" style={{ color: '#ef4444' }}>Urgent</span>}
                    {!opp.is_active && <span className="text-xs" style={{ color: '#8892aa' }}>Closed</span>}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                    {opp.position ?? 'Any position'}{opp.location ? ` · ${opp.location}` : ''}
                  </p>
                  {dl !== null && (
                    <p className="text-xs mt-0.5" style={{ color: dl <= 3 ? '#ef4444' : '#8892aa' }}>
                      {dl <= 0 ? 'Deadline passed' : `${dl}d left`}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: opp.application_count > 0 ? '#2d5fc4' : '#8892aa' }}>
                    {opp.application_count}
                  </p>
                  <p className="text-xs" style={{ color: '#8892aa' }}>applied</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Shortlists Tab ───────────────────────────────────────────────────────────

function ShortlistsTab({ coachId }: { coachId: string }) {
  const [saved, setSaved] = useState<SavedPlayer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('coach_saved_players')
      .select('id, player_id, folder_name, created_at, player:player_id(id, full_name, avatar_url, position, club, status, playing_level)')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSaved((data as unknown as SavedPlayer[]) ?? [])
        setLoading(false)
      })
  }, [coachId])

  const folders = [...new Set(saved.map(s => s.folder_name))]

  const STATUS_LABEL: Record<string, string> = {
    free_agent: 'Free Agent', signed: 'Signed', loan_dual_reg: 'Loan / Dual Reg', just_exploring: 'Just Exploring',
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
          {saved.length} player{saved.length !== 1 ? 's' : ''} saved
        </p>
        <Link href="/dashboard/coach/shortlists"
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ border: '1px solid #1e2235', color: '#8892aa', textDecoration: 'none' }}>
          Manage
        </Link>
      </div>

      {loading ? <LoadingSpinner /> : saved.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>No players saved yet. Browse players and save them to folders.</p>
          <Link href="/dashboard/coach/market?tab=players"
            className="inline-block mt-3 text-xs px-4 py-2 rounded-full font-semibold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
            Browse players
          </Link>
        </div>
      ) : (
        folders.map(folder => {
          const players = saved.filter(s => s.folder_name === folder)
          return (
            <div key={folder}>
              <p className="text-xs uppercase tracking-wider font-bold mb-2 px-1"
                style={{ color: '#8892aa' }}>
                {folder} <span style={{ color: '#3a4060' }}>· {players.length}</span>
              </p>
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
                {players.map((s, i) => (
                  <Link key={s.id} href={`/dashboard/player/players/${s.player_id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors"
                    style={{ backgroundColor: '#13172a', borderBottom: i < players.length - 1 ? '1px solid #1e2235' : undefined, textDecoration: 'none', display: 'flex' }}>
                    <Avatar name={s.player?.full_name ?? null} url={s.player?.avatar_url ?? null} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{s.player?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                        {s.player?.position ?? '—'}{s.player?.club ? ` · ${s.player.club}` : ''}
                      </p>
                    </div>
                    {s.player?.status && (
                      <span className="text-xs flex-shrink-0" style={{ color: '#60a5fa' }}>
                        {STATUS_LABEL[s.player.status] ?? s.player.status}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Players Tab ─────────────────────────────────────────────────────────────

type BrowsePlayer = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  secondary_position: string | null
  club: string | null
  city: string | null
  playing_level: string | null
  status: string | null
  premium: boolean
}

const STATUSES = [
  { value: 'free_agent',    label: 'Free Agent' },
  { value: 'signed',        label: 'Signed' },
  { value: 'loan_dual_reg', label: 'Loan / Dual Reg' },
  { value: 'just_exploring',label: 'Just Exploring' },
]

const STATUS_COLOR: Record<string, string> = {
  free_agent: '#60a5fa', signed: '#8892aa', loan_dual_reg: '#a78bfa', just_exploring: '#f59e0b',
}

function PlayersTab() {
  const [players, setPlayers] = useState<BrowsePlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [clubFilter, setClubFilter] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles')
      .select('id, full_name, avatar_url, position, secondary_position, club, city, playing_level, status, premium')
      .in('role', ['player', 'admin'])
      .eq('approved', true)
      .not('avatar_url', 'is', null)
      .neq('avatar_url', '')
      .order('premium', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPlayers((data as BrowsePlayer[]) ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = players.filter(p => {
    if (search && !p.full_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (posFilter && p.position !== posFilter && p.secondary_position !== posFilter) return false
    if (levelFilter && !p.playing_level?.toLowerCase().includes(levelFilter.toLowerCase())) return false
    if (statusFilter && p.status !== statusFilter) return false
    if (clubFilter && !p.club?.toLowerCase().includes(clubFilter.toLowerCase())) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const hasFilters = search || posFilter || levelFilter || statusFilter || clubFilter

  function clearFilters() {
    setSearch(''); setPosFilter(''); setLevelFilter(''); setStatusFilter(''); setClubFilter(''); setPage(0)
  }

  function handleFilterChange(setter: (v: string) => void, value: string) {
    setter(value); setPage(0)
  }

  const iStyle = { backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' as const }

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Search */}
      <input
        value={search}
        onChange={e => handleFilterChange(setSearch, e.target.value)}
        placeholder="Search by name…"
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
        style={iStyle}
        onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
        onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
      />

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        <select value={posFilter} onChange={e => handleFilterChange(setPosFilter, e.target.value)}
          className="rounded-xl px-3 py-2 text-xs outline-none appearance-none" style={iStyle}>
          <option value="">All positions</option>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={levelFilter} onChange={e => handleFilterChange(setLevelFilter, e.target.value)}
          className="rounded-xl px-3 py-2 text-xs outline-none appearance-none" style={iStyle}>
          <option value="">All levels</option>
          {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={e => handleFilterChange(setStatusFilter, e.target.value)}
          className="rounded-xl px-3 py-2 text-xs outline-none appearance-none" style={iStyle}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input
          value={clubFilter}
          onChange={e => handleFilterChange(setClubFilter, e.target.value)}
          placeholder="Filter by club…"
          className="rounded-xl px-3 py-2 text-xs outline-none"
          style={iStyle}
          onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
          onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
        />
      </div>

      {/* Results header */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs" style={{ color: '#8892aa' }}>
          {loading ? 'Loading…' : `${filtered.length} player${filtered.length !== 1 ? 's' : ''} found`}
        </p>
        {hasFilters && (
          <button onClick={clearFilters}
            className="text-xs uppercase tracking-wider"
            style={{ color: '#2d5fc4' }}>
            Clear filters
          </button>
        )}
      </div>

      {loading ? <LoadingSpinner /> : paginated.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>No players match your filters.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {paginated.map((p, i) => (
              <a key={p.id} href={`/dashboard/player/players/${p.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ backgroundColor: '#13172a', borderBottom: i < paginated.length - 1 ? '1px solid #1e2235' : undefined, textDecoration: 'none', display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0f1428')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#13172a')}>
                <div className="relative flex-shrink-0">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt={p.full_name ?? ''} className="rounded-full object-cover" style={{ width: 44, height: 44 }} />
                    : <div className="rounded-full flex items-center justify-center font-bold text-xs" style={{ width: 44, height: 44, backgroundColor: '#1e2235', color: '#8892aa' }}>
                        {p.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                      </div>
                  }
                  {p.premium && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-xs font-black"
                      style={{ backgroundColor: '#2d5fc4', color: '#fff', fontSize: 8 }}>P</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? 'Unknown'}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
                    {[p.position, p.club, p.city].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {p.playing_level && (
                    <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{p.playing_level}</p>
                  )}
                </div>
                {p.status && (
                  <span className="text-xs flex-shrink-0 font-medium"
                    style={{ color: STATUS_COLOR[p.status] ?? '#8892aa' }}>
                    {STATUSES.find(s => s.value === p.status)?.label ?? p.status}
                  </span>
                )}
              </a>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs" style={{ color: '#8892aa' }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ border: '1px solid #1e2235', color: '#e8dece', backgroundColor: '#13172a' }}>
                  ← Prev
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ border: '1px solid #1e2235', color: '#e8dece', backgroundColor: '#13172a' }}>
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Status label helper ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  free_agent:    'Free Agent',
  signed:        'Signed',
  loan_dual_reg: 'Loan / Dual Reg',
  just_exploring: 'Just Exploring',
}

function statusLabel(s: string | null) {
  if (!s) return 'Unknown'
  return STATUS_LABEL[s] ?? s
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab({ coachId, onAlertsRead }: { coachId: string; onAlertsRead: () => void }) {
  const [applications, setApplications] = useState<Application[]>([])
  const [alerts, setAlerts] = useState<ShortlistAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from('applications')
        .select('id, created_at, status, message, opportunity:opportunity_id(id, title, club, level), player:player_id(id, full_name, avatar_url, position, club)')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('shortlist_alerts')
        .select('id, created_at, is_read, old_status, new_status, player:player_id(id, full_name, avatar_url, position, club)')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]).then(([appsRes, alertsRes]) => {
      setApplications((appsRes.data as unknown as Application[]) ?? [])
      setAlerts((alertsRes.data as unknown as ShortlistAlert[]) ?? [])
      setLoading(false)

      // Mark all unread alerts as read
      const unreadIds = (alertsRes.data ?? [])
        .filter((a: { is_read: boolean }) => !a.is_read)
        .map((a: { id: string }) => a.id)
      if (unreadIds.length > 0) {
        supabase.from('shortlist_alerts')
          .update({ is_read: true })
          .in('id', unreadIds)
          .then(() => onAlertsRead())
      }
    })
  }, [coachId])

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const thisWeek = applications.filter(a => a.created_at > weekAgo)
  const alertsThisWeek = alerts.filter(a => a.created_at > weekAgo)

  const STATUS_CFG: Record<string, { label: string; color: string }> = {
    pending:     { label: 'Pending',        color: '#f59e0b' },
    viewed:      { label: 'Viewed',         color: '#60a5fa' },
    shortlisted: { label: 'Shortlisted',    color: '#a78bfa' },
    rejected:    { label: 'Not Progressed', color: '#8892aa' },
  }

  return (
    <div className="space-y-5 px-4 py-4">

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Applications', sub: 'this week', value: thisWeek.length, highlight: thisWeek.length > 0 },
          { label: 'Total apps', sub: 'all time', value: applications.length, highlight: false },
          { label: 'Status alerts', sub: 'this week', value: alertsThisWeek.length, highlight: alertsThisWeek.length > 0 },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl px-3 py-3 text-center"
            style={{ backgroundColor: '#13172a', border: `1px solid ${stat.highlight ? 'rgba(45,95,196,0.4)' : '#1e2235'}` }}>
            <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: stat.highlight ? '#2d5fc4' : '#e8dece' }}>
              {stat.value}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider leading-tight mt-0.5" style={{ color: '#e8dece' }}>{stat.label}</p>
            <p className="text-xs leading-tight" style={{ color: '#8892aa' }}>{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Shortlist status alerts */}
      <div>
        <h3 className="text-base font-black uppercase mb-3 px-1"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Shortlist Alerts
        </h3>

        {loading ? <LoadingSpinner /> : alerts.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>No status changes yet. Alerts appear here when shortlisted players update their availability.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {alerts.map((alert, i) => (
              <Link key={alert.id} href={`/dashboard/player/players/${alert.player?.id}`}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ backgroundColor: alert.is_read ? '#13172a' : '#0f1428', borderBottom: i < alerts.length - 1 ? '1px solid #1e2235' : undefined, textDecoration: 'none', display: 'flex' }}>
                <div className="relative flex-shrink-0">
                  <Avatar name={alert.player?.full_name ?? null} url={alert.player?.avatar_url ?? null} size={42} />
                  {!alert.is_read && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: '#f59e0b', border: '1.5px solid #0a0a0a' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                    {alert.player?.full_name ?? 'Unknown player'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                    {alert.player?.position ?? '—'}{alert.player?.club ? ` · ${alert.player.club}` : ''}
                  </p>
                  <p className="text-xs mt-0.5">
                    <span style={{ color: '#8892aa' }}>{statusLabel(alert.old_status)}</span>
                    <span style={{ color: '#8892aa' }}> → </span>
                    <span style={{ color: alert.new_status === 'free_agent' ? '#60a5fa' : '#e8dece', fontWeight: 600 }}>
                      {statusLabel(alert.new_status)}
                    </span>
                  </p>
                </div>
                <p className="text-xs flex-shrink-0" style={{ color: '#8892aa' }}>{timeAgo(alert.created_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Applications */}
      <div>
        <h3 className="text-base font-black uppercase mb-3 px-1"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Recent Applications
        </h3>

        {loading ? null : applications.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>No applications received yet. Post a role to start receiving them.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {applications.map((app, i) => {
              const statusCfg = STATUS_CFG[app.status] ?? { label: app.status, color: '#8892aa' }
              return (
                <Link key={app.id} href={`/dashboard/player/players/${app.player?.id}`}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ backgroundColor: '#13172a', borderBottom: i < applications.length - 1 ? '1px solid #1e2235' : undefined, textDecoration: 'none', display: 'flex' }}>
                  <Avatar name={app.player?.full_name ?? null} url={app.player?.avatar_url ?? null} size={42} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                      {app.player?.full_name ?? 'Unknown player'}
                    </p>
                    <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                      {app.opportunity?.title ?? 'Unknown role'}{app.opportunity?.club ? ` · ${app.opportunity.club}` : ''}
                    </p>
                    {app.message && (
                      <p className="text-xs truncate mt-0.5 italic" style={{ color: '#8892aa' }}>"{app.message}"</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-xs" style={{ color: statusCfg.color }}>{statusCfg.label}</p>
                    <p className="text-xs" style={{ color: '#8892aa' }}>{timeAgo(app.created_at)}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const BANNERS: Record<Tab, { subtitle: string; color: string }> = {
  messages:      { subtitle: 'MESSAGES',     color: '#60a5fa' },
  opportunities: { subtitle: 'OPPORTUNITIES', color: '#f59e0b' },
  shortlists:    { subtitle: 'SHORTLISTS',   color: '#a78bfa' },
  activity:      { subtitle: 'ACTIVITY',     color: '#2d5fc4' },
  players:       { subtitle: 'PLAYERS',      color: '#e8dece' },
}

function CoachMarketContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const activeTab = (searchParams.get('tab') as Tab) ?? 'messages'

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setCoachId(user.id)
      const { data: convs } = await supabase.from('conversations').select('id').eq('coach_id', user.id)
      if (convs?.length) {
        const { count } = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convs.map(c => c.id))
          .neq('sender_id', user.id)
          .is('read_at', null)
        setUnreadMessages(count ?? 0)
      }
      const { count: alertCount } = await supabase.from('shortlist_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', user.id)
        .eq('is_read', false)
      setUnreadAlerts(alertCount ?? 0)
    })
  }, [])

  function setTab(tab: Tab) {
    if (tab === 'messages') setUnreadMessages(0)
    if (tab === 'activity') setUnreadAlerts(0)
    router.replace(`/dashboard/coach/market?tab=${tab}`)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'messages',      label: 'Messages' },
    { key: 'opportunities', label: 'Opportunities' },
    { key: 'shortlists',    label: 'Shortlists' },
    { key: 'activity',      label: 'Activity' },
    { key: 'players',       label: 'Players' },
  ]

  const banner = BANNERS[activeTab]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Tab strip */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-0"
        style={{ backgroundColor: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex gap-1 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
          {tabs.map(t => {
            const hasUnread = t.key === 'messages' && unreadMessages > 0 && activeTab !== 'messages'
            const hasAlerts = t.key === 'activity' && unreadAlerts > 0 && activeTab !== 'activity'
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all"
                style={{
                  backgroundColor: activeTab === t.key ? '#13172a' : 'transparent',
                  color: activeTab === t.key ? '#e8dece' : '#8892aa',
                  border: activeTab === t.key ? '1px solid #2d5fc4' : '1px solid transparent',
                }}>
                {t.label}
                {hasUnread && (
                  <span className="flex items-center justify-center rounded-full text-xs font-bold"
                    style={{ minWidth: 18, height: 18, backgroundColor: '#f87171', color: '#fff', fontSize: 10, padding: '0 4px' }}>
                    {unreadMessages}
                  </span>
                )}
                {hasAlerts && (
                  <span className="flex items-center justify-center rounded-full text-xs font-bold"
                    style={{ minWidth: 18, height: 18, backgroundColor: '#f59e0b', color: '#fff', fontSize: 10, padding: '0 4px' }}>
                    {unreadAlerts}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Banner */}
      <div className="mx-4 mt-4 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 flex items-end justify-between"
          style={{ background: 'linear-gradient(135deg, #0d1020 0%, #13172a 60%, #1a1f3a 100%)', minHeight: 90 }}>
          <div>
            <p className="text-xs uppercase tracking-widest font-bold" style={{ color: '#8892aa' }}>THE MARKET</p>
            <p className="text-3xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: banner.color }}>
              {banner.subtitle}
            </p>
          </div>
          <div className="w-16 h-16 rounded-full opacity-10" style={{ backgroundColor: banner.color, filter: 'blur(20px)' }} />
        </div>
      </div>

      {/* Tab content */}
      {coachId ? (
        <>
          {activeTab === 'messages'      && <MessagesTab coachId={coachId} />}
          {activeTab === 'opportunities' && <OpportunitiesTab coachId={coachId} />}
          {activeTab === 'shortlists'    && <ShortlistsTab coachId={coachId} />}
          {activeTab === 'activity'      && <ActivityTab coachId={coachId} onAlertsRead={() => setUnreadAlerts(0)} />}
          {activeTab === 'players'       && <PlayersTab />}
        </>
      ) : (
        <LoadingSpinner />
      )}
    </div>
  )
}

export default function CoachMarketPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    }>
      <CoachMarketContent />
    </Suspense>
  )
}

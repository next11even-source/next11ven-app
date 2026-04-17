'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Conversation = {
  id: string
  coach_id: string
  last_message_at: string
  initiated_by: string | null
  coach: {
    full_name: string | null
    avatar_url: string | null
    coaching_role: string | null
    club: string | null
  } | null
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

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({
  conversation,
  playerId,
  onBack,
}: {
  conversation: Conversation
  playerId: string
  onBack: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const c = conversation.coach

  useEffect(() => {
    loadMessages()
    // Mark incoming messages as read
    const supabase = createClient()
    supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id)
      .neq('sender_id', playerId)
      .is('read_at', null)
      .then(() => {})
  }, [conversation.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
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
        body: JSON.stringify({ coach_id: conversation.coach_id, content: text }),
      })
      const data = await res.json()
      if (data.message) {
        setMessages(prev => [...prev, data.message as Message])
      }
    } catch {
      // silently fail
    }
    setSending(false)
  }

  const initials = c?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div className="flex flex-col" style={{ height: '100dvh', backgroundColor: '#0a0a0a' }}>
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <button onClick={onBack} style={{ color: '#8892aa' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: '#1a1f3a' }}>
          {c?.avatar_url
            ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-xs font-black" style={{ color: '#2d5fc4' }}>{initials}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{c?.full_name ?? 'Coach'}</p>
          <p className="text-xs truncate" style={{ color: '#8892aa' }}>
            {c?.coaching_role ?? 'Coach'}{c?.club ? ` · ${c.club}` : ''}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ paddingBottom: '80px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: '#8892aa' }}>No messages yet.</p>
            <p className="text-xs mt-1" style={{ color: '#8892aa' }}>Start the conversation below.</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === playerId
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-xs lg:max-w-sm">
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
                    {timeAgo(msg.created_at)}
                    {isMe && msg.read_at && <span className="ml-1">· Read</span>}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage}
        className="flex items-end gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #1e2235', backgroundColor: 'rgba(10,10,10,0.97)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as unknown as React.FormEvent) } }}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none resize-none"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece', maxHeight: 120 }}
        />
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

// ─── Messages List ────────────────────────────────────────────────────────────

function MessagesInner() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [playerId, setPlayerId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setPlayerId(user.id)

    const { data } = await supabase
      .from('conversations')
      .select('id, coach_id, last_message_at, initiated_by')
      .eq('player_id', user.id)
      .order('last_message_at', { ascending: false })

    if (!data || data.length === 0) { setLoading(false); return }

    // Fetch coach profiles
    const coachIds = data.map((c: { coach_id: string }) => c.coach_id)
    const { data: coaches } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, coaching_role, club')
      .in('id', coachIds)
    const coachMap = Object.fromEntries(
      (coaches ?? []).map((c: { id: string; full_name: string | null; avatar_url: string | null; coaching_role: string | null; club: string | null }) => [c.id, c])
    )

    // Get last message per conversation
    const convIds = data.map((c: { id: string }) => c.id)
    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })

    const lastMsgMap: Record<string, string> = {}
    for (const msg of (lastMsgs ?? [])) {
      if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg.content
    }

    // Count unread (messages from coach that player hasn't read)
    const { data: unreadData } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .neq('sender_id', user.id)
      .is('read_at', null)

    const unreadMap: Record<string, number> = {}
    for (const msg of (unreadData ?? [])) {
      unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] ?? 0) + 1
    }

    const convs: Conversation[] = data.map((c: { id: string; coach_id: string; last_message_at: string; initiated_by: string | null }) => ({
      ...c,
      coach: coachMap[c.coach_id] ?? null,
      last_message: lastMsgMap[c.id],
      unread: unreadMap[c.id] ?? 0,
    }))
    setConversations(convs)
    setLoading(false)
  }

  if (selected) {
    return (
      <ChatView
        conversation={selected}
        playerId={playerId}
        onBack={() => {
          setSelected(null)
          load()
        }}
      />
    )
  }

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-center gap-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <h1 className="font-black uppercase tracking-wide text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Messages
        </h1>
        {totalUnread > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
            {totalUnread}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center space-y-3">
          <p className="font-black uppercase text-xl" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            No messages yet
          </p>
          <p className="text-sm" style={{ color: '#8892aa' }}>
            When a coach messages you, it will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: '#1e2235' }}>
          {conversations.map(conv => {
            const c = conv.coach
            const initials = c?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
            const hasUnread = (conv.unread ?? 0) > 0
            return (
              <button key={conv.id} onClick={() => setSelected(conv)}
                className="flex items-center gap-3 w-full px-4 py-4 text-left transition-colors"
                style={{ backgroundColor: '#0a0a0a' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0d1020')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0a0a0a')}>
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: '#1a1f3a' }}>
                    {c?.avatar_url
                      ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="font-black" style={{ color: '#2d5fc4' }}>{initials}</span>}
                  </div>
                  {hasUnread && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: '#2d5fc4', color: '#fff', fontSize: 10 }}>
                      {conv.unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{c?.full_name ?? 'Coach'}</p>
                    <p className="text-xs flex-shrink-0 ml-2" style={{ color: '#8892aa' }}>{timeAgo(conv.last_message_at)}</p>
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
                    {c?.coaching_role ?? 'Coach'}{c?.club ? ` · ${c.club}` : ''}
                  </p>
                  {conv.last_message && (
                    <p className="text-xs truncate mt-0.5"
                      style={{ color: hasUnread ? '#e8dece' : '#8892aa', fontWeight: hasUnread ? 600 : 400 }}>
                      {conv.last_message}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PlayerMessagesPage() {
  return (
    <Suspense>
      <MessagesInner />
    </Suspense>
  )
}

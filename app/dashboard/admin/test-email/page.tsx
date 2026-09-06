'use client'

import { useState } from 'react'
import Breadcrumb from '@/app/components/Breadcrumb'

type TemplateId =
  | 'coach_activation_d7'
  | 'coach_activation_d21'
  | 'coach_gone_quiet_d1'
  | 'coach_gone_quiet_d14'
  | 'winback'
  | 'application_nudge'
  | 'weekly_digest'
  | 'broadcast'
  | 'player_onboarding_d0'
  | 'player_onboarding_d1'
  | 'player_onboarding_d3'
  | 'player_onboarding_d7'
  | 'coach_onboarding_d0'
  | 'coach_onboarding_d2'
  | 'coach_onboarding_d5'
  | 'player_pro_welcome'
  | 'coach_pro_welcome'

type Template = {
  id: TemplateId
  label: string
  description: string
}

type Group = {
  label: string
  templates: Template[]
}

const GROUPS: Group[] = [
  {
    label: 'Coach never posted opportunity flow',
    templates: [
      {
        id: 'coach_activation_d7',
        label: 'Day 7 — region player count',
        description: 'First nudge. Shows approved player count in their region (not the actively_looking toggle — all approved profiles in their area).',
      },
      {
        id: 'coach_activation_d21',
        label: 'Day 21 — social proof',
        description: 'Second and final nudge. Different angle: coaches who posted this week.',
      },
    ],
  },
  {
    label: 'Coach gone quiet flow',
    templates: [
      {
        id: 'coach_gone_quiet_d1',
        label: 'Gone quiet D1 — new players since last post',
        description: 'First nudge. Posted before but silent 28+ days. Shows new players who joined since their last role.',
      },
      {
        id: 'coach_gone_quiet_d14',
        label: 'Gone quiet D14 — social proof',
        description: 'Second and final nudge. Different angle: coaches who posted this week.',
      },
    ],
  },
  {
    label: 'Retention / billing',
    templates: [
      {
        id: 'winback',
        label: 'Win-back (subscription cancelled)',
        description: 'Lapsed Pro player. Position-filtered role count stat block. Marketing template.',
      },
    ],
  },
  {
    label: 'Coach engagement',
    templates: [
      {
        id: 'application_nudge',
        label: 'Application nudge',
        description: 'Coach sitting on unanswered applications. Includes at-risk role warning.',
      },
    ],
  },
  {
    label: 'Player engagement',
    templates: [
      {
        id: 'weekly_digest',
        label: 'Weekly player digest',
        description: 'Thursday email. Representative static content — real version is personalised per player.',
      },
    ],
  },
  {
    label: 'Admin tools',
    templates: [
      {
        id: 'broadcast',
        label: 'Broadcast (marketing template)',
        description: 'Admin-composed email via the Email Composer. Blue hero band, wider card, unsubscribe footer.',
      },
    ],
  },
  {
    label: 'Player onboarding flow',
    templates: [
      {
        id: 'player_onboarding_d0',
        label: 'Day 0 — Welcome (approved)',
        description: 'Fires on admin approval. No personalised stats. Prompts profile completion.',
      },
      {
        id: 'player_onboarding_d1',
        label: 'Day 1 — Profile completion nudge',
        description: 'Highlight video pitch + Actively Looking teaser (Pro feature). Copy branches on profileComplete — test preview shows incomplete path.',
      },
      {
        id: 'player_onboarding_d3',
        label: 'Day 3 — Coaches are here',
        description: 'Shows approved coach count (87 in test). Covers both paths: posting opportunities to apply to AND coaches who message players directly without posting. CTA goes to Open Roles.',
      },
      {
        id: 'player_onboarding_d7',
        label: 'Day 7 — Premium pitch',
        description: 'Open role count stat block (6 Midfielder roles). Upgrade CTA.',
      },
    ],
  },
  {
    label: 'Coach onboarding flow',
    templates: [
      {
        id: 'coach_onboarding_d0',
        label: 'Day 0 — Welcome (approved)',
        description: 'Fires on admin approval. Shows active player count (312 in test). Post opportunity CTA.',
      },
      {
        id: 'coach_onboarding_d2',
        label: 'Day 2 — Regional player count',
        description: 'Regional stat block (28 players in Manchester in test). Prompts first post.',
      },
      {
        id: 'coach_onboarding_d5',
        label: 'Day 5 — Social proof',
        description: 'Blended recruiting activity stat — coaches with an active opportunity OR a message sent in the last 30 days (19 in test). Final nudge before activation flow takes over at D7.',
      },
    ],
  },
  {
    label: 'Premium welcome',
    templates: [
      {
        id: 'player_pro_welcome',
        label: 'Player Pro welcome',
        description: 'Transactional. Fires on first premium activation. No unsubscribe link.',
      },
      {
        id: 'coach_pro_welcome',
        label: 'Coach Pro welcome',
        description: 'Transactional. Fires on first Coach Pro activation. No unsubscribe link.',
      },
    ],
  },
]

// Flat list for label lookup
const ALL_TEMPLATES: Template[] = GROUPS.flatMap(g => g.templates)

const INPUT: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#0d1020',
  border: '1px solid #1e2235',
  borderRadius: '8px',
  padding: '10px 12px',
  color: '#e8dece',
  fontSize: '14px',
  outline: 'none',
}

const GROUP_LABEL: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#8892aa',
  marginBottom: '8px',
  marginTop: '20px',
}

export default function TestEmailPage() {
  const [selected, setSelected] = useState<TemplateId | null>(null)
  const [to, setTo] = useState('jamalcrawford@icloud.com')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent?: boolean; error?: string } | null>(null)

  async function handleSend() {
    if (!selected) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, template: selected }),
      })
      const json = await res.json()
      if (!res.ok) setResult({ error: json.error ?? 'Send failed' })
      else setResult({ sent: true })
    } catch {
      setResult({ error: 'Request failed' })
    } finally {
      setSending(false)
    }
  }

  const selectedLabel = ALL_TEMPLATES.find(t => t.id === selected)?.label ?? null

  return (
    <div className="pb-8">
      <div className="px-4 pt-3 pb-4" style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: 'Home', href: '/dashboard/player' },
          { label: 'Admin Panel', href: '/dashboard/admin' },
          { label: 'Test Emails' },
        ]} />
        <h1 className="text-3xl font-black uppercase mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Test Emails
        </h1>
        <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
          Send a real email using realistic test data. Check how templates render before a live run.
        </p>
      </div>

      <div className="px-4 pt-4">

        {/* Recipient */}
        <div style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', borderRadius: '12px', padding: '20px', marginBottom: '4px' }}>
          <p className="font-bold mb-3 text-sm" style={{ color: '#e8dece' }}>Recipient</p>
          <input
            type="email"
            value={to}
            onChange={e => { setTo(e.target.value); setResult(null) }}
            style={INPUT}
          />
        </div>

        {/* Grouped template picker */}
        {GROUPS.map(group => (
          <div key={group.label}>
            <p style={GROUP_LABEL}>{group.label}</p>
            <div style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', borderRadius: '12px', overflow: 'hidden', marginBottom: '4px' }}>
              {group.templates.map((t, i) => (
                <div
                  key={t.id}
                  onClick={() => { setSelected(t.id); setResult(null) }}
                  style={{
                    padding: '16px 20px',
                    cursor: 'pointer',
                    borderTop: i > 0 ? '1px solid #1e2235' : 'none',
                    backgroundColor: selected === t.id ? '#0d1325' : 'transparent',
                    transition: 'background-color 150ms',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  {/* Selection indicator */}
                  <div style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: selected === t.id ? '4px solid #2d5fc4' : '2px solid #2a3150',
                    flexShrink: 0,
                    transition: 'border 150ms',
                  }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#e8dece', margin: 0 }}>{t.label}</p>
                    <p className="text-xs" style={{ color: '#8892aa', margin: '2px 0 0' }}>{t.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Send button */}
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={handleSend}
            disabled={!selected || sending || !to}
            style={{
              display: 'block',
              width: '100%',
              padding: '13px 24px',
              backgroundColor: '#2d5fc4',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: selected && !sending && to ? 'pointer' : 'not-allowed',
              opacity: selected && !sending && to ? 1 : 0.4,
            }}
          >
            {sending
              ? 'Sending...'
              : selectedLabel
              ? `Send "${selectedLabel}" to ${to}`
              : 'Select a template above'}
          </button>

          {result?.sent && (
            <p className="text-sm mt-3 text-center" style={{ color: '#22c55e' }}>
              Sent — check {to}
            </p>
          )}
          {result?.error && (
            <p className="text-sm mt-3 text-center" style={{ color: '#f59e0b' }}>
              {result.error}
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import Breadcrumb from '@/app/components/Breadcrumb'

type Filter = {
  role: 'all' | 'player' | 'coach'
  tier: 'all' | 'pro' | 'free'
  joined: 'all' | '7d' | '14d' | '30d' | '90d'
  activity: 'all' | 'never_active' | 'active_30d'
}

type PreviewResult = {
  count: number
  recentTouchCount: number
  sample: string[]
}

type SendResult = {
  sent: number
  failed: number
  recipientCount: number
}

const CARD: React.CSSProperties = {
  backgroundColor: '#13172a',
  border: '1px solid #1e2235',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px',
}

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: '#8892aa',
  marginBottom: '6px',
}

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

const SELECT: React.CSSProperties = {
  ...INPUT,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238892aa' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '32px',
  cursor: 'pointer',
}

const BTN_PRIMARY: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '13px 24px',
  backgroundColor: '#2d5fc4',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  fontWeight: 700,
  fontSize: '14px',
  cursor: 'pointer',
  textAlign: 'center' as const,
}

const BTN_SECONDARY: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '12px 24px',
  backgroundColor: 'transparent',
  color: '#4d8ae8',
  border: '1px solid #2a3150',
  borderRadius: '10px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
  textAlign: 'center' as const,
}

export default function BroadcastPage() {
  const [filter, setFilter] = useState<Filter>({
    role: 'all',
    tier: 'all',
    joined: 'all',
    activity: 'all',
  })

  const [subject, setSubject] = useState('')
  const [headline, setHeadline] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')

  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const f = (key: keyof Filter) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFilter(prev => ({ ...prev, [key]: e.target.value }))

  async function handlePreview() {
    setPreviewing(true)
    setPreviewError(null)
    setPreview(null)
    try {
      const params = new URLSearchParams(filter as Record<string, string>)
      const res = await fetch(`/api/admin/broadcast/preview?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Preview failed')
      setPreview(json)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSend() {
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/admin/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          headline: headline || undefined,
          bodyText,
          ctaLabel: ctaLabel || undefined,
          ctaUrl: ctaUrl || undefined,
          filter,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Send failed')
      setResult(json)
      setConfirming(false)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed')
      setConfirming(false)
    } finally {
      setSending(false)
    }
  }

  const canSend = subject.trim().length > 0 && bodyText.trim().length >= 10 && (preview?.count ?? 0) > 0

  if (result) {
    return (
      <div className="pb-4">
        <div className="px-4 pt-3 pb-4" style={{ borderBottom: '1px solid #1e2235' }}>
          <Breadcrumb crumbs={[
            { label: 'Home', href: '/dashboard/player' },
            { label: 'Admin Panel', href: '/dashboard/admin' },
            { label: 'Email Composer' },
          ]} />
          <h1 className="text-3xl font-black uppercase mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Email Composer
          </h1>
        </div>
        <div className="px-4 pt-6">
          <div style={{ ...CARD, borderColor: '#22c55e22', backgroundColor: '#0d1a0d' }}>
            <p className="font-bold text-lg mb-1" style={{ color: '#22c55e' }}>Broadcast sent</p>
            <p className="text-sm mb-3" style={{ color: '#8892aa' }}>
              {result.sent} of {result.recipientCount} emails delivered
              {result.failed > 0 && ` · ${result.failed} failed`}
            </p>
            <p className="text-xs" style={{ color: '#8892aa' }}>
              Subject: <span style={{ color: '#e8dece' }}>{subject}</span>
            </p>
          </div>
          <Link
            href="/dashboard/admin/broadcast"
            onClick={() => { setResult(null); setPreview(null); setSubject(''); setBodyText(''); setHeadline(''); setCtaLabel(''); setCtaUrl('') }}
            style={{ ...BTN_SECONDARY, textDecoration: 'none', display: 'block' }}>
            Send another
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-3 pb-4" style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: 'Home', href: '/dashboard/player' },
          { label: 'Admin Panel', href: '/dashboard/admin' },
          { label: 'Email Composer' },
        ]} />
        <h1 className="text-3xl font-black uppercase mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Email Composer
        </h1>
        <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
          Uses the marketing template. Respects unsubscribe preferences.
        </p>
      </div>

      <div className="px-4 pt-4">

        {/* ── Audience ─────────────────────────────────────────── */}
        <div style={CARD}>
          <p className="font-bold mb-4" style={{ color: '#e8dece', fontSize: '13px' }}>Audience</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label style={LABEL}>Role</label>
              <select style={SELECT} value={filter.role} onChange={f('role')}>
                <option value="all">All roles</option>
                <option value="player">Players only</option>
                <option value="coach">Coaches only</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Tier</label>
              <select style={SELECT} value={filter.tier} onChange={f('tier')}>
                <option value="all">All tiers</option>
                <option value="pro">Pro only</option>
                <option value="free">Free only</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label style={LABEL}>Joined</label>
              <select style={SELECT} value={filter.joined} onChange={f('joined')}>
                <option value="all">Any time</option>
                <option value="7d">Last 7 days</option>
                <option value="14d">Last 14 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Activity</label>
              <select style={SELECT} value={filter.activity} onChange={f('activity')}>
                <option value="all">Any activity</option>
                <option value="never_active">Never active</option>
                <option value="active_30d">Active last 30d</option>
              </select>
            </div>
          </div>

          <button
            onClick={handlePreview}
            disabled={previewing}
            style={{ ...BTN_SECONDARY, width: 'auto', padding: '10px 20px', fontSize: '13px' }}>
            {previewing ? 'Loading...' : 'Preview audience'}
          </button>

          {previewError && (
            <p className="text-xs mt-3" style={{ color: '#f59e0b' }}>{previewError}</p>
          )}

          {preview && (
            <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: '#0d1020', border: '1px solid #1e2235' }}>
              <p className="font-bold text-sm mb-1" style={{ color: '#e8dece' }}>
                {preview.count} recipient{preview.count !== 1 ? 's' : ''}
              </p>
              {preview.recentTouchCount > 0 && (
                <p className="text-xs mb-2" style={{ color: '#f59e0b' }}>
                  {preview.recentTouchCount} of these had an email in the last 24h
                </p>
              )}
              {preview.sample.length > 0 && (
                <p className="text-xs" style={{ color: '#8892aa' }}>
                  Sample: {preview.sample.join(', ')}
                  {preview.count > preview.sample.length && ` +${preview.count - preview.sample.length} more`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Compose ──────────────────────────────────────────── */}
        <div style={CARD}>
          <p className="font-bold mb-4" style={{ color: '#e8dece', fontSize: '13px' }}>Compose</p>

          <div className="mb-3">
            <label style={LABEL}>Subject line <span style={{ color: '#4d8ae8' }}>*</span></label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. New roles posted this week"
              style={INPUT}
              maxLength={200}
            />
          </div>

          <div className="mb-3">
            <label style={LABEL}>Headline <span style={{ color: '#8892aa' }}>(optional)</span></label>
            <input
              type="text"
              value={headline}
              onChange={e => setHeadline(e.target.value)}
              placeholder="Large text shown at the top of the email"
              style={INPUT}
              maxLength={200}
            />
          </div>

          <div className="mb-3">
            <label style={LABEL}>
              Body <span style={{ color: '#4d8ae8' }}>*</span>
              <span style={{ color: '#8892aa', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> — double line break = new paragraph · use {'{{'+'name'+'}}'} to personalise</span>
            </label>
            <textarea
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              placeholder={"Hi {{name}},\n\nSomething exciting is happening on NEXT11VEN...\n\nA second paragraph goes here."}
              rows={8}
              style={{ ...INPUT, resize: 'vertical' as const, lineHeight: '1.6' }}
              maxLength={10000}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>CTA button label <span style={{ color: '#8892aa' }}>(optional)</span></label>
              <input
                type="text"
                value={ctaLabel}
                onChange={e => setCtaLabel(e.target.value)}
                placeholder="e.g. View open roles"
                style={INPUT}
                maxLength={100}
              />
            </div>
            <div>
              <label style={LABEL}>CTA URL <span style={{ color: '#8892aa' }}>(optional)</span></label>
              <input
                type="url"
                value={ctaUrl}
                onChange={e => setCtaUrl(e.target.value)}
                placeholder="https://..."
                style={INPUT}
              />
            </div>
          </div>
        </div>

        {/* ── Send ─────────────────────────────────────────────── */}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!canSend}
            style={{
              ...BTN_PRIMARY,
              opacity: canSend ? 1 : 0.4,
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}>
            {preview
              ? `Send to ${preview.count} recipient${preview.count !== 1 ? 's' : ''}`
              : 'Preview audience first'}
          </button>
        ) : (
          <div style={{ ...CARD, borderColor: '#f59e0b44' }}>
            <p className="font-bold mb-1" style={{ color: '#e8dece' }}>Confirm send</p>
            <p className="text-sm mb-1" style={{ color: '#8892aa' }}>
              Subject: <span style={{ color: '#e8dece' }}>{subject}</span>
            </p>
            <p className="text-sm mb-4" style={{ color: '#8892aa' }}>
              {preview?.count} recipient{preview?.count !== 1 ? 's' : ''}.
              {(preview?.recentTouchCount ?? 0) > 0 && (
                <span style={{ color: '#f59e0b' }}> {preview?.recentTouchCount} had an email in the last 24h.</span>
              )}
            </p>
            {sendError && (
              <p className="text-xs mb-3" style={{ color: '#f59e0b' }}>{sendError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleSend}
                disabled={sending}
                style={{ ...BTN_PRIMARY, flex: 1, opacity: sending ? 0.6 : 1 }}>
                {sending ? 'Sending...' : 'Confirm and send'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={sending}
                style={{ ...BTN_SECONDARY, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type FlowStats = Record<string, Record<string, number>>
type BroadcastMeta = Record<string, { subject: string; created_at: string }>

// Human-readable labels for known flow IDs
const FLOW_LABELS: Record<string, string> = {
  drip_day0:            'Drip D0 — coach messaged (free player)',
  drip_day3:            'Drip D3 — unread reminder',
  drip_day7:            'Drip D7 — final reminder',
  winback:              'Win-back (subscription cancelled)',
  payment_failed:       'Payment failed',
  payment_failed_followup: 'Payment failed — follow-up',
  weekly_digest:        'Weekly digest (players)',
  log_nudge:            'Post-match log nudge',
  application_nudge:    'Coach application nudge',
  coach_recommendations:'Coach recommendations',
  application_decision: 'Application decision',
  shortlist_available:  'Shortlist availability alert',
  broadcast:            'Broadcast',
  '(untagged)':         'Auth system (password reset / magic link)',
  coach_activation_d7:  'Coach activation D7',
  coach_activation_d21: 'Coach activation D21',
  coach_gone_quiet_d1:  'Coach gone quiet D1',
  coach_gone_quiet_d14: 'Coach gone quiet D14',
  message_notification: 'Message notification',
  message_pack_purchase:'Message pack purchase',
  opportunity_auto_closed: 'Opportunity auto-closed',
  application_received: 'Application received (coach)',
  player_onboarding_d0: 'Player onboarding D0',
  player_onboarding_d1: 'Player onboarding D1',
  player_onboarding_d3: 'Player onboarding D3',
  player_onboarding_d7: 'Player onboarding D7',
  coach_onboarding_d0:  'Coach onboarding D0',
  coach_onboarding_d2:  'Coach onboarding D2',
  coach_onboarding_d5:  'Coach onboarding D5',
  player_pro_welcome:   'Player Pro welcome',
  coach_pro_welcome:    'Coach Pro welcome',
}

function rate(numerator: number, denominator: number): string {
  if (denominator === 0) return '—'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function FlowRow({ flowId, events, label }: { flowId: string; events: Record<string, number>; label: string }) {
  const sent = events['email.sent'] ?? 0
  const delivered = events['email.delivered'] ?? 0
  const opened = events['email.opened'] ?? 0
  const clicked = events['email.clicked'] ?? 0
  const bounced = events['email.bounced'] ?? 0
  const complained = events['email.complained'] ?? 0
  // Use total unique emails in the window as denominator — avoids >100% rates when
  // a send's email.sent event falls outside the selected window but opens are inside it.
  const denom = events['total'] || sent || delivered

  return (
    <tr style={{ borderTop: '1px solid #1e2235' }}>
      <td className="px-3 py-3" style={{ color: '#e8dece', fontSize: 13, minWidth: 200 }}>{label}</td>
      <td className="px-3 py-3 text-right" style={{ color: '#8892aa', fontSize: 13 }}>{denom || '—'}</td>
      <td className="px-3 py-3 text-right" style={{ color: '#e8dece', fontSize: 13 }}>{rate(opened, denom)}</td>
      <td className="px-3 py-3 text-right" style={{ color: '#e8dece', fontSize: 13 }}>{rate(clicked, denom)}</td>
      <td className="px-3 py-3 text-right" style={{ color: bounced > 0 ? '#f59e0b' : '#8892aa', fontSize: 13 }}>{rate(bounced, denom)}</td>
      <td className="px-3 py-3 text-right" style={{ color: complained > 0 ? '#ef4444' : '#8892aa', fontSize: 13 }}>{rate(complained, denom)}</td>
    </tr>
  )
}

export default function EmailAnalyticsPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [days, setDays] = useState(30)
  const [flowStats, setFlowStats] = useState<FlowStats | null>(null)
  const [broadcastMeta, setBroadcastMeta] = useState<BroadcastMeta>({})
  const [loading, setLoading] = useState(true)

  // UUID v4 detector
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (me?.role !== 'admin') { router.push('/dashboard/player'); return }
      setAuthChecked(true)
    })()
  }, [router])

  useEffect(() => {
    if (!authChecked) return
    setLoading(true)
    fetch(`/api/admin/email-analytics?days=${days}`)
      .then(r => r.json())
      .then(d => {
        setFlowStats(d.flowStats ?? {})
        setBroadcastMeta(d.broadcastMeta ?? {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [authChecked, days])

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const allFlows = Object.entries(flowStats ?? {}).sort((a, b) => {
    const sentA = a[1]['email.sent'] ?? a[1]['email.delivered'] ?? 0
    const sentB = b[1]['email.sent'] ?? b[1]['email.delivered'] ?? 0
    return sentB - sentA
  })

  const namedFlows = allFlows.filter(([id]) => !UUID_RE.test(id) && !id.startsWith('test_'))
  const testFlows = allFlows.filter(([id]) => id.startsWith('test_'))
  const broadcastFlows = allFlows.filter(([id]) => UUID_RE.test(id))

  return (
    <div className="pb-12" style={{ backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-3 pb-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => window.dispatchEvent(new Event('player:sidebar:open'))}
            className="p-2 rounded-lg"
            style={{ color: '#8892aa' }}
            aria-label="Open menu">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="17" y2="6" /><line x1="3" y1="10" x2="17" y2="10" /><line x1="3" y1="14" x2="17" y2="14" />
            </svg>
          </button>
          <h1 className="text-2xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Email Analytics
          </h1>
        </div>
        {/* Date range selector */}
        <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: days === d ? '#2d5fc4' : 'transparent',
                color: days === d ? '#fff' : '#8892aa',
              }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
          </div>
        ) : flowStats && Object.keys(flowStats).length === 0 ? (
          <div className="rounded-xl px-6 py-10 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p style={{ color: '#8892aa', fontSize: 14 }}>No email events recorded yet.</p>
            <p style={{ color: '#4b5563', fontSize: 12, marginTop: 6 }}>Events appear here once Resend starts delivering webhook payloads to /api/webhooks/resend.</p>
          </div>
        ) : (
          <>
            {/* Named flows */}
            {namedFlows.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#8892aa' }}>
                  Automated Flows
                </h2>
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 580 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1e2235' }}>
                          <th className="px-3 py-2 text-left" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Flow</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sent</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Click</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bounce</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Complaint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {namedFlows.map(([flowId, events]) => (
                          <FlowRow
                            key={flowId}
                            flowId={flowId}
                            events={events}
                            label={FLOW_LABELS[flowId] ?? flowId}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Broadcasts */}
            {broadcastFlows.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#8892aa' }}>
                  Broadcast Sends
                </h2>
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 580 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1e2235' }}>
                          <th className="px-3 py-2 text-left" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subject</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sent</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Click</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bounce</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Complaint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {broadcastFlows.map(([broadcastId, events]) => {
                          const meta = broadcastMeta[broadcastId]
                          const label = meta?.subject ?? `Broadcast ${broadcastId.slice(0, 8)}`
                          return (
                            <FlowRow
                              key={broadcastId}
                              flowId={broadcastId}
                              events={events}
                              label={label}
                            />
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

            {/* Test sends — isolated so they don't contaminate production flow rates */}
            {testFlows.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#8892aa' }}>
                  Test Sends (excluded from production metrics)
                </h2>
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 580 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1e2235' }}>
                          <th className="px-3 py-2 text-left" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Flow</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sent</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Click</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bounce</th>
                          <th className="px-3 py-2 text-right" style={{ color: '#8892aa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Complaint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {testFlows.map(([flowId, events]) => (
                          <FlowRow key={flowId} flowId={flowId} events={events} label={flowId} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

        <p className="text-center" style={{ color: '#4b5563', fontSize: 11 }}>
          Rates are computed from unique emails with any event in the selected window. Open and click tracking must be enabled in Resend for those columns to populate.
        </p>
      </div>
    </div>
  )
}

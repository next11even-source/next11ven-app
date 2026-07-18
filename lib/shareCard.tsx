import { ImageResponse } from 'next/og'
import type { PublicPerformance } from './publicStats'

// Branded 9:16 season card (1080×1920). Kept separate from the route so it can
// be unit-rendered in a test — satori is strict (every multi-child box needs
// display:flex), and that's invisible to the type-checker.

const BG = '#0a0a0a'
const SURFACE = '#13172a'
const BORDER = '#1e2235'
const CREAM = '#e8dece'
const MUTED = '#8892aa'
const BLUE = '#3a6fda'

// Barlow Condensed for headings, via the ttf-serving Google Fonts endpoint
// (old UA). Falls back to the default font so the card always renders.
async function loadBarlow(): Promise<{ name: string; data: ArrayBuffer; weight: 800; style: 'normal' }[]> {
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800', {
      headers: { 'User-Agent': 'Mozilla/4.0' },
    }).then(r => r.text())
    const url = css.match(/src:\s*url\((.+?)\)/)?.[1]
    if (!url) return []
    const data = await fetch(url).then(r => r.arrayBuffer())
    return [{ name: 'Barlow Condensed', data, weight: 800, style: 'normal' }]
  } catch {
    return []
  }
}

export async function renderShareCard(
  perf: PublicPerformance,
  opts: { name: string | null; position: string | null },
): Promise<ImageResponse> {
  const cs = perf.currentSeason
  const cd = perf.currentDetail
  const defensive = perf.focus === 'defensive'
  const name = (opts.name || 'Your season').toUpperCase()

  const heroValue = cs ? (defensive ? cs.summary.cleanSheets : cs.summary.involvements) : perf.totals.goals + perf.totals.assists
  const heroLabel = cs ? (defensive ? 'CLEAN SHEETS' : 'GOAL INVOLVEMENTS') : 'CAREER G+A'

  const tiles: [string, string][] = cs
    ? defensive
      ? [['Apps', String(cs.summary.apps)], ['Clean sheets', String(cs.summary.cleanSheets)], ['Mins/game', String(cs.summary.avgMinutes ?? '—')]]
      : [['Goals', String(cs.summary.goals)], ['Assists', String(cs.summary.assists)], ['Apps', String(cs.summary.apps)]]
    : [['Apps', String(perf.totals.apps)], ['Goals', String(perf.totals.goals)], ['Assists', String(perf.totals.assists)]]

  const per90 = cd && cs && cs.summary.minutes > 0
    ? (defensive ? cd.rates.per90Involvements : cd.rates.per90Goals)
    : null
  const per90Label = defensive ? 'G+A / 90' : 'GOALS / 90'
  const results = cd ? [...cd.form.results].reverse() : []

  const fonts = await loadBarlow()
  const headFont = fonts.length ? 'Barlow Condensed' : 'sans-serif'

  return new ImageResponse(
    (
      <div style={{ width: '1080px', height: '1920px', background: BG, display: 'flex', flexDirection: 'column', padding: '90px 80px', color: CREAM }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, letterSpacing: 2, fontFamily: headFont, color: CREAM }}>NEXT11VEN</div>
          {perf.level ? (
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, fontFamily: headFont, color: BLUE, background: 'rgba(45,95,196,0.15)', border: '2px solid rgba(45,95,196,0.4)', borderRadius: 16, padding: '8px 22px' }}>{perf.level}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', height: 6, background: BLUE, borderRadius: 4, marginTop: 28, width: 160 }} />

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 60 }}>
          <div style={{ display: 'flex', fontSize: 92, lineHeight: 1, fontWeight: 800, fontFamily: headFont, color: CREAM }}>{name}</div>
          <div style={{ display: 'flex', fontSize: 38, color: MUTED, marginTop: 18 }}>
            {cs ? cs.label : 'Career record'}{opts.position ? `  ·  ${opts.position}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 90 }}>
          <div style={{ display: 'flex', fontSize: 300, lineHeight: 0.9, fontWeight: 800, fontFamily: headFont, color: CREAM }}>{heroValue}</div>
          <div style={{ display: 'flex', fontSize: 40, letterSpacing: 3, fontWeight: 700, color: BLUE, marginTop: 10 }}>{heroLabel}</div>
        </div>

        <div style={{ display: 'flex', gap: 28, marginTop: 90 }}>
          {tiles.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', flex: 1, background: SURFACE, border: `2px solid ${BORDER}`, borderRadius: 28, padding: '40px 20px', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, fontFamily: headFont, color: CREAM, lineHeight: 1 }}>{value}</div>
              <div style={{ display: 'flex', fontSize: 28, letterSpacing: 2, color: MUTED, marginTop: 16, textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 28, marginTop: 40 }}>
          {per90 != null ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'rgba(45,95,196,0.12)', border: '2px solid rgba(45,95,196,0.3)', borderRadius: 28, padding: '36px 24px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, fontFamily: headFont, color: BLUE, lineHeight: 1 }}>{per90.toFixed(2)}</div>
              <div style={{ display: 'flex', fontSize: 26, letterSpacing: 2, color: MUTED, marginTop: 12 }}>{per90Label}</div>
            </div>
          ) : null}
          {results.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: SURFACE, border: `2px solid ${BORDER}`, borderRadius: 28, padding: '36px 24px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                {results.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 14, fontSize: 34, fontWeight: 800, fontFamily: headFont,
                    background: r === 'W' ? BLUE : r === 'D' ? BORDER : BG, color: r === 'W' ? '#fff' : MUTED, border: r === 'L' ? `2px solid ${BORDER}` : 'none' }}>{r}</div>
                ))}
              </div>
              <div style={{ display: 'flex', fontSize: 26, letterSpacing: 2, color: MUTED, marginTop: 18 }}>RECENT FORM</div>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: MUTED }}>
          Tracked on app.next11ven.com
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts: fonts.length ? fonts : undefined },
  )
}

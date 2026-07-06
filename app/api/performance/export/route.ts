import { NextResponse } from 'next/server'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import {
  COMPETITION_TYPE_LABELS,
  MATCH_TAG_LABELS,
  type CompetitionType,
  type MatchTag,
  type PerformanceMatch,
} from '@/lib/performance'

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// CSV export of the player's full logged history. Deliberately NOT premium-
// gated (auth + player role only): a lapsed player always owns their record.
export async function GET() {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  const { data, error } = await gate.supabase
    .from('performance_matches')
    .select('*, club_stints(club_name, level, stint_type)')
    .eq('player_id', gate.userId)
    .order('match_date', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to export' }, { status: 500 })

  type Row = PerformanceMatch & { club_stints: { club_name: string; level: string | null; stint_type: string } | null }
  const rows = (data ?? []) as Row[]

  const header = [
    'Date', 'Opponent', 'Competition', 'Competition name', 'Club', 'Club level',
    'Stint type', 'Result', 'Started', 'Position', 'Minutes', 'Goals', 'Assists',
    'Penalty saves', 'Rating', 'Tags', 'Notes',
  ]

  const lines = [header.join(',')]
  for (const m of rows) {
    const result = m.goals_for != null && m.goals_against != null
      ? `${m.goals_for}-${m.goals_against}`
      : ''
    lines.push([
      csvCell(m.match_date),
      csvCell(m.opponent),
      csvCell(COMPETITION_TYPE_LABELS[m.competition_type as CompetitionType] ?? m.competition_type),
      csvCell(m.competition_name),
      csvCell(m.club_stints?.club_name),
      csvCell(m.club_stints?.level),
      csvCell(m.club_stints?.stint_type),
      csvCell(result),
      csvCell(m.started ? 'Yes' : 'Sub'),
      csvCell(m.position),
      csvCell(m.minutes_played),
      csvCell(m.goals),
      csvCell(m.assists),
      csvCell(m.penalty_saves),
      csvCell(m.rating),
      csvCell(m.tags.map(t => MATCH_TAG_LABELS[t as MatchTag] ?? t).join('; ')),
      csvCell(m.notes),
    ].join(','))
  }

  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="next11ven-match-history.csv"',
      'Cache-Control': 'no-store',
    },
  })
}

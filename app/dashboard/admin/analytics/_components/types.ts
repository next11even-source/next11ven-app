export type PricePoint = {
  price_id: string
  unit_amount_pence: number
  currency: string
  subscriber_count: number
  mrr_pence: number
}

export type CoachNetAddsMonth = { label: string; net_adds: number }

export type Movement<T> = { current: T; previous: T }

export type HeroStats = {
  active_coaches_30d: Movement<number>
  net_new_mrr_pence: Movement<number>
  opportunities_posted: Movement<number>
  connections_started: Movement<number>
  premium_conversions: Movement<{ player: number; coach: number }>
}

export type RateStat = { responded: number; total: number; rate_pct: number | null }
export type EngagementStat = { engaged: number; total: number; rate_pct: number | null }
export type RoleSplit = { player: number; coach: number }

export type MarketplaceHealthStats = {
  application_response_rate: RateStat
  conversation_engagement_rate: EngagementStat
  outcomes: { accepted: number; signed: number }
  wau: RoleSplit
  dau: RoleSplit
}

export type EventType =
  | 'application_accepted'
  | 'conversation_started'
  | 'conversation_engaged'
  | 'player_signed'
  | 'coach_upgraded'
  | 'player_upgraded'

export type FeedEvent = {
  type: EventType
  occurred_at: string
  headline: string
}

export type TimeToUpgrade = {
  avg_days: number | null
  same_day: number
  within_week: number
  within_month: number
  longer: number
  total: number
}

export type RevenueStats = {
  mrr_pence: number
  active_subs: number
  cancelling: number
  player_subs: number
  coach_subs: number
  player_mrr_pence: number
  coach_mrr_pence: number
  price_breakdown: PricePoint[]
  mrr_trend: { label: string; value: number }[]
  non_converting_count: number
  free_sub_count: number
  coach_net_adds_monthly: CoachNetAddsMonth[]
  time_to_upgrade: TimeToUpgrade
}

export type MonthRow = {
  label: string
  new_signups: number
  new_premium: number
  churned: number
  messages: number
  applications: number
  new_mrr_pence: number
  churned_mrr_pence: number
  real_revenue_pence: number
  opportunities_posted: number
  connections_started: number
  application_response_pct: number | null
}

export type PlatformStats = {
  mau: number
  mau_prev: number
  dau: number
  ever_signed_in: number
  player_count: number
  coach_count: number
  funnel: Funnel
  open_opportunities: number
  pending_approvals: number
  monthly_table: MonthRow[]
  new_mrr_pence: number
  churned_mrr_pence: number
  legacy_count: number
  legacy_upgrade_pence: number
  weekly_active_coaches: number
  player_premium_conversions_7d: number
  contacts_7d: number
  actively_looking_total: number
  actively_looking_contacted_7d: number
  avg_time_to_first_contact_hours: number | null
  activation_numerator_7d: number
  activation_denominator_7d: number
}

export type TrackerStats = {
  eligible_players: number
  adopters_total: number
  adopters_7d: number
  matches_total: number
  matches_7d: number
  repeat_loggers: number
  motm_logged: number
  daily_trend: { label: string; value: number }[]
  searchable_pool: number
  stats_public_count: number
  career_rows_total: number
  career_players_total: number
  career_rows_7d: number
  career_multi_season_players: number
  career_players_7d: number
  career_daily_trend: { label: string; value: number }[]
  weekly_adoption: { label: string; matches: number; loggers: number; history_rows: number; contributors: number }[]
}

export type RecentLogin = {
  id: string
  email: string | null
  last_sign_in_at: string
  full_name: string | null
  role: string | null
  club: string | null
}

export type MessageEntry = {
  id: string
  content: string
  created_at: string
  sender_name: string | null
  sender_club: string | null
  sender_role: string | null
  other_name: string | null
  other_club: string | null
  other_role: string | null
}

export type RecentApplication = {
  id: string
  created_at: string
  status: string
  message: string | null
  player: { id: string; full_name: string | null; club: string | null; position: string | null } | null
  coach: { id: string; full_name: string | null; club: string | null } | null
  opportunity: { id: string; title: string | null; club: string | null; position: string | null; level: string | null } | null
}

export type WaitlistPlayer = {
  id: string
  full_name: string | null
  position: string | null
  club: string | null
  showcase_waitlist_joined_at: string | null
}

export type WaitlistCoach = {
  id: string
  full_name: string | null
  coaching_role: string | null
  club: string | null
  showcase_coach_waitlist_joined_at: string | null
}

export type ShowcaseWaitlist = {
  players: WaitlistPlayer[]
  coaches: WaitlistCoach[]
  total: number
}

export type MessageStats = {
  messagesSent: number
  newConversations: number
  applicationsSubmitted: number
}

export type Funnel = {
  registered: number
  approved: number
  active_30d: number
  premium: number
}

export type CoachLeaderboardEntry = {
  id: string
  full_name: string | null
  club: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  is_agent: boolean | null
  premium: boolean | null
  coaching_role: string | null
  coaching_level: string | null
  created_at: string
  last_sign_in_at: string | null
  last_message_at: string | null
  score: number
  conversations: number
  conversations_with_reply: number
  players_contacted: number
  messages_sent: number
  messages_sent_30d: number
  shortlisted: number
  shortlisted_30d: number
  opportunities_posted: number
  opportunities_active: number
  applications_received: number
  applications_accepted: number
  applications_actioned: number
  player_views: number
  player_views_30d: number
}

export type CoachLeaderboard = {
  total_coaches: number
  engaged_coaches: number
  proof_of_value_coaches: number
  active_30d: number
  coaches: CoachLeaderboardEntry[]
}

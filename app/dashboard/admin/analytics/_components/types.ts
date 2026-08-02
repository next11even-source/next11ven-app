export type PricePoint = {
  price_id: string
  unit_amount_pence: number
  currency: string
  subscriber_count: number
  mrr_pence: number
}

export type CoachNetAddsMonth = { label: string; net_adds: number }

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

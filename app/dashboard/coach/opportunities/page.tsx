import { redirect } from 'next/navigation'

// Opportunities are now unified at /dashboard/opportunities for both roles.
export default function CoachOpportunitiesRedirect() {
  redirect('/dashboard/opportunities')
}

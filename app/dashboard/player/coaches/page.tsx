import { redirect } from 'next/navigation'

export default function PlayerCoachesRedirect() {
  redirect('/dashboard/coaches')
}

import SurnameGate from '@/app/components/SurnameGate'
import CoachingRoleGate from '@/app/components/CoachingRoleGate'

// Dashboard root. Deliberately renders nothing of its own — the per-role shells
// (PlayerShell, coach/layout) still own all chrome, and adding a wrapper element
// here would change their layout.
//
// It exists so SurnameGate and CoachingRoleGate each have one mount point
// covering every route under /dashboard. Mounted per-shell they missed
// /dashboard/profile, /showcase, /become and /admin, none of which have a shell
// — all four were reachable by direct URL with the gate skipped entirely.
// SurnameGate fires for any role missing a surname; CoachingRoleGate fires for
// coaches missing a coaching_role. Both are blocking — only one can open at a
// time because SurnameGate checks last_name and CoachingRoleGate checks
// coaching_role, and they render null when their condition isn't met.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SurnameGate />
      <CoachingRoleGate />
    </>
  )
}

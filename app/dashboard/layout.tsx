import SurnameGate from '@/app/components/SurnameGate'

// Dashboard root. Deliberately renders nothing of its own — the per-role shells
// (PlayerShell, coach/layout) still own all chrome, and adding a wrapper element
// here would change their layout.
//
// It exists so SurnameGate has one mount point covering every route under
// /dashboard. Mounted per-shell it missed /dashboard/profile, /showcase, /become
// and /admin, none of which have a shell — all four were reachable by direct URL
// with the gate skipped entirely.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SurnameGate />
    </>
  )
}

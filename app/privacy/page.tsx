import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — NEXT11VEN',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 py-12" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="space-y-3">
          <Link href="/" className="block w-fit">
            <img src="/logo.jpg" alt="NEXT11VEN" className="h-10 w-auto" />
          </Link>
          <h1 className="text-4xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Privacy Policy
          </h1>
          <p className="text-sm" style={{ color: '#8892aa' }}>Last updated: April 2026</p>
        </div>

        {/* Notice */}
        <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4' }}>
          <p className="text-sm font-semibold" style={{ color: '#2d5fc4' }}>Full policy coming soon</p>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: '#8892aa' }}>
            We are finalising our full privacy policy. The summary below outlines how we currently collect and use your data.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-6 text-sm leading-relaxed" style={{ color: '#8892aa' }}>

          <Section title="Who we are">
            NEXT11VEN is a football recruitment platform connecting non-league players with coaches and clubs.
            Operated by NEXT11VEN Ltd. Contact: <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>
          </Section>

          <Section title="What data we collect">
            <ul className="space-y-1.5 mt-2 list-none">
              {[
                'Name, email address, and phone number (provided on registration)',
                'Football profile data: position, club, playing level, statistics',
                'Profile photo (uploaded voluntarily)',
                'Messages sent within the platform',
                'Application history for posted opportunities',
                'Basic usage data (page views, login times)',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="How we use your data">
            We use your data to operate the NEXT11VEN platform — enabling coaches to find players,
            players to apply for opportunities, and both parties to communicate. We do not sell your
            data to third parties. We may use your email to send platform notifications and, if you
            opt in, marketing communications via MailerLite.
          </Section>

          <Section title="Data storage">
            Your data is stored securely in Supabase (EU region). Payment data is handled
            exclusively by Stripe and is never stored on our servers.
          </Section>

          <Section title="Your rights (GDPR)">
            You have the right to access, correct, export, or request deletion of your personal data
            at any time. To exercise these rights, email{' '}
            <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>.
          </Section>

          <Section title="Cookies">
            We use essential cookies for authentication and session management. No third-party
            advertising cookies are used.
          </Section>

        </div>

        <div className="pt-4 flex gap-4 text-xs" style={{ borderTop: '1px solid #1e2235', color: '#8892aa' }}>
          <Link href="/terms" style={{ color: '#2d5fc4' }}>Terms of Service</Link>
          <Link href="/" style={{ color: '#8892aa' }}>← Back to sign in</Link>
        </div>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        {title}
      </h2>
      <div style={{ color: '#8892aa' }}>{children}</div>
    </div>
  )
}

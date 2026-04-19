import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — NEXT11VEN',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen px-4 py-12" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="space-y-3">
          <Link href="/" className="block w-fit">
            <img src="/logo.jpg" alt="NEXT11VEN" className="h-10 w-auto" />
          </Link>
          <h1 className="text-4xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Terms of Service
          </h1>
          <p className="text-sm" style={{ color: '#8892aa' }}>Last updated: April 2026</p>
        </div>

        {/* Notice */}
        <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4' }}>
          <p className="text-sm font-semibold" style={{ color: '#2d5fc4' }}>Full terms coming soon</p>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: '#8892aa' }}>
            We are finalising our full terms of service. The summary below outlines the key rules and conditions for using NEXT11VEN.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-6 text-sm leading-relaxed" style={{ color: '#8892aa' }}>

          <Section title="Acceptance of terms">
            By creating an account on NEXT11VEN, you agree to these terms. If you do not agree,
            do not use the platform. These terms apply to all users — players, coaches, and fans.
          </Section>

          <Section title="Who can use NEXT11VEN">
            <ul className="space-y-1.5 mt-2 list-none">
              {[
                'You must be 16 years of age or older to register',
                'Player and coach accounts require approval before access is granted',
                'You are responsible for the accuracy of information you provide',
                'One account per person — no duplicate or impersonation accounts',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Player responsibilities">
            Players must provide accurate profile information including their current club,
            playing level, and contact details. You must not misrepresent your experience or
            qualifications. You are responsible for any applications you submit to opportunities.
          </Section>

          <Section title="Coach responsibilities">
            Coaches must post genuine opportunities with accurate descriptions. You must not
            use the platform to collect player data for purposes outside of legitimate
            recruitment. Contact with players must be conducted professionally and appropriately.
          </Section>

          <Section title="Prohibited conduct">
            <ul className="space-y-1.5 mt-2 list-none">
              {[
                'No harassment, abuse, or discriminatory behaviour',
                'No spam, unsolicited commercial messages, or phishing',
                'No fake profiles, impersonation, or false credentials',
                'No scraping, automated access, or reverse engineering',
                'No content that is illegal, defamatory, or harmful',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Premium subscriptions">
            Premium plans are billed monthly via Stripe. You may cancel at any time through
            your account settings — cancellation takes effect at the end of your current billing
            period. No refunds are issued for partial months. NEXT11VEN reserves the right to
            change pricing with 30 days notice.
          </Section>

          <Section title="Content and intellectual property">
            You retain ownership of content you upload (profile photos, highlights). By uploading,
            you grant NEXT11VEN a licence to display this content on the platform. NEXT11VEN's
            branding, design, and code are owned by NEXT11VEN Ltd and may not be reproduced
            without permission.
          </Section>

          <Section title="Account termination">
            We may suspend or terminate accounts that violate these terms. You may delete
            your account at any time by contacting{' '}
            <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>.
            On deletion, your personal data will be removed in accordance with our{' '}
            <Link href="/privacy" style={{ color: '#2d5fc4' }}>Privacy Policy</Link>.
          </Section>

          <Section title="Limitation of liability">
            NEXT11VEN connects players and coaches but does not guarantee employment, trials,
            or any specific outcome. We are not liable for any agreements made between users
            outside the platform. The platform is provided "as is" without warranties of any kind.
          </Section>

          <Section title="Contact">
            Questions about these terms? Email{' '}
            <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>.
            Operated by NEXT11VEN Ltd.
          </Section>

        </div>

        <div className="pt-4 flex gap-4 text-xs" style={{ borderTop: '1px solid #1e2235', color: '#8892aa' }}>
          <Link href="/privacy" style={{ color: '#2d5fc4' }}>Privacy Policy</Link>
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

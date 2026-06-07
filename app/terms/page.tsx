import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — NEXT11VEN',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen px-4 py-12" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-2xl mx-auto space-y-8">

        <div className="space-y-3">
          <Link href="/" className="block w-fit">
            <img src="/logo.jpg" alt="NEXT11VEN" className="h-10 w-auto" />
          </Link>
          <h1 className="text-4xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Terms of Service
          </h1>
          <p className="text-sm" style={{ color: '#8892aa' }}>Last updated: June 2026</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed" style={{ color: '#8892aa' }}>

          <Section title="Acceptance of terms">
            By creating an account on NEXT11VEN, you agree to these Terms of Service and our{' '}
            <Link href="/privacy" style={{ color: '#2d5fc4' }}>Privacy Policy</Link>. If you do not
            agree, do not use the platform. These terms apply to all users — players, coaches, and
            fans. NEXT11VEN is operated by <strong style={{ color: '#e8dece' }}>NEXT11VEN Ltd</strong>.
          </Section>

          <Section title="Who can use NEXT11VEN">
            <ul className="space-y-1.5 mt-2 list-none">
              {[
                'You must be 16 years of age or older to register an account.',
                'Player and coach accounts require approval by NEXT11VEN before access is granted.',
                'You must provide accurate information about yourself — false profiles will be removed.',
                'One account per person. Duplicate or impersonation accounts are not permitted.',
                'Fan accounts have browse-only access. They cannot post, message, or apply for opportunities.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Player responsibilities">
            Players must provide accurate profile information including their current club, playing
            level, and contact details. You must not misrepresent your experience, qualifications,
            or availability. You are responsible for any applications you submit to opportunities
            posted on the platform. Applying to a role is a signal of genuine interest — do not
            apply speculatively to roles you have no intention of pursuing.
          </Section>

          <Section title="Coach responsibilities">
            Coaches must post genuine opportunities with accurate descriptions of the role, level,
            and expectations. You must not use NEXT11VEN to collect player data for purposes outside
            of legitimate recruitment activity. All contact with players must be conducted
            professionally and in accordance with applicable law. Coaches are responsible for any
            commitments or offers made to players.
          </Section>

          <Section title="Prohibited conduct">
            <ul className="space-y-1.5 mt-2 list-none">
              {[
                'No harassment, abuse, discrimination, or threatening behaviour of any kind.',
                'No spam, unsolicited commercial messages, or phishing.',
                'No fake profiles, impersonation, or false credentials.',
                'No scraping, automated access, bots, or reverse engineering of the platform.',
                'No content that is illegal, defamatory, obscene, or harmful.',
                'No use of the platform for purposes unrelated to football recruitment.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            Breaches may result in immediate account suspension without notice or refund.
          </Section>

          <Section title="Premium subscriptions">
            Premium plans are billed monthly via Stripe:
            <ul className="space-y-1.5 mt-3 list-none">
              {[
                'Player Premium — £6.99/month',
                'Coach Pro — £9.99/month',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3">
              You may cancel at any time through your billing settings. Cancellation takes effect
              at the end of your current billing period — you retain access until then. No refunds
              are issued for partial months already paid. NEXT11VEN reserves the right to change
              pricing with 30 days&apos; written notice to your registered email address.
            </p>
            <p className="mt-3">
              Nothing in these terms affects your statutory rights under UK consumer law.
            </p>
          </Section>

          <Section title="Extra message credits">
            Extra message credits are a one-time purchase that supplements your monthly messaging
            allowance. Credits are non-refundable once purchased, have no expiry date, and carry
            over indefinitely. They are consumed automatically once your monthly allowance is
            exhausted. Credits are tied to your account and cannot be transferred.
          </Section>

          <Section title="Content and intellectual property">
            You retain ownership of content you upload to NEXT11VEN, including profile photos and
            highlight videos. By uploading content, you grant NEXT11VEN Ltd a non-exclusive,
            royalty-free licence to display and use that content within the platform for the purpose
            of operating the service. This licence ends when you delete the content or close your
            account. You must not upload content that infringes a third party&apos;s intellectual
            property rights.
            <p className="mt-3">
              NEXT11VEN&apos;s branding, design, and code are owned by NEXT11VEN Ltd and may not
              be reproduced, copied, or used without express written permission.
            </p>
          </Section>

          <Section title="Account termination">
            <p>
              We may suspend or terminate accounts that violate these terms, without prior notice
              where the breach is serious. Active subscriptions will be cancelled on termination
              and no refund will be issued for the remainder of the billing period.
            </p>
            <p className="mt-3">
              You may delete your account at any time by emailing{' '}
              <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>.
              On deletion, your personal data will be handled in accordance with our{' '}
              <Link href="/privacy" style={{ color: '#2d5fc4' }}>Privacy Policy</Link>. Your active
              subscription will be cancelled immediately on account deletion — no refund will be
              issued for unused days in the current period.
            </p>
          </Section>

          <Section title="Limitation of liability">
            NEXT11VEN connects players and coaches but does not guarantee employment, trials,
            contracts, or any specific recruitment outcome. We are not a party to any agreement
            made between users, and accept no liability for commitments or disputes arising between
            them. The platform is provided &quot;as is&quot; without warranties of fitness for a
            particular purpose. To the maximum extent permitted by law, NEXT11VEN Ltd&apos;s total
            liability to you for any claim arising from your use of the platform shall not exceed
            the total amount paid by you to NEXT11VEN in the three months preceding the claim.
          </Section>

          <Section title="Governing law">
            These terms are governed by the laws of England and Wales. Any disputes arising from
            or in connection with these terms will be subject to the exclusive jurisdiction of the
            courts of England and Wales.
          </Section>

          <Section title="Changes to these terms">
            We may update these terms from time to time. Material changes will be communicated by
            email to your registered address with at least 14 days&apos; notice. Continued use of
            the platform after that date constitutes acceptance of the updated terms. The date at
            the top of this page reflects the most recent revision.
          </Section>

          <Section title="Contact">
            Questions about these terms or a dispute to raise? Contact us:
            <br />
            <strong style={{ color: '#e8dece' }}>NEXT11VEN Ltd</strong>
            <br />
            <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>
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

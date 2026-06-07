import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — NEXT11VEN',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 py-12" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-2xl mx-auto space-y-8">

        <div className="space-y-3">
          <Link href="/" className="block w-fit">
            <img src="/logo.jpg" alt="NEXT11VEN" className="h-10 w-auto" />
          </Link>
          <h1 className="text-4xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Privacy Policy
          </h1>
          <p className="text-sm" style={{ color: '#8892aa' }}>Last updated: June 2026</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed" style={{ color: '#8892aa' }}>

          <Section title="Who we are">
            NEXT11VEN is a football recruitment platform connecting non-league players with coaches
            and clubs. It is operated by <strong style={{ color: '#e8dece' }}>NEXT11VEN Ltd</strong>,
            the data controller for all personal data processed through this platform.
            {' '}Contact us at{' '}
            <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>.
          </Section>

          <Section title="What data we collect">
            <ul className="space-y-1.5 mt-2 list-none">
              {[
                'Name, email address, and phone number — provided at registration',
                'Date of birth — used to verify eligibility (16+)',
                'Location and city — used to show relevant opportunities',
                'Football profile data — position, club, playing level, season statistics, highlight URLs',
                'Profile photo — uploaded voluntarily',
                'Coaching profile data — role, coaching level, history (coach accounts)',
                'Messages sent within the platform between players and coaches',
                'Application history for posted opportunities',
                'SMS opt-in preference and last SMS timestamp',
                'Marketing email opt-out preference',
                'Stripe customer ID and subscription status — no card details are stored on our servers',
                'Login timestamps and basic platform activity (views, streak data)',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Legal basis for processing (GDPR)">
            We process your personal data on the following legal bases under UK GDPR:
            <ul className="space-y-1.5 mt-3 list-none">
              {[
                'Contract performance (Article 6(1)(b)) — processing your account data, messages, and applications is necessary to provide the service you signed up for.',
                'Legitimate interests (Article 6(1)(f)) — platform security, fraud prevention, abuse detection, and notifying you of messages or application updates.',
                'Consent (Article 6(1)(a)) — marketing emails and SMS messages. You may withdraw consent at any time using the unsubscribe link in any marketing email or by updating your preferences in the app.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="How we use your data">
            We use your data to operate NEXT11VEN — enabling coaches to find players, players to
            apply for opportunities, and both parties to communicate. We do not sell your data to
            third parties. Specific uses include:
            <ul className="space-y-1.5 mt-3 list-none">
              {[
                'Displaying your profile to other approved users of the platform',
                'Notifying you of new messages, application decisions, and platform activity',
                'Sending weekly profile view summaries and, where you have opted in, marketing emails',
                'Processing subscription payments via Stripe',
                'Detecting abuse and enforcing platform rules',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Third-party processors">
            We share data with the following processors, each bound by appropriate data protection
            agreements:
            <ul className="space-y-1.5 mt-3 list-none">
              {[
                'Supabase — database and authentication. Data stored in EU region.',
                'Stripe — payment processing. Stripe is PCI-DSS compliant. We never store card details.',
                'Twilio — SMS notifications. Your phone number is shared only when sending an SMS you have consented to.',
                'Resend — transactional and marketing email delivery.',
                'MailerLite — marketing email sequences. Added to groups on account approval and premium upgrade.',
                'Vercel — platform hosting and anonymous analytics (no cookies, no personal data).',
                'Meta (Facebook) — page view tracking via the Meta Pixel. This may set cookies on your device. See Meta\'s privacy policy for details.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Data retention">
            We retain your personal data for as long as your account is active. If you request
            deletion, we will remove your personal data within 30 days. Some data may be retained
            for a limited additional period where required by law (for example, financial records
            relating to Stripe transactions). Anonymous or aggregated platform statistics are
            retained indefinitely.
          </Section>

          <Section title="Your rights">
            Under UK GDPR, you have the following rights:
            <ul className="space-y-1.5 mt-3 list-none">
              {[
                'Access — request a copy of the personal data we hold about you.',
                'Rectification — ask us to correct inaccurate data.',
                'Erasure — request deletion of your personal data ("right to be forgotten").',
                'Portability — receive your data in a structured, machine-readable format.',
                'Restriction — ask us to restrict processing in certain circumstances.',
                'Objection — object to processing based on legitimate interests.',
                'Withdraw consent — opt out of marketing at any time, without affecting the lawfulness of prior processing.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: '#2d5fc4', flexShrink: 0 }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{' '}
              <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>.
              We will respond within 30 days. You also have the right to lodge a complaint with the{' '}
              <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{ color: '#2d5fc4' }}>
                Information Commissioner&apos;s Office (ICO)
              </a>.
            </p>
          </Section>

          <Section title="Marketing and opt-out">
            Marketing emails are sent via MailerLite. Every marketing email includes an unsubscribe
            link. You can also opt out at any time from your profile settings in the app. Opting
            out stops marketing emails and SMS reminders. It does not affect transactional emails
            such as message notifications, application decisions, or payment confirmations — these
            are sent on the basis of contract performance and cannot be suppressed.
          </Section>

          <Section title="Cookies and tracking">
            We use essential cookies for authentication and session management — these are required
            for the platform to function. Vercel Analytics collects anonymous, aggregated usage data
            with no cookies and no personally identifiable information. The Meta Pixel tracks page
            views and may set cookies on your device for advertising attribution purposes.
          </Section>

          <Section title="Governing law">
            This privacy policy is governed by the laws of England and Wales. All disputes will be
            subject to the exclusive jurisdiction of the courts of England and Wales.
          </Section>

          <Section title="Changes to this policy">
            We may update this policy from time to time. Material changes will be communicated by
            email. Continued use of the platform after changes constitutes acceptance of the updated
            policy. The date at the top of this page always reflects the most recent revision.
          </Section>

          <Section title="Contact">
            <strong style={{ color: '#e8dece' }}>NEXT11VEN Ltd</strong>
            <br />
            <a href="mailto:hello@next11ven.com" style={{ color: '#2d5fc4' }}>hello@next11ven.com</a>
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

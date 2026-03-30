import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Link>
        </Button>

        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold">1. Data Controller</h2>
            <p>BHO Fire ("we", "us", "our") is the data controller for personal data processed through the Fire Log Book platform, in accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Data We Collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account data:</strong> Name, email address, role, authentication credentials</li>
              <li><strong>Business data:</strong> Customer records, site addresses, service reports, invoices</li>
              <li><strong>Technical data:</strong> IP addresses, browser type, session activity logs</li>
              <li><strong>Communication data:</strong> Emails sent through the platform, email logs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Lawful Basis for Processing</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Contract:</strong> Processing necessary for service delivery</li>
              <li><strong>Legal obligation:</strong> Fire safety compliance records (BS 5839), financial records</li>
              <li><strong>Legitimate interest:</strong> Platform security, fraud prevention, service improvement</li>
              <li><strong>Consent:</strong> Optional analytics, marketing communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Data Retention</h2>
            <p>We retain data in accordance with our data retention policy:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Service reports: 7 years (fire safety compliance)</li>
              <li>Financial records: 7 years (HMRC requirements)</li>
              <li>Audit logs: 7 years</li>
              <li>Email logs: 3 years</li>
              <li>Credit checks: 1 year</li>
              <li>Uploaded files: 5 years</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Your Rights (UK GDPR)</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Access:</strong> Request a copy of your personal data (Subject Access Request)</li>
              <li><strong>Rectification:</strong> Correct inaccurate data</li>
              <li><strong>Erasure:</strong> Request deletion where no legal retention applies</li>
              <li><strong>Portability:</strong> Receive your data in a portable format</li>
              <li><strong>Objection:</strong> Object to processing based on legitimate interest</li>
              <li><strong>Restriction:</strong> Restrict processing in certain circumstances</li>
            </ul>
            <p>Submit a Subject Access Request through Settings → Security & Compliance.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Data Security</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>All data encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
              <li>Multi-factor authentication (TOTP) enforced</li>
              <li>Role-based access control (RBAC)</li>
              <li>Automatic session timeout after 15 minutes of inactivity</li>
              <li>Leaked password protection (HIBP check)</li>
              <li>Full audit trail of all system actions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Cookies</h2>
            <p>We use essential cookies for authentication and session management. Optional analytics cookies are only set with your consent.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Third-Party Processors</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Hosting & Database:</strong> Supabase (EU/UK data centres)</li>
              <li><strong>Email:</strong> Resend</li>
              <li><strong>Accounting:</strong> Xero (when connected)</li>
              <li><strong>Document Storage:</strong> Microsoft SharePoint (when connected)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Contact</h2>
            <p>For data protection queries, contact our Data Protection Officer at the company address listed in the platform settings, or submit a request through the system.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Supervisory Authority</h2>
            <p>You have the right to lodge a complaint with the Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" className="text-primary underline" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

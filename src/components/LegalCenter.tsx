import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { motion, AnimatePresence } from 'motion/react';
import { X, Scale, ShieldCheck, AlertTriangle, RefreshCcw, Cookie, Mail } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Global open/close store — usable from anywhere (footer, auth gate). */
/* ------------------------------------------------------------------ */
export type LegalDocId = 'terms' | 'privacy' | 'risk' | 'refunds' | 'cookies';

interface LegalState {
  openDoc: LegalDocId | null;
  open: (id: LegalDocId) => void;
  close: () => void;
}

export const useLegal = create<LegalState>((set) => ({
  openDoc: null,
  open: (id) => set({ openDoc: id }),
  close: () => set({ openDoc: null }),
}));

/* ------------------------------------------------------------------ */
/* Document model + content.                                           */
/* These are professional, plain-language templates. Have counsel      */
/* review and localize jurisdiction/entity details before relying on   */
/* them as binding terms.                                              */
/* ------------------------------------------------------------------ */
const COMPANY = 'Slayer Terminal';
const EFFECTIVE = 'June 22, 2026';
const GOVERNING = 'the State of Delaware, United States';

type Section = { h: string; p?: string[]; list?: string[] };
type LegalDoc = {
  id: LegalDocId;
  title: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  contact: string;
  intro: string;
  sections: Section[];
};

const DOCS: LegalDoc[] = [
  {
    id: 'terms',
    title: 'Terms of Service',
    short: 'Terms',
    icon: Scale,
    contact: 'info@slayerterminal.com',
    intro: `These Terms of Service ("Terms") govern your access to and use of ${COMPANY} (the "Service"). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.`,
    sections: [
      { h: '1. Eligibility', p: [`You must be at least 18 years old and able to form a binding contract to use the Service. By using ${COMPANY}, you represent that you meet these requirements and that your use complies with all laws applicable to you.`] },
      { h: '2. The Service', p: [`${COMPANY} provides analytical software, market-structure visualizations, and informational tools for options and equity markets. The Service is provided for research and educational purposes only and does not execute trades, hold funds, or act as a broker, dealer, exchange, or investment adviser.`] },
      { h: '3. Accounts & Security', p: ['You are responsible for the credentials and activity under your account. Keep your password secure, and notify us promptly of any unauthorized use. We may suspend accounts to protect the Service or other users.'] },
      { h: '4. Subscriptions, Billing & Auto-Renewal', p: [`Paid plans are billed in advance through our payment processor (Stripe) on a recurring basis until cancelled. By subscribing, you authorize recurring charges to your payment method at the then-current price. You may cancel at any time; cancellation stops future renewals and takes effect at the end of the current billing period. Pricing and plan features may change with notice. All payments are final and non-refundable except where required by applicable law — see the Refund & Cancellation Policy.`] },
      { h: '5. Acceptable Use', list: ['Do not resell, redistribute, scrape, or republish the Service or its data without written permission.', 'Do not reverse engineer, probe, or circumvent access controls, rate limits, or tier gating.', 'Do not use the Service to violate any law or any third-party market-data agreement.', 'Do not misrepresent the Service’s output as personalized investment advice to others.'] },
      { h: '6. Intellectual Property', p: [`The Service, including its software, models, design, and content, is owned by ${COMPANY} and protected by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable license to use the Service for your own internal purposes, subject to these Terms.`] },
      { h: '7. Third-Party Services & Market Data', p: ['The Service relies on third-party providers for market data, payments, and infrastructure. Their data may be delayed, incomplete, or inaccurate, and their availability is outside our control. Your use of third-party services may also be subject to their own terms.'] },
      { h: '8. No Investment Advice', p: ['Nothing in the Service is investment, legal, tax, or financial advice, and no fiduciary or advisory relationship is created. See the Risk Disclosure & Disclaimer for details. You are solely responsible for your decisions.'] },
      { h: '9. Disclaimer of Warranties', p: ['THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. We do not warrant that the Service will be uninterrupted, error-free, or that any output is accurate or complete.'] },
      { h: '10. Limitation of Liability', p: [`TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${COMPANY.toUpperCase()} WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY TRADING OR INVESTMENT LOSSES, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM.`] },
      { h: '11. Indemnification', p: [`You agree to indemnify and hold ${COMPANY} harmless from claims, losses, and expenses arising from your misuse of the Service or violation of these Terms.`] },
      { h: '12. Termination', p: ['You may stop using the Service at any time. We may suspend or terminate access if you breach these Terms or to protect the Service. Provisions that by their nature should survive termination will survive.'] },
      { h: '13. Changes to the Terms', p: ['We may update these Terms from time to time. Material changes will be communicated through the Service or by email. Continued use after changes take effect constitutes acceptance.'] },
      { h: '14. Governing Law', p: [`These Terms are governed by the laws of ${GOVERNING}, without regard to conflict-of-laws rules. Disputes will be resolved in the courts located there, unless applicable law requires otherwise.`] },
      { h: '15. Contact', p: ['Questions about these Terms can be sent to info@slayerterminal.com.'] },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    short: 'Privacy',
    icon: ShieldCheck,
    contact: 'info@slayerterminal.com',
    intro: `This Privacy Policy explains what information ${COMPANY} collects, how we use it, and the choices you have. We aim to collect only what we need to run the Service.`,
    sections: [
      { h: '1. Information We Collect', list: ['Account information: name, email, and credentials you provide at sign-up.', 'Subscription & payment information: processed by Stripe; we receive limited billing metadata but never your full card number.', 'Usage information: pages viewed, features used, and interactions, to operate and improve the Service.', 'Device & log information: IP address, browser type, and timestamps, collected automatically for security and diagnostics.', 'Support communications: messages you send us.'] },
      { h: '2. How We Use Information', list: ['To provide, secure, and maintain the Service and your account.', 'To process subscriptions and prevent fraud or abuse.', 'To improve features, performance, and reliability.', 'To communicate service notices, security alerts, and (with your consent where required) product updates.', 'To comply with legal obligations.'] },
      { h: '3. Legal Bases', p: ['Where the GDPR applies, we process personal data on the bases of contract performance, our legitimate interests in operating and securing the Service, your consent (where requested), and compliance with legal obligations.'] },
      { h: '4. Cookies & Tracking', p: ['We use cookies and similar technologies to keep you signed in, remember preferences, and understand usage. See the Cookie Policy for details and choices.'] },
      { h: '5. How We Share Information', p: ['We do not sell your personal information. We share it only with service providers who help us run the Service (such as hosting, payments, and analytics) under confidentiality obligations, when required by law, or in connection with a business transfer.'] },
      { h: '6. Data Retention', p: ['We keep personal information for as long as your account is active or as needed to provide the Service, then retain and delete it in line with our legal and operational obligations.'] },
      { h: '7. Security', p: ['We use administrative, technical, and physical safeguards — including encrypted transport and hashed credentials — to protect your information. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.'] },
      { h: '8. Your Rights', p: ['Depending on your location, you may have the right to access, correct, delete, or port your data, object to or restrict certain processing, and opt out of marketing. To exercise these rights, contact info@slayerterminal.com. We will respond as required by applicable law.'] },
      { h: '9. International Transfers', p: ['Your information may be processed in countries other than your own. Where required, we use appropriate safeguards for cross-border transfers.'] },
      { h: '10. Children’s Privacy', p: ['The Service is not directed to anyone under 18, and we do not knowingly collect information from children. If you believe a child has provided us data, contact us and we will delete it.'] },
      { h: '11. Changes to this Policy', p: ['We may update this Policy and will revise the "Last updated" date. Material changes will be communicated through the Service or by email.'] },
      { h: '12. Contact', p: ['For privacy questions or requests, email info@slayerterminal.com.'] },
    ],
  },
  {
    id: 'risk',
    title: 'Risk Disclosure & Disclaimer',
    short: 'Risk',
    icon: AlertTriangle,
    contact: 'support@slayerterminal.com',
    intro: `Trading options and other securities involves substantial risk and is not suitable for every investor. Please read this disclosure carefully before relying on anything in ${COMPANY}.`,
    sections: [
      { h: '1. Not Investment Advice', p: [`${COMPANY} is an analytics and information platform. Nothing it produces is a recommendation, solicitation, or offer to buy or sell any security, nor is it investment, legal, tax, or financial advice tailored to your circumstances.`] },
      { h: '2. No Advisory Relationship', p: ['Using the Service does not create a broker-dealer, advisory, or fiduciary relationship between you and us. We do not know your objectives, risk tolerance, or financial situation.'] },
      { h: '3. Options & Derivatives Risk', p: ['Options are leveraged instruments and can lose value rapidly, including the entire amount paid, and in some strategies more than the amount invested. You should understand the risks and, where appropriate, review standardized options-risk disclosures before trading.'] },
      { h: '4. Models & Hypothetical Outputs', p: ['Analytics such as gamma exposure, dealer positioning, targets, probabilities, and "confidence" are estimates produced by quantitative models using assumptions that may not hold in real markets. They are illustrative, may be wrong, and should not be treated as predictions of actual outcomes.'] },
      { h: '5. Data Accuracy & Latency', p: ['Market data may be delayed, incomplete, or inaccurate, and the Service may be unavailable at times. Do not rely on it as your sole source for any decision, and independently verify anything material.'] },
      { h: '6. Past Performance', p: ['Past or simulated performance does not guarantee future results. Examples and backtests have inherent limitations and do not reflect real trading conditions, fees, or slippage.'] },
      { h: '7. Your Responsibility', p: ['You are solely responsible for your own decisions and their outcomes. You should consult a licensed financial professional who understands your situation before making any investment decision.'] },
      { h: '8. No Guarantee', p: [`${COMPANY} makes no guarantee of profit or protection from loss. You could lose some or all of your capital.`] },
      { h: '9. Contact', p: ['Questions about this disclosure can be sent to support@slayerterminal.com.'] },
    ],
  },
  {
    id: 'refunds',
    title: 'Refund & Cancellation Policy',
    short: 'Refunds',
    icon: RefreshCcw,
    contact: 'billing@slayerterminal.com',
    intro: `This policy explains how subscriptions and cancellations work for ${COMPANY}. All sales are final and non-refundable.`,
    sections: [
      { h: '1. Subscriptions & Auto-Renewal', p: ['Monthly and annual plans renew automatically at the end of each billing period until you cancel. You authorize recurring charges when you subscribe.'] },
      { h: '2. How to Cancel', p: ['You can cancel anytime from your account settings or by emailing billing@slayerterminal.com. Cancellation stops future renewals and prevents further charges; you keep access through the end of the period you have already paid for. Cancelling does not retroactively refund the current or any prior period.'] },
      { h: '3. All Sales Are Final', p: ['All purchases are final. We do not provide refunds or credits for any subscription fee, one-time charge, partially used period, or unused time, except where a refund is required by applicable law. Where local consumer law grants you a non-waivable right to a refund, that right is unaffected by this policy.'] },
      { h: '4. One-Time & Lifetime Purchases', p: ['One-time and lifetime purchases are final and non-refundable once access has been provided, except where required by applicable law.'] },
      { h: '5. Chargebacks', p: ['If you believe a charge is incorrect, please contact us first — we can usually resolve billing issues faster than a chargeback. Fraudulent chargebacks may result in account suspension.'] },
      { h: '6. Contact', p: ['For billing questions or refund requests, email billing@slayerterminal.com.'] },
    ],
  },
  {
    id: 'cookies',
    title: 'Cookie Policy',
    short: 'Cookies',
    icon: Cookie,
    contact: 'info@slayerterminal.com',
    intro: `This Cookie Policy explains how ${COMPANY} uses cookies and similar technologies.`,
    sections: [
      { h: '1. What Cookies Are', p: ['Cookies are small text files stored on your device that help websites function and remember information. We also use similar technologies such as local storage.'] },
      { h: '2. Cookies We Use', list: ['Essential: authentication and session cookies that keep you securely signed in. The Service cannot function without these.', 'Functional: remember your preferences such as theme, timezone, and layout.', 'Analytics: help us understand aggregate usage so we can improve the Service.'] },
      { h: '3. Managing Cookies', p: ['You can control or delete cookies through your browser settings. Blocking essential cookies will prevent you from signing in and using core features.'] },
      { h: '4. Do Not Track', p: ['Some browsers send "Do Not Track" signals. Because there is no common standard, we treat your in-product and browser cookie choices as your preference.'] },
      { h: '5. Changes', p: ['We may update this policy and will revise the "Last updated" date when we do.'] },
      { h: '6. Contact', p: ['Questions can be sent to info@slayerterminal.com.'] },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Overlay component.                                                  */
/* ------------------------------------------------------------------ */
export function LegalCenter() {
  const openDoc = useLegal((s) => s.openDoc);
  const open = useLegal((s) => s.open);
  const close = useLegal((s) => s.close);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isOpen = openDoc !== null;
  const doc = DOCS.find((d) => d.id === openDoc) ?? null;

  // Escape to close + body scroll lock while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close]);

  // Reset scroll to top when switching documents.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [openDoc]);

  return (
    <AnimatePresence>
      {isOpen && doc && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-title"
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-3xl max-h-[86vh] flex flex-col bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden focus:outline-none"
          >
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] shrink-0">
                  <doc.icon className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
                <div className="min-w-0">
                  <h2 id="legal-title" className="text-[var(--text-primary)] font-sans font-bold text-lg leading-tight truncate">{doc.title}</h2>
                  <p className="text-[var(--text-tertiary)] text-[10px] uppercase tracking-widest font-mono mt-0.5">Last updated {EFFECTIVE}</p>
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="shrink-0 h-9 w-9 rounded-full bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Doc switcher */}
            <div className="shrink-0 flex gap-1 overflow-x-auto px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/40" role="tablist" aria-label="Legal documents">
              {DOCS.map((d) => {
                const active = d.id === openDoc;
                return (
                  <button
                    key={d.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => open(d.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] ${
                      active
                        ? 'bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border-strong)]'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div ref={scrollRef} className="grow overflow-y-auto px-6 py-5">
              <p className="text-[var(--text-secondary)] text-[13px] leading-relaxed mb-6">{doc.intro}</p>
              <div className="space-y-6">
                {doc.sections.map((s) => (
                  <section key={s.h}>
                    <h3 className="text-[var(--text-primary)] font-sans font-bold text-sm mb-2">{s.h}</h3>
                    {s.p?.map((para, i) => (
                      <p key={i} className="text-[var(--text-secondary)] text-[13px] leading-relaxed mb-2">{para}</p>
                    ))}
                    {s.list && (
                      <ul className="space-y-1.5 mt-1">
                        {s.list.map((li, i) => (
                          <li key={i} className="flex gap-2.5 text-[var(--text-secondary)] text-[13px] leading-relaxed">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--text-tertiary)]" aria-hidden="true" />
                            <span>{li}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2 px-6 py-3.5 border-t border-[var(--border)] bg-[var(--surface-2)]/40">
              <a
                href={`mailto:${doc.contact}`}
                className="inline-flex items-center gap-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-[11px] font-mono tracking-wide transition-colors"
              >
                <Mail className="w-3.5 h-3.5" /> {doc.contact}
              </a>
              <span className="text-[var(--text-tertiary)] text-[10px] uppercase tracking-widest font-mono">© {new Date().getFullYear()} {COMPANY}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LegalCenter;

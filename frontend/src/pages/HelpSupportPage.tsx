import React, { useState } from 'react'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { Alert } from '../components/common/Alert'
import { HelpCircleIcon } from '../components/common/Icons'

export const HelpSupportPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const faqs = [
    {
      q: 'How do I unblock camera permission in my browser?',
      a: 'If you previously clicked "Block", click the lock or camera icon on the left side of your browser URL address bar. Select "Allow" for Camera permissions, then refresh the page and navigate back to Camera Setup.',
    },
    {
      q: 'Why does tracking feel jittery or trigger false turns?',
      a: 'This usually indicates either high camera sensor noise (caused by dim ambient lighting) or sensitivity configured too high. Go to Settings, increase "Jitter Smoothing" to 0.4 or 0.5, and widen the "Dead-Zone Radius" to 15%.',
    },
    {
      q: 'Does GazeMouse-OS record or save my face video?',
      a: 'No. Never. Video frames from your webcam are processed solely inside temporary browser memory using WebAssembly. No video frames, face photographs, or biometric coordinate sets are ever sent to any server or saved to disk.',
    },
    {
      q: 'Can I play with glasses on?',
      a: 'Yes. The MediaPipe vision model is trained on facial geometry (nose bridge, chin, eye sockets) and functions reliably with standard prescription spectacles. Avoid direct glare or reflections bouncing off the lenses into the webcam.',
    },
    {
      q: 'How do I immediately pause or exit a game?',
      a: 'Press the Escape key (Esc) or P on your keyboard at any moment. Active gameplay will immediately freeze, and an emergency menu will give you options to resume, recalibrate, or return to the main catalog.',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
      {/* Page Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Badge status="info" size="sm" icon={<HelpCircleIcon size={14} />}>
            Self-Service Knowledge Base
          </Badge>
          <Badge status="neutral" size="sm">
            Diagnostics
          </Badge>
        </div>
        <h1 style={{ fontSize: '2.25rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
          Help & Troubleshooting
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: '780px' }}>
          Step-by-step diagnostic advice, browser troubleshooting, and answers to common setup questions.
        </p>
      </div>

      {/* 4-Step Quick Diagnostic Guide */}
      <section aria-labelledby="quickstart-heading">
        <h2 id="quickstart-heading" style={{ fontSize: '1.5rem', color: 'var(--color-deep-blue)', marginBottom: '16px' }}>
          Quick Setup Checklist
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <Card variant="surface">
            <h3 style={{ fontSize: '1.05rem', color: 'var(--color-deep-blue)', marginBottom: '6px' }}>
              1. Ambient Lighting
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Sit in a well-lit room with light illuminating your face. Avoid sitting with bright windows directly behind your head.
            </p>
          </Card>

          <Card variant="surface">
            <h3 style={{ fontSize: '1.05rem', color: 'var(--color-deep-blue)', marginBottom: '6px' }}>
              2. Camera Alignment
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Position the webcam approximately 50–70cm away, roughly level with your eyes or forehead for natural head pose tracking.
            </p>
          </Card>

          <Card variant="surface">
            <h3 style={{ fontSize: '1.05rem', color: 'var(--color-deep-blue)', marginBottom: '6px' }}>
              3. Neutral Baseline
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Do not strain your neck during calibration. Sit comfortably in your natural resting position before capturing baseline (0,0).
            </p>
          </Card>

          <Card variant="surface">
            <h3 style={{ fontSize: '1.05rem', color: 'var(--color-deep-blue)', marginBottom: '6px' }}>
              4. Emergency Escape
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Remember that the <code>Esc</code> key is your universal safety switch—instantly freezing any game or modal session.
            </p>
          </Card>
        </div>
      </section>

      {/* Interactive FAQ Accordion */}
      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" style={{ fontSize: '1.5rem', color: 'var(--color-deep-blue)', marginBottom: '16px' }}>
          Frequently Asked Questions
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx
            return (
              <Card
                key={idx}
                variant="bordered"
                style={{ padding: '16px 20px', cursor: 'pointer' }}
                onClick={() => setOpenFaq(isOpen ? null : idx)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.05rem', color: 'var(--color-deep-blue)' }}>
                    {faq.q}
                  </h3>
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: 'var(--color-primary-blue)',
                      transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                      transition: 'transform var(--transition-fast)',
                    }}
                  >
                    +
                  </span>
                </div>
                {isOpen && (
                  <p
                    style={{
                      marginTop: '12px',
                      fontSize: '0.95rem',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.6,
                      borderTop: '1px solid var(--color-border-subtle)',
                      paddingTop: '12px',
                    }}
                  >
                    {faq.a}
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      </section>

      {/* Academic Project Context */}
      <section>
        <Alert type="info" title="Academic Coursework Support Note">
          GazeMouse-OS is an independent academic coursework submission developed for university evaluation. For technical grading or examination inquiries, refer to the project repository's <code>docs/</code> directory and accompanying implementation documentation.
        </Alert>
      </section>
    </div>
  )
}

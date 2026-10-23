import React from 'react'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { Alert } from '../components/common/Alert'
import { AccessibilityIcon } from '../components/common/Icons'

export const AccessibilityPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
      {/* Page Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Badge status="info" size="sm" icon={<AccessibilityIcon size={14} />}>
            Designed to WCAG 2.1 AA Principles
          </Badge>
          <Badge status="info" size="sm">
            Accessibility First
          </Badge>
        </div>
        <h1 style={{ fontSize: '2.25rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
          Accessibility Statement & Controls Guide
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: '780px' }}>
          Our architectural commitment to inclusive digital gaming, sensory ergonomics, and transparent operational boundaries.
        </p>
      </div>

      {/* Core Principles Section */}
      <section aria-labelledby="principles-heading">
        <h2 id="principles-heading" style={{ fontSize: '1.6rem', color: 'var(--color-deep-blue)', marginBottom: '20px' }}>
          Built-In Assistive Features
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <Card variant="surface">
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
              High-Contrast Visuals
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              All text passes WCAG AA contrast thresholds (greater than 4.5:1 for normal text, greater than 16:1 for main body text). Color is never the sole indicator of status—icons and textual labels accompany every alert.
            </p>
          </Card>

          <Card variant="surface">
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
              Visible Focus Indicators
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Every interactive element, button, slider, and link features an unmistakable 3px Royal Blue focus ring (`#2563EB`) with offset, ensuring seamless navigation for keyboard-only users.
            </p>
          </Card>

          <Card variant="surface">
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
              Cervical Fatigue Safety
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Games require gentle turns ($\approx 8^\circ - 12^\circ$), never demanding extreme neck rotation. Dead zones allow resting without input misfires, and vertical gestures are disabled by default.
            </p>
          </Card>

          <Card variant="surface">
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
              Reduced-Motion Support
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Respects the operating system's <code>prefers-reduced-motion</code> setting and offers an explicit toggle in Settings to halt non-essential animations, transforms, and particle effects.
            </p>
          </Card>
        </div>
      </section>

      {/* Full Keyboard Alternative Reference Table */}
      <section aria-labelledby="keyboard-heading">
        <h2 id="keyboard-heading" style={{ fontSize: '1.6rem', color: 'var(--color-deep-blue)', marginBottom: '16px' }}>
          Universal Keyboard Mapping Reference
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          If head tracking is unavailable or fatiguing, every interface control and game can be operated entirely via standard keyboard inputs:
        </p>

        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--color-light-blue)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px 16px', color: 'var(--color-deep-blue)', fontWeight: 700 }}>Context</th>
                <th style={{ padding: '12px 16px', color: 'var(--color-deep-blue)', fontWeight: 700 }}>Key Combination</th>
                <th style={{ padding: '12px 16px', color: 'var(--color-deep-blue)', fontWeight: 700 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>Global Navigation</td>
                <td style={{ padding: '12px 16px' }}><kbd style={kbdStyle}>Tab</kbd> / <kbd style={kbdStyle}>Shift + Tab</kbd></td>
                <td style={{ padding: '12px 16px' }}>Move focus sequentially through interactive controls</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>Activation</td>
                <td style={{ padding: '12px 16px' }}><kbd style={kbdStyle}>Enter</kbd> / <kbd style={kbdStyle}>Space</kbd></td>
                <td style={{ padding: '12px 16px' }}>Activate button, link, or toggle switch</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>Emergency Control</td>
                <td style={{ padding: '12px 16px' }}><kbd style={kbdStyle}>Escape</kbd> / <kbd style={kbdStyle}>P</kbd></td>
                <td style={{ padding: '12px 16px' }}>Immediately pause active game or close modal dialogue</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>Gaze Runner</td>
                <td style={{ padding: '12px 16px' }}><kbd style={kbdStyle}>←</kbd> / <kbd style={kbdStyle}>A</kbd> or <kbd style={kbdStyle}>→</kbd> / <kbd style={kbdStyle}>D</kbd></td>
                <td style={{ padding: '12px 16px' }}>Shift character left or right one lane</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>Gaze Match</td>
                <td style={{ padding: '12px 16px' }}><kbd style={kbdStyle}>Arrow Keys</kbd></td>
                <td style={{ padding: '12px 16px' }}>Step grid selection box between puzzle tiles</td>
              </tr>
              <tr>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>Gaze Match Swap</td>
                <td style={{ padding: '12px 16px' }}><kbd style={kbdStyle}>Space</kbd> / <kbd style={kbdStyle}>Enter</kbd></td>
                <td style={{ padding: '12px 16px' }}>Pick up selected tile and confirm adjacent swap</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Honest Limitations & Transparent Disclosures */}
      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading" style={{ fontSize: '1.6rem', color: 'var(--color-deep-blue)', marginBottom: '16px' }}>
          Honest Accessibility Boundaries & Limitations
        </h2>

        <Alert type="warning" title="What GazeMouse-OS Cannot Do">
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            <li>
              <strong>Total Cervical Paralysis:</strong> This application relies on voluntary head movement. It cannot substitute for specialized commercial eye-tracking systems for individuals with total neck immobility.
            </li>
            <li>
              <strong>Severe Involuntary Tremor:</strong> While our Exponential Moving Average filter dampens mild tremors, severe spasticity may exceed filter bounds and cause unintended input triggers.
            </li>
            <li>
              <strong>Lighting Dependability:</strong> Standard webcams require adequate, even ambient lighting. In severe darkness or high-contrast backlighting, landmark tracking may become unreliable or pause.
            </li>
            <li>
              <strong>Keyboard Reliance:</strong> Providing keyboard alternatives does not make the application universally accessible to gamers who cannot use keyboards. It serves as an assistive fallback option.
            </li>
          </ul>
        </Alert>
      </section>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  padding: '2px 6px',
  fontFamily: 'var(--font-family-mono)',
  fontSize: '0.85rem',
  fontWeight: 700,
  boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
}

import React from 'react'
import type { PageId } from '../types/navigation'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { Alert } from '../components/common/Alert'
import { CameraIcon, GamepadIcon, EyeGazeIcon } from '../components/common/Icons'

interface HomePageProps {
  onNavigate: (page: PageId) => void
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
      {/* Hero Section */}
      <section
        style={{
          backgroundColor: 'var(--color-light-blue)',
          border: '1px solid var(--color-light-blue-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-3xl) var(--space-xl)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <Badge status="info" size="md" icon={<EyeGazeIcon size={16} />}>
            Webcam-Powered Accessible Gaming
          </Badge>
          <Badge status="neutral" size="md">
            Java Coursework Demo
          </Badge>
        </div>

        <h1
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.25rem)',
            fontWeight: 800,
            color: 'var(--color-deep-blue)',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            maxWidth: '850px',
          }}
        >
          Your movement. Your game. <br />
          <span style={{ color: 'var(--color-primary-blue)' }}>Your freedom.</span>
        </h1>

        <p
          style={{
            fontSize: '1.2rem',
            color: 'var(--color-text-secondary)',
            maxWidth: '680px',
            lineHeight: 1.6,
          }}
        >
          GazeMouse-OS empowers players with limited hand or arm movement to play original games using comfortable, customizable head gestures detected locally through your webcam.
        </p>

        {/* Primary Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '16px',
            marginTop: '12px',
          }}
        >
          <Button
            size="lg"
            variant="primary"
            icon={<GamepadIcon size={20} />}
            onClick={() => onNavigate('games')}
          >
            Explore Games
          </Button>

          <Button
            size="lg"
            variant="outline"
            icon={<CameraIcon size={20} />}
            onClick={() => onNavigate('setup')}
          >
            Set Up Camera
          </Button>
        </div>

        {/* Quick Privacy Notice */}
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span aria-hidden="true">🔒</span>
          Camera remains OFF until explicitly started. All vision processing occurs 100% on-device in your browser.
        </p>
      </section>

      {/* 3-Step Guided Funnel */}
      <section aria-labelledby="how-to-start-heading">
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 id="how-to-start-heading" style={{ fontSize: '1.85rem', marginBottom: '8px' }}>
            Getting Started in Three Steps
          </h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            A smooth, pressure-free journey designed for physical comfort and accessibility.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          {/* Step 1 */}
          <Card variant="surface">
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-blue)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.1rem',
                marginBottom: '16px',
              }}
            >
              1
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--color-deep-blue)' }}>
              Set Up & Calibrate
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
              Enable your webcam with a single click and capture your comfortable neutral resting head position.
            </p>
          </Card>

          {/* Step 2 */}
          <Card variant="surface">
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-blue)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.1rem',
                marginBottom: '16px',
              }}
            >
              2
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--color-deep-blue)' }}>
              Practise Controls
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
              Test your comfortable turn angles and adjust movement sensitivity, smoothing, and dead zones in real time.
            </p>
          </Card>

          {/* Step 3 */}
          <Card variant="surface">
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-blue)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.1rem',
                marginBottom: '16px',
              }}
            >
              3
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--color-deep-blue)' }}>
              Play & Compete
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
              Jump into Gaze Runner or Gaze Match with robust auto-pause protection and persistent score tracking.
            </p>
          </Card>
        </div>
      </section>

      {/* Featured Games Section */}
      <section aria-labelledby="featured-games-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 id="featured-games-heading" style={{ fontSize: '1.85rem', marginBottom: '4px' }}>
              Original Accessible Games
            </h2>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Engineered specifically for head gesture interaction and keyboard accessibility.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onNavigate('games')}>
            View All Games →
          </Button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
          }}
        >
          {/* Game 1: Gaze Runner */}
          <Card variant="bordered" interactive onClick={() => onNavigate('games')}>
            <div
              style={{
                height: '140px',
                backgroundColor: 'var(--color-light-blue)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                position: 'relative',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '2.5rem' }}>🏃💨</span>
                <div style={{ fontWeight: 700, color: 'var(--color-deep-blue)', marginTop: '4px' }}>
                  3-Lane Endless Runner
                </div>
              </div>
              <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                <Badge status="info" size="sm">
                  Lateral Head Turns
                </Badge>
              </div>
            </div>

            <h3 style={{ fontSize: '1.35rem', marginBottom: '8px' }}>Gaze Runner</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', marginBottom: '16px', lineHeight: 1.5 }}>
              Dodge hurdles and collect energy coins by shifting left or right with gentle head turns. Generous lane hitboxes ensure a forgiving, fatigue-safe experience.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Fatigue Rating: Low • Discrete Turns
              </span>
              <span style={{ color: 'var(--color-primary-blue)', fontWeight: 700, fontSize: '0.9rem' }}>
                Learn More →
              </span>
            </div>
          </Card>

          {/* Game 2: Gaze Match */}
          <Card variant="bordered" interactive onClick={() => onNavigate('games')}>
            <div
              style={{
                height: '140px',
                backgroundColor: 'var(--color-light-blue)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                position: 'relative',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '2.5rem' }}>🧩✨</span>
                <div style={{ fontWeight: 700, color: 'var(--color-deep-blue)', marginTop: '4px' }}>
                  8x8 Match-3 Puzzle
                </div>
              </div>
              <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                <Badge status="info" size="sm">
                  Dwell Cursor / Hold
                </Badge>
              </div>
            </div>

            <h3 style={{ fontSize: '1.35rem', marginBottom: '8px' }}>Gaze Match</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', marginBottom: '16px', lineHeight: 1.5 }}>
              Align vibrant geometric shapes using a smooth virtual head cursor and hold-to-select dwell triggers. Eliminates physical mouse clicking entirely.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Fatigue Rating: Low-Medium • Configurable Dwell
              </span>
              <span style={{ color: 'var(--color-primary-blue)', fontWeight: 700, fontSize: '0.9rem' }}>
                Learn More →
              </span>
            </div>
          </Card>
        </div>
      </section>

      {/* Accessibility & Honest Limitations Alert */}
      <section>
        <Alert
          type="info"
          title="Assistive Design Notice & Scope Limitations"
          action={
            <Button size="sm" variant="outline" onClick={() => onNavigate('accessibility')}>
              Read Full Statement
            </Button>
          }
        >
          GazeMouse-OS is designed to expand gaming accessibility for individuals with hand or arm mobility differences. However, webcam head tracking requires adequate lighting and functional cervical neck movement. It is not an eye-tracking replacement for total neck paralysis. Comprehensive keyboard alternatives are provided throughout the application.
        </Alert>
      </section>
    </div>
  )
}

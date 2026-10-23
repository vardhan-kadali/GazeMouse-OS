import React from 'react'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { Alert } from '../components/common/Alert'
import { CpuIcon } from '../components/common/Icons'

export const HowItWorksPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
      {/* Page Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Badge status="info" size="sm" icon={<CpuIcon size={14} />}>
            Computer Vision Architecture
          </Badge>
          <Badge status="neutral" size="sm">
            Technical Pipeline
          </Badge>
        </div>
        <h1 style={{ fontSize: '2.25rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
          How GazeMouse-OS Works
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: '780px' }}>
          Understanding the real-time optical tracking pipeline: from video frame capture to accessible game input.
        </p>
      </div>

      {/* Critical Clarification Callout */}
      <Alert
        type="warning"
        title="Head Tracking vs. True Eye-Gaze Tracking"
      >
        <strong>Technical Distinction:</strong> GazeMouse-OS detects comfortable <em>head movements and head pose orientation</em> through standard webcams. It does <em>not</em> perform infrared pupil-reflection eye-gaze tracking. True eye-gaze tracking requires specialized high-frequency corneal hardware and per-user focal calibration. We intentionally track head pose to provide high reliability, zero hardware cost, and broad compatibility on everyday laptops.
      </Alert>

      {/* 5-Step Visual Pipeline */}
      <section aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading" style={{ fontSize: '1.6rem', color: 'var(--color-deep-blue)', marginBottom: '24px' }}>
          The 5-Stage Interaction Pipeline
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Stage 1 */}
          <Card variant="surface">
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-blue)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  flexShrink: 0,
                }}
              >
                1
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)' }}>
                    Local Video Capture (WebRTC)
                  </h3>
                  <Badge status="info" size="sm">
                    Client-Side Only
                  </Badge>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>
                  Once the user explicitly presses "Enable Camera", the browser requests video frames using the HTML5 <code>navigator.mediaDevices.getUserMedia</code> API at 30 to 60 frames per second. Video frames reside strictly within browser memory and are never transmitted across any network socket or sent to the backend.
                </p>
              </div>
            </div>
          </Card>

          {/* Stage 2 */}
          <Card variant="surface">
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-blue)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  flexShrink: 0,
                }}
              >
                2
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)' }}>
                    MediaPipe Face Landmark Inference
                  </h3>
                  <Badge status="info" size="sm">
                    WebAssembly & WebGL
                  </Badge>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>
                  Each frame is processed locally using the lightweight MediaPipe Face Landmarker model. The neural network predicts 478 3D landmark coordinates in real time. Key anchor points—including the nose tip (index 1), outer eye corners (33 and 263), and chin (152)—are extracted to estimate relative head yaw and pitch.
                </p>
              </div>
            </div>
          </Card>

          {/* Stage 3 */}
          <Card variant="surface">
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-blue)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  flexShrink: 0,
                }}
              >
                3
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)' }}>
                    Baseline Delta & Normalization
                  </h3>
                  <Badge status="success" size="sm">
                    Personalized Baseline
                  </Badge>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>
                  Rather than assuming an ideal camera angle, calibration captures the user's natural resting head pose as baseline (0,0). Subsequent coordinates are computed as relative vectors:
                  <code style={{ display: 'inline-block', backgroundColor: 'var(--color-bg-surface-elevated)', padding: '2px 6px', margin: '4px', borderRadius: '4px', fontWeight: 600 }}>
                    ΔX = Current_Nose_X - Neutral_Nose_X
                  </code>.
                  Displacements are normalized by inter-pupillary distance so leaning closer or further from the webcam does not distort sensitivity.
                </p>
              </div>
            </div>
          </Card>

          {/* Stage 4 */}
          <Card variant="surface">
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-blue)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  flexShrink: 0,
                }}
              >
                4
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)' }}>
                    Dead-Zone & Exponential Smoothing
                  </h3>
                  <Badge status="info" size="sm">
                    Fatigue & Tremor Reduction
                  </Badge>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>
                  To prevent accidental activations from small involuntary head tremors, an adjustable dead zone (default 10%) ignores small resting deviations. An Exponential Moving Average filter (EMA) smooths sensor noise, and a hysteresis return-to-center cooldown prevents accidental double triggers.
                </p>
              </div>
            </div>
          </Card>

          {/* Stage 5 */}
          <Card variant="surface">
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-blue)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  flexShrink: 0,
                }}
              >
                5
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)' }}>
                    Game Control & Score Transmission
                  </h3>
                  <Badge status="success" size="sm">
                    Integrated System
                  </Badge>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>
                  Filtered signals are translated into game actions: discrete lane changes in <em>Gaze Runner</em> or floating cursor coordinates and dwell-hold selections in <em>Gaze Match</em>. When a game ends, the score is validated and submitted via REST to the Java Spring Boot service for persistent local storage in H2.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Technology Stack Breakdown */}
      <section aria-labelledby="tech-stack-heading">
        <h2 id="tech-stack-heading" style={{ fontSize: '1.6rem', color: 'var(--color-deep-blue)', marginBottom: '16px' }}>
          Coursework Technology Breakdown
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <Card variant="bordered">
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
              Frontend Client
            </h3>
            <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <li>React 19 with strict TypeScript</li>
              <li>Vite development server (port 5173)</li>
              <li>Vanilla CSS Design Tokens (Tokens.css)</li>
              <li>HTML5 2D Canvas Game Loops</li>
            </ul>
          </Card>

          <Card variant="bordered">
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
              Computer Vision
            </h3>
            <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <li>Google MediaPipe Face Landmarker</li>
              <li>478 3D facial mesh points</li>
              <li>WebAssembly & WebGL acceleration</li>
              <li>100% On-Device local execution</li>
            </ul>
          </Card>

          <Card variant="bordered">
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
              Java Backend (Phase 5)
            </h3>
            <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <li>Spring Boot 3 with Maven Wrapper</li>
              <li>Spring Data JPA & Entity Models</li>
              <li>Persistent File-Based H2 Database</li>
              <li>Bean Validation & JUnit 5 Tests</li>
            </ul>
          </Card>
        </div>
      </section>
    </div>
  )
}

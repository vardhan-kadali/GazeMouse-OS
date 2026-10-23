import React, { useState, Suspense } from 'react'
import type { PageId } from '../types/navigation'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { Alert } from '../components/common/Alert'
import { GamepadIcon, CameraIcon, CloseIcon } from '../components/common/Icons'
import { GazeRunner } from '../games/runner/GazeRunner'
import { GazeMatch } from '../games/match/GazeMatch'
import { SubwaySurfersBridgeController } from '../games/external/SubwaySurfersBridgeController'

const Gaze3DRunner = React.lazy(() => import('../games/runner3d/Gaze3DRunner'))

interface GamesPageProps {
  onNavigate?: (page: PageId) => void
}

export const GamesPage: React.FC<GamesPageProps> = ({ onNavigate = () => {} }) => {
  const [selectedGameModal, setSelectedGameModal] = useState<'runner' | 'match' | 'runner3d' | 'subway-bridge' | null>(null)
  const [activeGame, setActiveGame] = useState<'runner' | 'match' | 'runner3d' | 'subway-bridge' | null>(null)

  if (activeGame === 'runner') {
    return (
      <GazeRunner
        onExit={() => setActiveGame(null)}
        onNavigateToSetup={() => onNavigate('setup')}
      />
    )
  }

  if (activeGame === 'match') {
    return (
      <GazeMatch
        onExit={() => setActiveGame(null)}
        onNavigateToSetup={() => onNavigate('setup')}
      />
    )
  }

  if (activeGame === 'runner3d') {
    return (
      <Suspense
        fallback={
          <Card variant="bordered" style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🚅⚡</div>
            <h2 style={{ fontSize: '1.4rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
              Loading Gaze 3D Runner...
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
              Initializing Three.js WebGL rendering engine...
            </p>
          </Card>
        }
      >
        <Gaze3DRunner
          onExit={() => setActiveGame(null)}
          onNavigateToSetup={() => onNavigate('setup')}
        />
      </Suspense>
    )
  }

  if (activeGame === 'subway-bridge') {
    return (
      <SubwaySurfersBridgeController
        onExit={() => setActiveGame(null)}
        onNavigateToSetup={() => onNavigate('setup')}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Page Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Badge status="info" size="sm" icon={<GamepadIcon size={14} />}>
            Interactive Game Catalog
          </Badge>
          <Badge status="neutral" size="sm">
            Phase 1 Overview
          </Badge>
        </div>
        <h1 style={{ fontSize: '2.25rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
          Accessible Games Catalog
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: '750px' }}>
          Choose from two original, accessible games designed specifically for comfortable head-movement interaction and keyboard alternatives.
        </p>
      </div>

      {/* Pre-requisite notice */}
      <Alert
        type="info"
        title="Camera Setup Recommended Before Playing"
        action={
          <Button size="sm" variant="outline" onClick={() => onNavigate('setup')}>
            Go to Camera Setup
          </Button>
        }
      >
        To play using head gestures, you will calibrate your neutral resting position in Camera Setup. Playable Canvas engines will be unlocked in Phase 3 (Gaze Runner) and Phase 4 (Gaze Match) after the tracking pipeline is integrated.
      </Alert>

      {/* 2-Column Game Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '32px',
        }}
      >
        {/* Game 1: Gaze Runner Card */}
        <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Visual Header Thumbnail */}
          <div
            style={{
              height: '180px',
              backgroundColor: 'var(--color-light-blue)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              border: '1px solid var(--color-light-blue-border)',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: '3.5rem' }}>🏃💨</div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep-blue)', fontSize: '1.1rem', marginTop: '6px' }}>
              GAZE RUNNER
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <Badge status="success" size="sm">
                Phase 3 Engine
              </Badge>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 0 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '1.5rem', color: 'var(--color-deep-blue)' }}>Gaze Runner</h2>
              <Badge status="info" size="sm">
                Endless Runner
              </Badge>
            </div>

            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '16px' }}>
              An original endless runner on a 3-lane track. Shift between lanes by turning your head gently left or right. Collect power tokens, avoid static hurdles, and climb the persistent leaderboard.
            </p>

            {/* Spec Details Table */}
            <div
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Primary Input:</span>
                <strong style={{ color: 'var(--color-deep-blue)' }}>Lateral Head Turns (Yaw)</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Motion Intensity:</span>
                <strong style={{ color: 'var(--color-success)' }}>Low (Discrete Shifts)</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Keyboard Fallback:</span>
                <strong style={{ color: 'var(--color-text-main)' }}>Left / Right / A / D</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Auto-Pause:</span>
                <strong style={{ color: 'var(--color-success)' }}>Enabled on Face Loss</strong>
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                style={{ flex: 1.6 }}
                onClick={() => setActiveGame('runner')}
              >
                Play Gaze Runner
              </Button>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onClick={() => setSelectedGameModal('runner')}
              >
                Details
              </Button>
              <Button
                variant="secondary"
                icon={<CameraIcon size={18} />}
                onClick={() => onNavigate('setup')}
              >
                Setup
              </Button>
            </div>
          </div>
        </Card>

        {/* Game 2: Gaze Match Card */}
        <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Visual Header Thumbnail */}
          <div
            style={{
              height: '180px',
              backgroundColor: 'var(--color-light-blue)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              border: '1px solid var(--color-light-blue-border)',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: '3.5rem' }}>🧩✨</div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep-blue)', fontSize: '1.1rem', marginTop: '6px' }}>
              GAZE MATCH
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <Badge status="success" size="sm">
                Phase 4 Engine
              </Badge>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 0 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '1.5rem', color: 'var(--color-deep-blue)' }}>Gaze Match</h2>
              <Badge status="info" size="sm">
                Match-3 Puzzle
              </Badge>
            </div>

            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '16px' }}>
              An 8x8 match-3 puzzle game. Move a responsive virtual cursor with subtle head deflections and hold over any tile to dwell-select it. Move to an adjacent neighbor to complete the swap.
            </p>

            {/* Spec Details Table */}
            <div
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Primary Input:</span>
                <strong style={{ color: 'var(--color-deep-blue)' }}>Virtual Cursor + Dwell</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Motion Intensity:</span>
                <strong style={{ color: 'var(--color-warning)' }}>Low-Med (Hold Timing)</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Keyboard Fallback:</span>
                <strong style={{ color: 'var(--color-text-main)' }}>Arrows + Spacebar</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Colorblind Ready:</span>
                <strong style={{ color: 'var(--color-success)' }}>Distinct Shapes + Colors</strong>
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                style={{ flex: 1.6 }}
                onClick={() => setActiveGame('match')}
              >
                Play Gaze Match
              </Button>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onClick={() => setSelectedGameModal('match')}
              >
                Details
              </Button>
              <Button
                variant="secondary"
                icon={<CameraIcon size={18} />}
                onClick={() => onNavigate('setup')}
              >
                Setup
              </Button>
            </div>
          </div>
        </Card>

        {/* Game 3: Gaze 3D Runner Card */}
        <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Visual Header Thumbnail */}
          <div
            style={{
              height: '180px',
              backgroundColor: '#090d16',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              border: '1px solid var(--color-primary-blue)',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: '3.5rem' }}>🚅⚡</div>
            <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '1.1rem', marginTop: '6px' }}>
              GAZE 3D RUNNER
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <Badge status="info" size="sm">
                Phase 5 (Three.js)
              </Badge>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 0 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '1.5rem', color: 'var(--color-deep-blue)' }}>Gaze 3D Runner</h2>
              <Badge status="info" size="sm">
                3D Endless Runner
              </Badge>
            </div>

            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '16px' }}>
              An original 3D endless runner set on a futuristic Cyber Subway corridor. Shift across 3 perspective tracks with gentle lateral head turns. Dodge transit pods, hop barriers, and collect energy coins with guaranteed safe routes.
            </p>

            {/* Spec Details Table */}
            <div
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Primary Input:</span>
                <strong style={{ color: 'var(--color-deep-blue)' }}>Lateral Turns (Yaw)</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>3D Rendering:</span>
                <strong style={{ color: 'var(--color-primary-blue)' }}>Vanilla Three.js</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Keyboard & Touch:</span>
                <strong style={{ color: 'var(--color-text-main)' }}>Arrows / A, D, W, S</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Safe Passage:</span>
                <strong style={{ color: 'var(--color-success)' }}>1+ Guaranteed Lane</strong>
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                style={{ flex: 1.6 }}
                onClick={() => setActiveGame('runner3d')}
              >
                Play Gaze 3D Runner
              </Button>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onClick={() => setSelectedGameModal('runner3d')}
              >
                Details
              </Button>
              <Button
                variant="secondary"
                icon={<CameraIcon size={18} />}
                onClick={() => onNavigate('setup')}
              >
                Setup
              </Button>
            </div>
          </div>
        </Card>

        {/* Game 4: Official Subway Surfers Desktop Bridge Card */}
        <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Visual Header Thumbnail */}
          <div
            style={{
              height: '180px',
              backgroundColor: '#1e1b4b',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              border: '1px solid #4f46e5',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: '3.5rem' }}>🛹🚇</div>
            <div style={{ fontWeight: 800, color: '#a5b4fc', fontSize: '1.1rem', marginTop: '6px' }}>
              OFFICIAL SUBWAY SURFERS
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <Badge status="info" size="sm">
                Phase 4 Bridge
              </Badge>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 0 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '1.5rem', color: 'var(--color-deep-blue)' }}>Subway Surfers (Desktop Bridge)</h2>
              <Badge status="neutral" size="sm">
                External Mode
              </Badge>
            </div>

            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '16px' }}>
              Control the genuine Subway Surfers web game (running on Poki in a separate window) using your calibrated head movements via the local Desktop Input Bridge.
            </p>

            {/* Spec Details Table */}
            <div
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Primary Input:</span>
                <strong style={{ color: 'var(--color-deep-blue)' }}>Lateral Turns / Jump / Slide</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Injection Target:</span>
                <strong style={{ color: 'var(--color-primary-blue)' }}>Genuine Game Window</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Connection:</span>
                <strong style={{ color: 'var(--color-text-main)' }}>ws://127.0.0.1:8765</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Safety Guard:</span>
                <strong style={{ color: 'var(--color-success)' }}>Ctrl+Alt+Q Emergency Stop</strong>
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                style={{ flex: 1.6 }}
                onClick={() => setActiveGame('subway-bridge')}
              >
                Play External Mode
              </Button>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onClick={() => setSelectedGameModal('subway-bridge')}
              >
                Details
              </Button>
              <Button
                variant="secondary"
                icon={<CameraIcon size={18} />}
                onClick={() => onNavigate('setup')}
              >
                Setup
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Modal Dialog for Game Details */}
      {selectedGameModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 100,
          }}
          onClick={() => setSelectedGameModal(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-surface-elevated)',
              border: '2px solid var(--color-primary-blue)',
              borderRadius: 'var(--radius-xl)',
              maxWidth: '580px',
              width: '100%',
              padding: '28px',
              boxShadow: 'var(--shadow-lg)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 id="game-modal-title" style={{ fontSize: '1.4rem', color: 'var(--color-deep-blue)' }}>
                {selectedGameModal === 'runner'
                  ? 'Gaze Runner — Mechanics & Controls'
                  : selectedGameModal === 'match'
                  ? 'Gaze Match — Mechanics & Controls'
                  : selectedGameModal === 'runner3d'
                  ? 'Gaze 3D Runner — Mechanics & Controls'
                  : 'Official Subway Surfers — Bridge Mechanics & Safety'}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedGameModal(null)}
                aria-label="Close dialog"
                style={{ padding: '6px', borderRadius: 'var(--radius-sm)' }}
              >
                <CloseIcon size={20} />
              </button>
            </div>

            {selectedGameModal === 'runner' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.95rem' }}>
                <p>
                  <strong>Objective:</strong> Survive the oncoming obstacle track for as long as possible while gathering floating blue energy tokens.
                </p>
                <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ color: 'var(--color-deep-blue)', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Control Mechanics:
                  </h4>
                  <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li><strong>Turn Head Left:</strong> Shifts character one lane left.</li>
                    <li><strong>Turn Head Right:</strong> Shifts character one lane right.</li>
                    <li><strong>Return to Neutral:</strong> Required before another turn gesture can trigger.</li>
                    <li><strong>Keyboard Keys:</strong> Left/Right Arrows or A/D keys shift lanes.</li>
                    <li><strong>Emergency Pause:</strong> Press <code>Esc</code> or <code>P</code> at any time.</li>
                  </ul>
                </div>
                <Alert type="info">
                  The playable HTML5 Canvas runner loop will be implemented in Phase 3.
                </Alert>
              </div>
            ) : selectedGameModal === 'match' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.95rem' }}>
                <p>
                  <strong>Objective:</strong> Form lines of 3 or more matching geometric tiles to score points within a move limit.
                </p>
                <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ color: 'var(--color-deep-blue)', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Control Mechanics:
                  </h4>
                  <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li><strong>Head Cursor:</strong> Damped pointer follows head movement relative to neutral baseline.</li>
                    <li><strong>Dwell Selection:</strong> Hovering over a tile for 1.2s selects it (with a visual radial pie timer).</li>
                    <li><strong>Adjacent Swap:</strong> Hovering over an adjacent tile triggers the swap.</li>
                    <li><strong>Keyboard Navigation:</strong> Arrow keys navigate tiles; Space/Enter selects.</li>
                    <li><strong>Emergency Pause:</strong> Press <code>Esc</code> or <code>P</code> at any time.</li>
                  </ul>
                </div>
                <Alert type="info">
                  The playable HTML5 Canvas match-3 engine will be implemented in Phase 4.
                </Alert>
              </div>
            ) : selectedGameModal === 'runner3d' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.95rem' }}>
                <p>
                  <strong>Objective:</strong> Pilot an original cyber hover-runner along an endless 3-track subway viaduct. Evade approaching mag-trains, hop low laser barriers, and gather energy coins.
                </p>
                <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ color: 'var(--color-deep-blue)', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Control Mechanics & Accessibility Guarantee:
                  </h4>
                  <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li><strong>Turn Head Left:</strong> Shifts craft to the left track.</li>
                    <li><strong>Turn Head Right:</strong> Shifts craft to the right track.</li>
                    <li><strong>Guaranteed Safe Passage:</strong> Every wave leaves at least 1 track completely open. Complete runs are achievable with lateral head turns alone!</li>
                    <li><strong>Bonus Jump:</strong> Up Arrow / W / on-screen Jump button leaps over low hurdles.</li>
                    <li><strong>Bonus Slide:</strong> Down Arrow / S / on-screen Slide button crouches under overhead arches.</li>
                    <li><strong>Tracking-Loss Safety:</strong> Game automatically pauses if face tracking is lost and requires explicit manual resume.</li>
                  </ul>
                </div>
                <Alert type="success">
                  Powered by Vanilla Three.js and the existing MediaPipe FaceLandmarker pipeline.
                </Alert>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.95rem' }}>
                <p>
                  <strong>Objective:</strong> Control the genuine, official Subway Surfers web game (running on Poki in a separate browser window) using your calibrated head movements via our local Desktop Input Bridge.
                </p>
                <div style={{ backgroundColor: 'var(--color-bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ color: 'var(--color-deep-blue)', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Control Mechanics & Safety Rules:
                  </h4>
                  <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li><strong>Turn Head Left:</strong> Sends a discrete Left Arrow key pulse to shift Jake left.</li>
                    <li><strong>Turn Head Right:</strong> Sends a discrete Right Arrow key pulse to shift Jake right.</li>
                    <li><strong>Neutral Return Hysteresis:</strong> You must return to your calibrated center position before another action can be sent.</li>
                    <li><strong>Emergency Stop:</strong> Press <code>Ctrl + Alt + Q</code> anywhere in Windows to instantly kill all input.</li>
                    <li><strong>Fail-Closed Safety:</strong> If face tracking is lost, calibration becomes invalid, or the browser tab is hidden, keyboard injection is immediately disabled.</li>
                  </ul>
                </div>
                <Alert type="warning">
                  Stopping head movements halts keystrokes to Windows, but does <strong>not automatically pause the external game</strong>. To pause Subway Surfers, click inside the game window and press <strong>Esc</strong>.
                </Alert>
              </div>
            )}

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <Button variant="outline" onClick={() => setSelectedGameModal(null)}>
                Close
              </Button>
              {selectedGameModal === 'runner' ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelectedGameModal(null)
                    setActiveGame('runner')
                  }}
                >
                  Play Gaze Runner
                </Button>
              ) : selectedGameModal === 'match' ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelectedGameModal(null)
                    setActiveGame('match')
                  }}
                >
                  Play Gaze Match
                </Button>
              ) : selectedGameModal === 'runner3d' ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelectedGameModal(null)
                    setActiveGame('runner3d')
                  }}
                >
                  Play Gaze 3D Runner
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelectedGameModal(null)
                    setActiveGame('subway-bridge')
                  }}
                >
                  Play External Mode
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

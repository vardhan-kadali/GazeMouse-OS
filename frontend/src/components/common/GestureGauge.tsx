import React from 'react'
import { Card } from './Card'
import { Badge } from './Badge'
import { useTracking } from '../../context/TrackingContext'
import { useSettings } from '../../context/SettingsContext'

export interface GestureGaugeProps {
  variant?: 'full' | 'compact'
  title?: string
  showBadge?: boolean
  showDescription?: boolean
  className?: string
  style?: React.CSSProperties
}

export const GestureGauge: React.FC<GestureGaugeProps> = ({
  variant = 'full',
  title = 'Real-Time Gesture Gauges',
  showBadge = true,
  showDescription = true,
  className = '',
  style = {},
}) => {
  const { trackingData } = useTracking()
  const { settings } = useSettings()

  // Strictly mutually exclusive gesture direction calculation.
  // Guarantees one unambiguous action at a time: never combine LEFT/RIGHT with DOWN/UP.
  let isLeftActive = false
  let isRightActive = false
  let isUpActive = false
  let isDownActive = false
  let isNeutralActive = trackingData.displacement.inDeadZone

  if (!isNeutralActive) {
    if (trackingData.action === 'LEFT') {
      isLeftActive = true
    } else if (trackingData.action === 'RIGHT') {
      isRightActive = true
    } else if (settings.verticalGestures && trackingData.action === 'UP') {
      isUpActive = true
    } else if (settings.verticalGestures && trackingData.action === 'DOWN') {
      isDownActive = true
    } else if (trackingData.action === 'NONE') {
      // Prioritize dominant axis to prevent lateral head turns from triggering vertical gauge indicators
      const absX = Math.abs(trackingData.displacement.deltaX)
      const absY = Math.abs(trackingData.displacement.deltaY)
      if (absX >= absY) {
        if (trackingData.displacement.deltaX < -0.12) {
          isLeftActive = true
        } else if (trackingData.displacement.deltaX > 0.12) {
          isRightActive = true
        } else {
          isNeutralActive = true
        }
      } else if (settings.verticalGestures) {
        if (trackingData.displacement.deltaY < -0.14) {
          isUpActive = true
        } else if (trackingData.displacement.deltaY > 0.14) {
          isDownActive = true
        } else {
          isNeutralActive = true
        }
      } else {
        isNeutralActive = true
      }
    }
  }

  const isCompact = variant === 'compact'

  return (
    <Card
      variant="bordered"
      className={className}
      style={{
        padding: isCompact ? '14px' : undefined,
        ...style,
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: isCompact ? '6px' : '8px',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <h2
          style={{
            fontSize: isCompact ? '1.05rem' : '1.25rem',
            color: 'var(--color-deep-blue)',
            margin: 0,
            fontWeight: 700,
          }}
        >
          {title}
        </h2>
        {showBadge && (
          trackingData.baseline ? (
            <Badge status="success" size="sm">
              Calibrated Baseline
            </Badge>
          ) : (
            <Badge status="neutral" size="sm">
              Uncalibrated
            </Badge>
          )
        )}
      </div>

      {/* Description text for full variant */}
      {showDescription && !isCompact && (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          Turn your head gently left or right. The corresponding target illuminates when your movement crosses the activation threshold.
        </p>
      )}

      {/* Directional Target Matrix with Live Lighting */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: isCompact ? '6px' : '12px',
          textAlign: 'center',
          margin: '0 auto',
          maxWidth: isCompact ? '260px' : '340px',
        }}
      >
        <div />
        {/* Up Target */}
        <div
          style={{
            padding: isCompact ? '8px 4px' : '12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isUpActive ? 'var(--color-primary-blue)' : 'var(--color-bg-surface)',
            color: isUpActive ? '#ffffff' : 'var(--color-text-muted)',
            border: isUpActive ? '2px solid var(--color-deep-blue)' : '1px solid var(--color-border)',
            fontSize: isCompact ? '0.75rem' : '0.85rem',
            fontWeight: isUpActive ? 800 : 600,
            transition: 'background-color var(--transition-fast)',
          }}
        >
          ▲ Up (Pitch)
          <span style={{ display: 'block', fontSize: isCompact ? '0.68rem' : '0.75rem', opacity: 0.85 }}>
            {settings.verticalGestures ? (isUpActive ? 'TRIGGER' : 'Ready') : 'Disabled'}
          </span>
        </div>
        <div />

        {/* Left Target */}
        <div
          style={{
            padding: isCompact ? '8px 4px' : '12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isLeftActive ? 'var(--color-primary-blue)' : 'var(--color-light-blue)',
            color: isLeftActive ? '#ffffff' : 'var(--color-deep-blue)',
            border: isLeftActive ? '2px solid var(--color-deep-blue)' : '1px solid var(--color-light-blue-border)',
            fontSize: isCompact ? '0.75rem' : '0.85rem',
            fontWeight: isLeftActive ? 800 : 700,
            transition: 'background-color var(--transition-fast)',
          }}
        >
          ◀ Left (Yaw)
          <span style={{ display: 'block', fontSize: isCompact ? '0.68rem' : '0.75rem', opacity: 0.85 }}>
            {isLeftActive ? 'TRIGGER' : 'Turn Left'}
          </span>
        </div>

        {/* Neutral Center Target */}
        <div
          style={{
            padding: isCompact ? '8px 4px' : '12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isNeutralActive ? 'var(--color-success-bg)' : 'var(--color-bg-surface-elevated)',
            border: isNeutralActive ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
            color: isNeutralActive ? 'var(--color-success)' : 'var(--color-text-muted)',
            fontSize: isCompact ? '0.75rem' : '0.85rem',
            fontWeight: 800,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color var(--transition-fast)',
          }}
        >
          <span>CENTER</span>
          <span style={{ fontSize: isCompact ? '0.65rem' : '0.7rem' }}>
            {isNeutralActive ? 'Dead Zone' : 'Deflected'}
          </span>
        </div>

        {/* Right Target */}
        <div
          style={{
            padding: isCompact ? '8px 4px' : '12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isRightActive ? 'var(--color-primary-blue)' : 'var(--color-light-blue)',
            color: isRightActive ? '#ffffff' : 'var(--color-deep-blue)',
            border: isRightActive ? '2px solid var(--color-deep-blue)' : '1px solid var(--color-light-blue-border)',
            fontSize: isCompact ? '0.75rem' : '0.85rem',
            fontWeight: isRightActive ? 800 : 700,
            transition: 'background-color var(--transition-fast)',
          }}
        >
          Right (Yaw) ▶
          <span style={{ display: 'block', fontSize: isCompact ? '0.68rem' : '0.75rem', opacity: 0.85 }}>
            {isRightActive ? 'TRIGGER' : 'Turn Right'}
          </span>
        </div>

        <div />
        {/* Down Target */}
        <div
          style={{
            padding: isCompact ? '8px 4px' : '12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isDownActive ? 'var(--color-primary-blue)' : 'var(--color-bg-surface)',
            color: isDownActive ? '#ffffff' : 'var(--color-text-muted)',
            border: isDownActive ? '2px solid var(--color-deep-blue)' : '1px solid var(--color-border)',
            fontSize: isCompact ? '0.75rem' : '0.85rem',
            fontWeight: isDownActive ? 800 : 600,
            transition: 'background-color var(--transition-fast)',
          }}
        >
          ▼ Down (Pitch)
          <span style={{ display: 'block', fontSize: isCompact ? '0.68rem' : '0.75rem', opacity: 0.85 }}>
            {settings.verticalGestures ? (isDownActive ? 'TRIGGER' : 'Ready') : 'Disabled'}
          </span>
        </div>
        <div />
      </div>

      {/* Numerical Telemetry Readout */}
      <div
        style={{
          marginTop: isCompact ? '12px' : '20px',
          padding: isCompact ? '8px 10px' : '12px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-bg-surface)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: isCompact ? '4px' : '8px',
          textAlign: 'center',
          fontSize: isCompact ? '0.75rem' : '0.8rem',
          fontFamily: 'var(--font-family-mono)',
        }}
      >
        <div>
          <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Delta X:</span>
          <strong>{trackingData.displacement.deltaX.toFixed(3)}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Delta Y:</span>
          <strong>{trackingData.displacement.deltaY.toFixed(3)}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Dead Zone:</span>
          <strong>{settings.deadZone}%</strong>
        </div>
      </div>
    </Card>
  )
}

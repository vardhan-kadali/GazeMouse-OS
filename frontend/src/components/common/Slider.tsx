import React from 'react'

export interface SliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  helpText?: string
  onChange: (value: number) => void
  disabled?: boolean
}

export const Slider: React.FC<SliderProps> = ({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  helpText,
  onChange,
  disabled = false,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label
          htmlFor={id}
          style={{ fontWeight: 600, color: 'var(--color-text-main)', fontSize: '0.95rem' }}
        >
          {label}
        </label>
        <span
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontWeight: 700,
            color: 'var(--color-deep-blue)',
            backgroundColor: 'var(--color-light-blue)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-light-blue-border)',
            fontSize: '0.9rem',
          }}
          aria-live="polite"
        >
          {value}
          {unit}
        </span>
      </div>

      <input
        type="range"
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: '8px',
          borderRadius: 'var(--radius-full)',
          accentColor: 'var(--color-primary-blue)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        aria-describedby={helpText ? `${id}-help` : undefined}
      />

      {helpText && (
        <p
          id={`${id}-help`}
          style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}
        >
          {helpText}
        </p>
      )}
    </div>
  )
}

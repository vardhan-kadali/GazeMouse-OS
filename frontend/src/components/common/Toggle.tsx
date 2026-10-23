import React from 'react'

export interface ToggleProps {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  helpText?: string
  disabled?: boolean
}

export const Toggle: React.FC<ToggleProps> = ({
  id,
  label,
  checked,
  onChange,
  helpText,
  disabled = false,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '12px 0',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      <div>
        <label
          htmlFor={id}
          style={{
            fontWeight: 600,
            color: 'var(--color-text-main)',
            fontSize: '0.95rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'block',
          }}
        >
          {label}
        </label>
        {helpText && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '2px', margin: 0 }}>
            {helpText}
          </p>
        )}
      </div>

      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          width: '52px',
          height: '28px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: checked ? 'var(--color-primary-blue)' : 'var(--color-border)',
          position: 'relative',
          padding: '2px',
          transition: 'background-color var(--transition-fast)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            width: '24px',
            height: '24px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: '#ffffff',
            transform: checked ? 'translateX(24px)' : 'translateX(0px)',
            transition: 'transform var(--transition-fast)',
            boxShadow: 'var(--shadow-sm)',
          }}
        />
        <span className="visually-hidden">{checked ? 'Enabled' : 'Disabled'}</span>
      </button>
    </div>
  )
}

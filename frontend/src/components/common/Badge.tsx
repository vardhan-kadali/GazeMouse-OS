import React from 'react'

export interface BadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  children: React.ReactNode
  size?: 'sm' | 'md'
  icon?: React.ReactNode
}

export const Badge: React.FC<BadgeProps> = ({
  status,
  children,
  size = 'md',
  icon,
}) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'success':
        return {
          bg: 'var(--color-success-bg)',
          color: 'var(--color-success)',
          border: 'var(--color-success-border)',
          defaultIcon: '✓',
        }
      case 'warning':
        return {
          bg: 'var(--color-warning-bg)',
          color: 'var(--color-warning)',
          border: 'var(--color-warning-border)',
          defaultIcon: '⚠',
        }
      case 'error':
        return {
          bg: 'var(--color-error-bg)',
          color: 'var(--color-error)',
          border: 'var(--color-error-border)',
          defaultIcon: '✕',
        }
      case 'info':
        return {
          bg: 'var(--color-info-bg)',
          color: 'var(--color-info)',
          border: 'var(--color-info-border)',
          defaultIcon: 'ℹ',
        }
      case 'neutral':
      default:
        return {
          bg: 'var(--color-bg-muted)',
          color: 'var(--color-text-secondary)',
          border: 'var(--color-border)',
          defaultIcon: '•',
        }
    }
  }

  const { bg, color, border, defaultIcon } = getStatusStyles()

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: size === 'sm' ? '2px 8px' : '4px 12px',
        fontSize: size === 'sm' ? '0.75rem' : '0.875rem',
        fontWeight: 600,
        borderRadius: 'var(--radius-full)',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '0.9em', fontWeight: 800 }}>
        {icon || defaultIcon}
      </span>
      <span>{children}</span>
    </span>
  )
}

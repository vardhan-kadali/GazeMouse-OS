import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'surface' | 'elevated' | 'bordered'
  interactive?: boolean
  selected?: boolean
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  interactive = false,
  selected = false,
  style,
  className = '',
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'surface':
        return {
          backgroundColor: 'var(--color-bg-surface)',
          border: selected ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-light-blue-border)',
        }
      case 'elevated':
        return {
          backgroundColor: 'var(--color-bg-surface-elevated)',
          border: selected ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-md)',
        }
      case 'bordered':
        return {
          backgroundColor: 'var(--color-bg-main)',
          border: selected ? '2px solid var(--color-primary-blue)' : '2px solid var(--color-border)',
        }
      case 'default':
      default:
        return {
          backgroundColor: 'var(--color-bg-surface)',
          border: selected ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }
    }
  }

  const baseStyles: React.CSSProperties = {
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-xl)',
    transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast)',
    cursor: interactive ? 'pointer' : 'default',
    position: 'relative',
    ...getVariantStyles(),
    ...style,
  }

  return (
    <div
      {...props}
      style={baseStyles}
      className={`gazemouse-card ${interactive ? 'interactive' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

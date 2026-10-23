import React from 'react'
import type { PageId } from '../../types/navigation'
import { NAV_ITEMS } from '../../types/navigation'
import { useSettings } from '../../context/SettingsContext'
import { useTracking } from '../../context/TrackingContext'
import { MenuIcon, EyeGazeIcon } from '../common/Icons'
import { Badge } from '../common/Badge'

interface HeaderBarProps {
  currentPage: PageId
  onToggleMobileMenu: () => void
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentPage,
  onToggleMobileMenu,
}) => {
  const { settings, updateSetting } = useSettings()
  const { trackingData, stopCamera, isCameraActive } = useTracking()
  const currentItem = NAV_ITEMS.find((item) => item.id === currentPage)

  const toggleTheme = () => {
    updateSetting('theme', settings.theme === 'light' ? 'dark' : 'light')
  }

  return (
    <header
      style={{
        height: 'var(--header-height)',
        backgroundColor: 'var(--color-bg-surface-elevated)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-lg)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        boxShadow: 'var(--shadow-sm)',
        transition: 'padding var(--transition-normal)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Mobile menu hamburger toggle */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Open navigation menu"
          className="mobile-hamburger-btn"
          style={{
            padding: '8px',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-deep-blue)',
            display: 'none', // Handled via responsive CSS
          }}
        >
          <MenuIcon size={24} />
        </button>

        {/* Breadcrumb / Current page info */}
        <div>
          <nav aria-label="Breadcrumb">
            <ol style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <li>
                <span style={{ color: 'var(--color-text-secondary)' }}>GazeMouse-OS</span>
              </li>
              <li aria-hidden="true" style={{ color: 'var(--color-border)' }}>/</li>
              <li>
                <span style={{ fontWeight: 700, color: 'var(--color-deep-blue)' }}>
                  {currentItem?.label || 'Home'}
                </span>
              </li>
            </ol>
          </nav>
        </div>
      </div>

      {/* Right Action Utilities */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Camera Status Badge */}
        {(() => {
          let statusType: 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'neutral'
          let label = 'Camera Standby'

          if (trackingData.status === 'ACTIVE') {
            statusType = 'success'
            label = trackingData.fps > 0 ? `Tracking (${trackingData.fps} FPS)` : 'Tracking Active'
          } else if (trackingData.status === 'TRACKING_LOST') {
            statusType = 'warning'
            label = 'Face Lost'
          } else if (trackingData.status === 'INITIALIZING') {
            statusType = 'info'
            label = 'Initializing...'
          } else if (trackingData.status === 'PERMISSION_DENIED') {
            statusType = 'error'
            label = 'Camera Blocked'
          } else if (trackingData.status === 'UNAVAILABLE') {
            statusType = 'error'
            label = 'No Camera'
          }

          return (
            <Badge status={statusType} size="sm" icon={<EyeGazeIcon size={14} />}>
              {label}
            </Badge>
          )
        })()}

        {/* Global Stop Camera Action when Active */}
        {isCameraActive && (
          <button
            type="button"
            onClick={stopCamera}
            aria-label="Stop active camera"
            title="Stop camera and release webcam"
            style={{
              padding: '6px 10px',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            Stop Camera
          </button>
        )}

        {/* Theme Quick Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${settings.theme === 'light' ? 'Dark' : 'Light'} theme`}
          title={`Switch to ${settings.theme === 'light' ? 'Dark' : 'Light'} theme`}
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-main)',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            minHeight: '38px',
          }}
        >
          <span aria-hidden="true">{settings.theme === 'light' ? '🌙' : '☀️'}</span>
          <span className="theme-toggle-label">{settings.theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
        </button>
      </div>
    </header>
  )
}

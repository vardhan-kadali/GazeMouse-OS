import React from 'react'
import type { PageId } from '../../types/navigation'
import { NAV_ITEMS } from '../../types/navigation'
import { useTracking } from '../../context/TrackingContext'
import {
  HomeIcon,
  GamepadIcon,
  CameraIcon,
  CpuIcon,
  SlidersIcon,
  AccessibilityIcon,
  HelpCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeGazeIcon,
  CloseIcon,
} from '../common/Icons'

interface SidebarProps {
  currentPage: PageId
  onNavigate: (page: PageId) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  isMobileOpen: boolean
  onCloseMobile: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { trackingData } = useTracking()

  const renderIcon = (iconName: string, isActive: boolean) => {
    const color = isActive ? '#ffffff' : 'var(--color-deep-blue)'
    switch (iconName) {
      case 'home':
        return <HomeIcon color={color} />
      case 'gamepad':
        return <GamepadIcon color={color} />
      case 'camera':
        return <CameraIcon color={color} />
      case 'cpu':
        return <CpuIcon color={color} />
      case 'sliders':
        return <SlidersIcon color={color} />
      case 'accessibility':
        return <AccessibilityIcon color={color} />
      case 'help-circle':
        return <HelpCircleIcon color={color} />
      default:
        return <HomeIcon color={color} />
    }
  }

  const handleNavClick = (pageId: PageId) => {
    onNavigate(pageId)
    if (isMobileOpen) {
      onCloseMobile()
    }
  }

  return (
    <>
      {/* Mobile Backdrop overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 40,
            transition: 'opacity var(--transition-normal)',
          }}
        />
      )}

      {/* Main Sidebar Navigation container */}
      <aside
        id="main-sidebar"
        aria-label="Main Navigation"
        className={`gazemouse-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: isCollapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width-expanded)',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          backgroundColor: 'var(--color-bg-surface-elevated)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          transition: 'width var(--transition-normal), transform var(--transition-normal)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            height: 'var(--header-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            padding: isCollapsed ? '0' : '0 var(--space-md)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              overflow: 'hidden',
              cursor: 'pointer',
            }}
            onClick={() => handleNavClick('home')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleNavClick('home')}
            aria-label="GazeMouse-OS Home"
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0,
              }}
            >
              <EyeGazeIcon size={22} color="#ffffff" />
            </div>

            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    color: 'var(--color-deep-blue)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}
                >
                  GazeMouse
                  <span style={{ color: 'var(--color-primary-blue)', fontWeight: 600, fontSize: '0.9rem', marginLeft: '3px' }}>
                    OS
                  </span>
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  Accessible Interaction
                </span>
              </div>
            )}
          </div>

          {/* Close button for mobile drawer */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="mobile-close-btn"
            aria-label="Close navigation menu"
            style={{
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              display: 'none', // Handled via CSS media query
            }}
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* 7-Item Navigation List */}
        <nav aria-label="Main Navigation" style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {NAV_ITEMS.map((item) => {
              const isActive = currentPage === item.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: isCollapsed ? '12px 0' : '10px 14px',
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isActive ? 'var(--color-primary-blue)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--color-text-main)',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '0.95rem',
                      transition: 'background-color var(--transition-fast), color var(--transition-fast)',
                      textAlign: 'left',
                      minHeight: '44px',
                    }}
                    className={`nav-item-btn ${isActive ? 'active' : ''}`}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    >
                      {renderIcon(item.iconName, isActive)}
                    </span>

                    {!isCollapsed && (
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.label}
                      </span>
                    )}

                    {!isCollapsed && isActive && (
                      <span
                        aria-hidden="true"
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: '#ffffff',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom Status & Collapse Control */}
        <div
          style={{
            padding: '12px 8px',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Tracking Status Badge */}
          {!isCollapsed && (() => {
            let dotColor = 'var(--color-text-muted)'
            let title = 'Camera: Off'
            let subtitle = 'Standby'

            if (trackingData.status === 'ACTIVE') {
              dotColor = 'var(--color-success)'
              title = 'Camera: Active'
              subtitle = trackingData.fps > 0 ? `Tracking (${trackingData.fps} FPS)` : 'Tracking Live'
            } else if (trackingData.status === 'TRACKING_LOST') {
              dotColor = 'var(--color-warning)'
              title = 'Face Lost'
              subtitle = 'Center face in frame'
            } else if (trackingData.status === 'INITIALIZING') {
              dotColor = 'var(--color-primary-blue)'
              title = 'Camera: Starting...'
              subtitle = 'Initializing model'
            } else if (trackingData.status === 'PERMISSION_DENIED') {
              dotColor = 'var(--color-error)'
              title = 'Camera: Blocked'
              subtitle = 'Permission denied'
            } else if (trackingData.status === 'UNAVAILABLE') {
              dotColor = 'var(--color-error)'
              title = 'Camera: Missing'
              subtitle = 'No camera detected'
            }

            return (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-light-blue)',
                  border: '1px solid var(--color-light-blue-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: dotColor,
                  }}
                  aria-hidden="true"
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-deep-blue)' }}>
                    {title}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                    {subtitle}
                  </span>
                </div>
              </div>
            )
          })()}

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="desktop-collapse-btn"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-secondary)',
              fontSize: '0.85rem',
              fontWeight: 600,
              minHeight: '40px',
            }}
          >
            {isCollapsed ? <ChevronRightIcon size={18} /> : <ChevronLeftIcon size={18} />}
            {!isCollapsed && <span>Collapse Sidebar</span>}
          </button>
        </div>
      </aside>
    </>
  )
}

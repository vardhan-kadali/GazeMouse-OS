import React from 'react'

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
  color?: string
}

export const HomeIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)

export const GamepadIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="6" x2="10" y1="12" y2="12"/>
    <line x1="8" x2="8" y1="10" y2="14"/>
    <line x1="15" x2="15.01" y1="13" y2="13"/>
    <line x1="18" x2="18.01" y1="11" y2="11"/>
    <rect width="20" height="12" x="2" y="6" rx="6"/>
  </svg>
)

export const CameraIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
    <circle cx="12" cy="13" r="3"/>
  </svg>
)

export const CpuIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <rect width="16" height="16" x="4" y="4" rx="2"/>
    <rect width="6" height="6" x="9" y="9" rx="1"/>
    <path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>
  </svg>
)

export const SlidersIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="4" x2="4" y1="21" y2="14"/>
    <line x1="4" x2="4" y1="10" y2="3"/>
    <line x1="12" x2="12" y1="21" y2="12"/>
    <line x1="12" x2="12" y1="8" y2="3"/>
    <line x1="20" x2="20" y1="21" y2="16"/>
    <line x1="20" x2="20" y1="12" y2="3"/>
    <line x1="1" x2="7" y1="14" y2="14"/>
    <line x1="9" x2="15" y1="8" y2="8"/>
    <line x1="17" x2="23" y1="16" y2="16"/>
  </svg>
)

export const AccessibilityIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="4" r="2"/>
    <path d="m18 19 1-7-6 1"/>
    <path d="m5 8 3-3 5.5 3-2.36 3.5"/>
    <path d="M4.24 14.5a5 5 0 0 0 6.88 6"/>
    <path d="M13.76 17.5a5 5 0 0 0-1.76-7.5"/>
  </svg>
)

export const HelpCircleIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <path d="M12 17h.01"/>
  </svg>
)

export const MenuIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="4" x2="20" y1="12" y2="12"/>
    <line x1="4" x2="20" y1="6" y2="6"/>
    <line x1="4" x2="20" y1="18" y2="18"/>
  </svg>
)

export const CloseIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="18" x2="6" y1="6" y2="18"/>
    <line x1="6" x2="18" y1="6" y2="18"/>
  </svg>
)

export const ChevronLeftIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

export const ChevronRightIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

export const EyeGazeIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" strokeDasharray="3 2"/>
    <circle cx="12" cy="12" r="4" fill={color}/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
  </svg>
)

export const CheckIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

export const WarningIcon: React.FC<IconProps> = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)


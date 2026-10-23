export type PageId =
  | 'home'
  | 'games'
  | 'setup'
  | 'how-it-works'
  | 'settings'
  | 'accessibility'
  | 'help'

export interface NavItem {
  id: PageId
  label: string
  path: string
  description: string
  iconName: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    description: 'Welcome overview and quick start',
    iconName: 'home',
  },
  {
    id: 'games',
    label: 'Games',
    path: '/games',
    description: 'Browse accessible games catalog',
    iconName: 'gamepad',
  },
  {
    id: 'setup',
    label: 'Camera Setup',
    path: '/setup',
    description: 'Configure camera and calibrate head tracking',
    iconName: 'camera',
  },
  {
    id: 'how-it-works',
    label: 'How It Works',
    path: '/how-it-works',
    description: 'Computer vision pipeline explanation',
    iconName: 'cpu',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    description: 'Adjust sensitivity, dwell time, and theme',
    iconName: 'sliders',
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    path: '/accessibility',
    description: 'WCAG principles, keyboard controls, and limits',
    iconName: 'accessibility',
  },
  {
    id: 'help',
    label: 'Help & Support',
    path: '/help',
    description: 'Troubleshooting guides, FAQs, and privacy',
    iconName: 'help-circle',
  },
]

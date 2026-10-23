export interface UserSettings {
  // Head-Movement Tracking Preferences
  sensitivity: number // 1.0 to 3.0 (default: 1.5)
  smoothing: number // 0.1 to 0.9 (default: 0.3)
  deadZone: number // 5% to 30% (default: 10)
  dwellDuration: number // 600ms to 2500ms (default: 1200)
  verticalGestures: boolean // Enable Pitch/Up-Down gestures (default: false for fatigue safety)

  // Audio & Interface Preferences
  soundEnabled: boolean // Audible cues on action (default: true)
  theme: 'light' | 'dark' // Color mode (default: light - Blue & White)
  reducedMotion: boolean // Reduce non-essential animations (default: false)
  highContrast: boolean // Extra contrast borders (default: false)
}

export const DEFAULT_SETTINGS: UserSettings = {
  sensitivity: 1.5,
  smoothing: 0.3,
  deadZone: 10,
  dwellDuration: 1200,
  verticalGestures: false,
  soundEnabled: true,
  theme: 'light',
  reducedMotion: false,
  highContrast: false,
}

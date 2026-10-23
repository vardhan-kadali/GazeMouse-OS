import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SettingsProvider, useSettings } from '../context/SettingsContext'
import { DEFAULT_SETTINGS } from '../types/settings'

describe('SettingsContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('provides default settings on first load', () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    })

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
    expect(result.current.settings.theme).toBe('light')
    expect(result.current.settings.sensitivity).toBe(1.5)
    expect(result.current.settings.dwellDuration).toBe(1200)
    expect(result.current.settings.verticalGestures).toBe(false)
  })

  it('updates a setting and persists to localStorage', () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    })

    act(() => {
      result.current.updateSetting('sensitivity', 2.4)
      result.current.updateSetting('theme', 'dark')
    })

    expect(result.current.settings.sensitivity).toBe(2.4)
    expect(result.current.settings.theme).toBe('dark')

    const stored = JSON.parse(localStorage.getItem('gazemouse_user_settings_v1') || '{}')
    expect(stored.sensitivity).toBe(2.4)
    expect(stored.theme).toBe('dark')
  })

  it('handles corrupted localStorage JSON gracefully without throwing', () => {
    localStorage.setItem('gazemouse_user_settings_v1', '{ invalid json syntax !!!')

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    })

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('resets settings to default on resetSettings()', () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    })

    act(() => {
      result.current.updateSetting('deadZone', 25)
      result.current.resetSettings()
    })

    expect(result.current.settings.deadZone).toBe(DEFAULT_SETTINGS.deadZone)
  })

  it('exports and imports valid settings JSON correctly', () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    })

    act(() => {
      result.current.updateSetting('dwellDuration', 1800)
    })

    const exported = result.current.exportSettings()
    expect(exported).toContain('"dwellDuration": 1800')

    // Modify and import
    const modifiedJson = JSON.stringify({ ...DEFAULT_SETTINGS, dwellDuration: 900, sensitivity: 2.8 })
    let success = false
    act(() => {
      success = result.current.importSettings(modifiedJson)
    })

    expect(success).toBe(true)
    expect(result.current.settings.dwellDuration).toBe(900)
    expect(result.current.settings.sensitivity).toBe(2.8)
  })
})

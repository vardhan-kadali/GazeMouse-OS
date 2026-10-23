import React, { useState } from 'react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { Alert } from '../components/common/Alert'
import { Slider } from '../components/common/Slider'
import { Toggle } from '../components/common/Toggle'
import { useSettings } from '../context/SettingsContext'
import { SlidersIcon } from '../components/common/Icons'

export const SettingsPage: React.FC = () => {
  const { settings, updateSetting, resetSettings, exportSettings, importSettings } = useSettings()
  const [importJson, setImportJson] = useState('')
  const [showImportBox, setShowImportBox] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const handleReset = () => {
    if (window.confirm('Reset all settings to factory defaults? Your saved preferences will be cleared.')) {
      resetSettings()
      setStatusMessage({ text: 'Settings have been reset to factory defaults.', type: 'success' })
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleExport = () => {
    const json = exportSettings()
    navigator.clipboard.writeText(json)
    setStatusMessage({ text: 'Settings JSON copied to clipboard!', type: 'success' })
    setTimeout(() => setStatusMessage(null), 4000)
  }

  const handleImportSubmit = () => {
    if (!importJson.trim()) return
    const success = importSettings(importJson)
    if (success) {
      setStatusMessage({ text: 'Settings imported successfully!', type: 'success' })
      setShowImportBox(false)
      setImportJson('')
    } else {
      setStatusMessage({ text: 'Failed to import settings. Please verify the JSON format.', type: 'error' })
    }
    setTimeout(() => setStatusMessage(null), 4000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Badge status="info" size="sm" icon={<SlidersIcon size={14} />}>
            Personalization Engine
          </Badge>
          <Badge status="success" size="sm">
            Stored in LocalStorage
          </Badge>
        </div>
        <h1 style={{ fontSize: '2.25rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
          Preferences & Controls
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: '780px' }}>
          Tailor head tracking sensitivity, dwell timing, and accessibility visuals to your unique comfort requirements.
        </p>
      </div>

      {statusMessage && (
        <Alert type={statusMessage.type}>
          {statusMessage.text}
        </Alert>
      )}

      {/* Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '28px' }}>
        {/* Section 1: Head-Tracking Dynamics */}
        <Card variant="bordered">
          <h2 style={{ fontSize: '1.3rem', color: 'var(--color-deep-blue)', marginBottom: '16px' }}>
            Head Movement & Tracking Dynamics
          </h2>

          <Slider
            id="setting-sensitivity"
            label="Sensitivity Multiplier"
            value={settings.sensitivity}
            min={1.0}
            max={3.0}
            step={0.1}
            unit="x"
            helpText="Controls the amplification of physical head turns into game actions. Increase if you have limited neck mobility."
            onChange={(v) => updateSetting('sensitivity', v)}
          />

          <Slider
            id="setting-smoothing"
            label="Jitter Smoothing (EMA Filter)"
            value={settings.smoothing}
            min={0.1}
            max={0.9}
            step={0.05}
            unit=""
            helpText="Higher values provide smoother motion for users with mild tremors, while lower values offer snappier response."
            onChange={(v) => updateSetting('smoothing', v)}
          />

          <Slider
            id="setting-deadzone"
            label="Resting Dead-Zone Radius"
            value={settings.deadZone}
            min={5}
            max={30}
            step={1}
            unit="%"
            helpText="Small head movements within this circular zone are ignored, allowing you to rest comfortably without triggering inputs."
            onChange={(v) => updateSetting('deadZone', v)}
          />

          <Slider
            id="setting-dwell"
            label="Dwell Selection Duration (Gaze Match)"
            value={settings.dwellDuration}
            min={600}
            max={2500}
            step={100}
            unit=" ms"
            helpText="The amount of time the cursor must hover continuously over a puzzle tile to trigger a selection."
            onChange={(v) => updateSetting('dwellDuration', v)}
          />

          <Toggle
            id="setting-vertical"
            label="Enable Vertical Gestures (Pitch Up/Down)"
            checked={settings.verticalGestures}
            onChange={(v) => updateSetting('verticalGestures', v)}
            helpText="Allows nod up and tilt down gestures. Keep disabled if vertical cervical movement causes fatigue."
          />
        </Card>

        {/* Section 2: Visual, Audio & Theme Preferences */}
        <Card variant="bordered">
          <h2 style={{ fontSize: '1.3rem', color: 'var(--color-deep-blue)', marginBottom: '16px' }}>
            Accessibility & Visual Theme
          </h2>

          <Toggle
            id="setting-theme"
            label="High-Contrast Dark Theme"
            checked={settings.theme === 'dark'}
            onChange={(isDark) => updateSetting('theme', isDark ? 'dark' : 'light')}
            helpText="Default is clean Blue & White. Enable for reduced eye strain in low-light environments."
          />

          <Toggle
            id="setting-reduced-motion"
            label="Reduced Motion Mode"
            checked={settings.reducedMotion}
            onChange={(v) => updateSetting('reducedMotion', v)}
            helpText="Disables non-essential transitions, scaling effects, and game particle animations."
          />

          <Toggle
            id="setting-sound"
            label="Audible Feedback & Chimes"
            checked={settings.soundEnabled}
            onChange={(v) => updateSetting('soundEnabled', v)}
            helpText="Plays audio cues when actions trigger, dwell completes, or lane changes occur."
          />

          {/* Configuration Management */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '1.05rem', color: 'var(--color-deep-blue)', marginBottom: '12px' }}>
              Settings Backup & Reset
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <Button size="sm" variant="outline" onClick={handleExport}>
                Copy Settings JSON
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowImportBox(!showImportBox)}>
                {showImportBox ? 'Hide Import' : 'Import JSON'}
              </Button>
              <Button size="sm" variant="danger" onClick={handleReset}>
                Reset to Defaults
              </Button>
            </div>

            {showImportBox && (
              <div style={{ marginTop: '16px' }}>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder="Paste settings JSON here..."
                  style={{
                    width: '100%',
                    height: '100px',
                    padding: '8px',
                    fontFamily: 'var(--font-family-mono)',
                    fontSize: '0.8rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                  }}
                />
                <Button size="sm" variant="primary" style={{ marginTop: '8px' }} onClick={handleImportSubmit}>
                  Apply Imported Settings
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

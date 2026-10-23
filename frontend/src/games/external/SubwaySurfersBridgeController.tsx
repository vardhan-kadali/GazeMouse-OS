import React, { useState, useEffect, useRef } from 'react'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { Badge } from '../../components/common/Badge'
import { Alert } from '../../components/common/Alert'
import { CameraIcon, CheckIcon, CloseIcon, WarningIcon } from '../../components/common/Icons'
import { useTracking } from '../../context/TrackingContext'
import { DesktopBridgeClient } from '../../services/desktopBridgeClient'
import type { BridgeStatus, BridgeAction } from '../../services/desktopBridgeClient'

interface SubwaySurfersBridgeControllerProps {
  onExit: () => void
  onNavigateToSetup: () => void
}

export const SubwaySurfersBridgeController: React.FC<SubwaySurfersBridgeControllerProps> = ({
  onExit,
  onNavigateToSetup,
}) => {
  const { trackingData, startCamera, stopCamera, startCalibration, isCameraActive } = useTracking()

  const [sessionToken, setSessionToken] = useState<string>('')
  const [tokenLoaded, setTokenLoaded] = useState<boolean>(false)
  const [isConnecting, setIsConnecting] = useState<boolean>(false)

  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    state: 'DISCONNECTED',
    foregroundAllowed: false,
    activeTitle: '',
    emergencyStopActive: false,
    errorMessage: null,
  })

  const [awaitingNeutral, setAwaitingNeutral] = useState<boolean>(false)
  const [lastDispatchedAction, setLastDispatchedAction] = useState<string>('NONE')
  const [lastDispatchedTime, setLastDispatchedTime] = useState<number>(0)
  const [lastRecognizedGesture, setLastRecognizedGesture] = useState<{ action: string; time: number } | null>(null)
  const [lastSentAction, setLastSentAction] = useState<{ action: string; time: number; target: string } | null>(null)
  const [diagnosticEntries, setDiagnosticEntries] = useState<
    Array<{ id: string; time: string; type: 'GESTURE' | 'SENT' | 'HELD' | 'EXECUTED' | 'BLOCKED' | 'INFO' | 'ERROR' | 'WARNING'; message: string }>
  >([])

  const addDiagnostic = (type: 'GESTURE' | 'SENT' | 'HELD' | 'EXECUTED' | 'BLOCKED' | 'INFO' | 'ERROR' | 'WARNING', message: string) => {
    const d = new Date()
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    setDiagnosticEntries((prev) => [
      { id: Math.random().toString(36).substring(2, 9), time: timeStr, type, message },
      ...prev.slice(0, 7),
    ])
  }

  const clientRef = useRef<DesktopBridgeClient | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Initialize DesktopBridgeClient singleton
  useEffect(() => {
    const client = new DesktopBridgeClient({
      onStatusChange: (status) => {
        setBridgeStatus(status)
        if (status.errorMessage) {
          addDiagnostic('ERROR', status.errorMessage)
        }
      },
      onActionExecuted: (action, success) => {
        if (success) {
          setLastDispatchedAction(action)
          setLastDispatchedTime(Date.now())
          addDiagnostic('EXECUTED', `Bridge confirmed hardware injection of [${action}] into Windows`)
        } else {
          addDiagnostic('BLOCKED', `Bridge could not dispatch [${action}]`)
        }
      },
    })
    clientRef.current = client

    return () => {
      client.disconnect()
      clientRef.current = null
    }
  }, [])

  // Connect to Desktop Bridge
  const handleConnect = async () => {
    if (!clientRef.current || !sessionToken.trim()) return
    setIsConnecting(true)
    try {
      await clientRef.current.connect(sessionToken.trim())
      addDiagnostic('INFO', 'Successfully connected and authenticated with Desktop Bridge')
    } catch {
      addDiagnostic('ERROR', 'Connection failed: Verify python main.py is running on port 8765')
    } finally {
      setIsConnecting(false)
    }
  }

  // Disconnect from Desktop Bridge
  const handleDisconnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect()
      addDiagnostic('INFO', 'Disconnected from Desktop Bridge')
    }
  }

  // Enable / Disable Input
  const handleEnableInput = () => {
    if (clientRef.current) {
      clientRef.current.enable()
      addDiagnostic('INFO', 'Requested ENABLE: Hardware keystroke injection armed')
    }
  }

  const handleDisableInput = () => {
    if (clientRef.current) {
      clientRef.current.disable()
      addDiagnostic('INFO', 'Input disabled by user')
    }
  }

  const handleResetEmergencyStop = () => {
    if (clientRef.current) {
      clientRef.current.resetStop()
      addDiagnostic('INFO', 'Requested Emergency Stop reset')
    }
  }

  // Load token file from disk via HTML5 FileReader
  const handleTokenFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (content) {
        setSessionToken(content.trim())
        setTokenLoaded(true)
        addDiagnostic('INFO', 'Authentication token loaded securely from file')
      }
    }
    reader.readAsText(file)
  }

  // Determine active window context for user guidance
  const isGazeMouseActive = Boolean(
    bridgeStatus.activeTitle &&
      (bridgeStatus.activeTitle.toLowerCase().includes('gazemouse') ||
        bridgeStatus.activeTitle.toLowerCase().includes('gaze mouse'))
  )

  // Strict Gesture Dispatching & Neutral-Return Hysteresis
  useEffect(() => {
    const client = clientRef.current
    if (!client || bridgeStatus.state !== 'ENABLED') return

    // Safety Gate 1: Tracking must be active and calibrated
    const isCalibrated = trackingData.calibration.state === 'SUCCESS' || Boolean(trackingData.baseline)
    const isTrackingActive = trackingData.status === 'ACTIVE' && trackingData.facePresent

    if (!isTrackingActive || !isCalibrated) {
      // Automatically disable if face tracking or calibration is lost
      if (bridgeStatus.state === 'ENABLED') {
        client.disable()
        addDiagnostic('WARNING', 'Input auto-disabled: Face tracking or calibration lost')
      }
      return
    }

    const { action, displacement } = trackingData

    // Neutral return condition: head is inside center dead-zone or delta offsets are near 0
    const isNeutral =
      displacement.inDeadZone ||
      (Math.abs(displacement.deltaX) < 0.08 && Math.abs(displacement.deltaY) < 0.08 && action === 'NONE')

    if (isNeutral) {
      if (awaitingNeutral) {
        setAwaitingNeutral(false)
        addDiagnostic('INFO', 'Head returned to neutral center (Re-armed for next gesture)')
      }
      return
    }

    // Single-action exclusivity: dispatch action ONCE per head turn until returned to neutral
    if (!awaitingNeutral && action !== 'NONE') {
      let bridgeAction: BridgeAction | null = null
      if (action === 'LEFT') bridgeAction = 'LEFT'
      else if (action === 'RIGHT') bridgeAction = 'RIGHT'
      else if (action === 'UP') bridgeAction = 'JUMP'
      else if (action === 'DOWN') bridgeAction = 'SLIDE'

      if (bridgeAction) {
        setLastRecognizedGesture({ action: bridgeAction, time: Date.now() })
        addDiagnostic('GESTURE', `Recognized [${bridgeAction}] gesture (Offset: ${displacement.deltaX.toFixed(2)})`)

        // Safety Gate: If GazeMouse-OS is in foreground, hold keystrokes so bridge does not trip fail-safe auto-disable
        if (isGazeMouseActive) {
          addDiagnostic(
            'HELD',
            `Keystroke [${bridgeAction}] held: GazeMouse-OS tab is active. Click into Subway Surfers to inject.`
          )
          setAwaitingNeutral(true)
        } else {
          client.sendAction(bridgeAction)
          setLastSentAction({
            action: bridgeAction,
            time: Date.now(),
            target: bridgeStatus.activeTitle || 'Foreground Window',
          })
          addDiagnostic(
            'SENT',
            `Dispatched [${bridgeAction}] to bridge (Target: "${bridgeStatus.activeTitle || 'Foreground Window'}")`
          )
          setAwaitingNeutral(true)
        }
      }
    }
  }, [trackingData, bridgeStatus.state, awaitingNeutral, isGazeMouseActive, bridgeStatus.activeTitle])

  // Window visibility & focus guard: disable input if browser tab loses visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && clientRef.current?.isEnabled()) {
        clientRef.current.disable()
        addDiagnostic('WARNING', 'Input auto-disabled: GazeMouse-OS tab was hidden')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const isCalibrated = trackingData.calibration.state === 'SUCCESS' || Boolean(trackingData.baseline)
  const isConnected =
    bridgeStatus.state === 'CONNECTED' ||
    bridgeStatus.state === 'DISABLED' ||
    Boolean(clientRef.current?.isConnected())
  const canEnable =
    isCameraActive &&
    isCalibrated &&
    isConnected &&
    bridgeStatus.state !== 'ENABLED' &&
    bridgeStatus.state !== 'STOPPED' &&
    !bridgeStatus.emergencyStopActive

  const getForegroundBadgeStatus = (): 'success' | 'warning' | 'info' | 'neutral' | 'error' => {
    if (bridgeStatus.state === 'DISCONNECTED' || bridgeStatus.state === 'ERROR') return 'neutral'
    if (bridgeStatus.emergencyStopActive || bridgeStatus.state === 'STOPPED') return 'error'
    if (bridgeStatus.foregroundAllowed) return 'success'
    if (isGazeMouseActive) return 'info'
    return 'warning'
  }

  const getForegroundBadgeLabel = (): string => {
    if (bridgeStatus.state === 'DISCONNECTED' || bridgeStatus.state === 'ERROR') return 'Offline (Not Connected)'
    if (bridgeStatus.emergencyStopActive || bridgeStatus.state === 'STOPPED') return 'Input Blocked (Emergency Stop)'
    if (bridgeStatus.foregroundAllowed) return 'Approved Game Window'
    if (isGazeMouseActive) return 'GazeMouse-OS Active (Setup Mode)'
    return 'Other Window Active (Keystrokes Blocked)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Badge status="info" size="sm">
              Phase 4 External Game Mode
            </Badge>
            <Badge status="neutral" size="sm">
              Poki / Desktop Target
            </Badge>
          </div>
          <h1 style={{ fontSize: '2rem', color: 'var(--color-deep-blue)', marginBottom: '4px' }}>
            Official Subway Surfers Desktop Bridge
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
            Play the genuine Subway Surfers in an external browser window using your webcam head gestures.
          </p>
        </div>
        <Button variant="outline" icon={<CloseIcon size={18} />} onClick={onExit}>
          Back to Games
        </Button>
      </div>

      {/* Critical Limitation Warning Alert */}
      <Alert type="warning" title="Gameplay Notice: External Game Pausing">
        Stopping head movements or clicking <strong>Disable Input</strong> halts keyboard injection to Windows,
        but does <strong>not automatically pause the external web game</strong>. To pause Subway Surfers, click inside
        the game window and press <strong>Esc</strong> or tap its on-screen pause button.
      </Alert>

      {/* Error or Warning Alerts from Bridge */}
      {bridgeStatus.errorMessage && (
        <Alert type="error" title="Bridge Alert">
          {bridgeStatus.errorMessage}
        </Alert>
      )}

      {/* 2-Column Dashboard Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Left Column: Camera Tracking & Calibration */}
        <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CameraIcon size={20} />
            Step 1: Webcam & Calibration
          </h2>

          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Camera Status:</span>
              <Badge status={isCameraActive ? 'success' : 'neutral'} size="sm">
                {trackingData.status}
              </Badge>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Face Detected:</span>
              <Badge status={trackingData.facePresent ? 'success' : 'warning'} size="sm">
                {trackingData.facePresent ? 'Present' : 'Not Detected'}
              </Badge>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Calibration:</span>
              <Badge status={isCalibrated ? 'success' : 'warning'} size="sm">
                {isCalibrated ? 'Calibrated' : 'Needs Calibration'}
              </Badge>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!isCameraActive ? (
              <Button variant="primary" style={{ flex: 1 }} onClick={() => startCamera()}>
                Start Camera
              </Button>
            ) : (
              <>
                <Button variant="outline" style={{ flex: 1 }} onClick={startCalibration}>
                  Calibrate Center
                </Button>
                <Button variant="secondary" onClick={stopCamera}>
                  Stop Camera
                </Button>
              </>
            )}
            <Button variant="outline" onClick={onNavigateToSetup}>
              Camera Setup
            </Button>
          </div>

          {/* Live Gesture Monitor */}
          <div
            style={{
              padding: '14px',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Classified Gesture:</span>
              <strong style={{ color: '#38bdf8' }}>{trackingData.action}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Lateral Offset (deltaX):</span>
              <span>{trackingData.displacement.deltaX.toFixed(3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Vertical Offset (deltaY):</span>
              <span>{trackingData.displacement.deltaY.toFixed(3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Awaiting Neutral Return:</span>
              <span style={{ color: awaitingNeutral ? '#f59e0b' : '#10b981' }}>
                {awaitingNeutral ? 'YES (Held)' : 'READY'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8' }}>Last Recognized Gesture:</span>
              <span style={{ color: lastRecognizedGesture ? '#a855f7' : '#64748b', fontWeight: 600 }}>
                {lastRecognizedGesture
                  ? `${lastRecognizedGesture.action} (${Math.round((Date.now() - lastRecognizedGesture.time) / 1000)}s ago)`
                  : 'None yet'}
              </span>
            </div>
          </div>
        </Card>

        {/* Right Column: Desktop Bridge Connection & Safety */}
        <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)' }}>
            Step 2: Desktop Input Bridge
          </h2>

          {/* Bridge Connection Form */}
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Bridge Connection Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Bridge Status:</span>
              <Badge
                status={
                  bridgeStatus.state === 'ENABLED'
                    ? 'success'
                    : bridgeStatus.state === 'CONNECTED' || bridgeStatus.state === 'DISABLED'
                    ? 'info'
                    : bridgeStatus.state === 'STOPPED'
                    ? 'error'
                    : 'neutral'
                }
                size="sm"
              >
                {bridgeStatus.state}
              </Badge>
            </div>

            {/* Keyboard Input State */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Keyboard Input:</span>
              <Badge
                status={
                  bridgeStatus.state === 'ENABLED'
                    ? bridgeStatus.foregroundAllowed
                      ? 'success'
                      : 'warning'
                    : 'neutral'
                }
                size="sm"
              >
                {bridgeStatus.state === 'ENABLED'
                  ? bridgeStatus.foregroundAllowed
                    ? 'Armed & Injecting'
                    : 'Armed (Awaiting Game Focus)'
                  : 'Disabled'}
              </Badge>
            </div>

            {/* Foreground Game Window State */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Foreground Game Window:</span>
              <Badge status={getForegroundBadgeStatus()} size="sm">
                {getForegroundBadgeLabel()}
              </Badge>
            </div>

            {/* Active Window Title Display */}
            {bridgeStatus.activeTitle ? (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-muted)',
                  wordBreak: 'break-all',
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <strong>Active Window:</strong> {bridgeStatus.activeTitle}
              </div>
            ) : null}

            {/* Live Contextual Guidance on Active Window */}
            {bridgeStatus.state !== 'DISCONNECTED' && (
              <div
                style={{
                  fontSize: '0.82rem',
                  lineHeight: 1.45,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: bridgeStatus.foregroundAllowed
                    ? 'rgba(16, 185, 129, 0.08)'
                    : isGazeMouseActive
                    ? 'rgba(59, 130, 246, 0.08)'
                    : 'rgba(245, 158, 11, 0.08)',
                  color: bridgeStatus.foregroundAllowed
                    ? '#065f46'
                    : isGazeMouseActive
                    ? '#1e40af'
                    : '#92400e',
                  borderLeft: `3px solid ${
                    bridgeStatus.foregroundAllowed
                      ? '#10b981'
                      : isGazeMouseActive
                      ? '#3b82f6'
                      : '#f59e0b'
                  }`,
                }}
              >
                {bridgeStatus.foregroundAllowed ? (
                  <span>
                    ✓ <strong>Game Window Ready:</strong> Subway Surfers has active Windows keyboard focus. Keystrokes will be safely delivered when you turn your head.
                  </span>
                ) : isGazeMouseActive ? (
                  <span>
                    ℹ <strong>Setup Focus:</strong> Windows currently has GazeMouse-OS focused because you are clicking on this page. Keystrokes are safely blocked while configuring. Click <strong>Enable Keyboard Input</strong> below, then click into your Subway Surfers window to play.
                  </span>
                ) : (
                  <span>
                    ⚠ <strong>Keystrokes Blocked:</strong> An unapproved window is focused. For safety, keyboard commands are blocked until you click into the Subway Surfers window.
                  </span>
                )}
              </div>
            )}

            {/* Token input & file upload */}
            {bridgeStatus.state === 'DISCONNECTED' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                  Session Authentication Token:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    placeholder="Enter or load session token"
                    value={sessionToken}
                    onChange={(e) => {
                      setSessionToken(e.target.value)
                      setTokenLoaded(false)
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.9rem',
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Load File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".bridge_session_token,text/plain"
                    style={{ display: 'none' }}
                    onChange={handleTokenFileUpload}
                  />
                </div>
                {tokenLoaded && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckIcon size={14} /> Token loaded securely from local file
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Connection Actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {bridgeStatus.state === 'DISCONNECTED' || bridgeStatus.state === 'ERROR' ? (
              <Button
                variant="primary"
                style={{ flex: 1 }}
                disabled={!sessionToken.trim() || isConnecting}
                onClick={handleConnect}
              >
                {isConnecting ? 'Connecting...' : 'Connect to Bridge'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}

            {/* Input Enable / Disable controls */}
            {bridgeStatus.state === 'ENABLED' ? (
              <Button variant="danger" style={{ flex: 1.5 }} onClick={handleDisableInput}>
                Disable Input
              </Button>
            ) : (
              <Button
                variant="primary"
                style={{
                  flex: 1.5,
                  backgroundColor: canEnable ? 'var(--color-success)' : undefined,
                  borderColor: canEnable ? 'var(--color-success)' : undefined,
                }}
                disabled={!canEnable}
                onClick={handleEnableInput}
              >
                Enable Keyboard Input
              </Button>
            )}
          </div>

          {/* Emergency Stop Banner & Reset */}
          {bridgeStatus.state === 'STOPPED' && (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#fee2e2',
                border: '1px solid #ef4444',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontWeight: 600 }}>
                <WarningIcon size={18} /> Emergency Stop Active (Ctrl+Alt+Q)
              </div>
              <p style={{ fontSize: '0.85rem', color: '#7f1d1d', margin: 0 }}>
                Hardware input was immediately severed. Ensure Ctrl+Alt+Q is released, then click Reset below.
              </p>
              <Button size="sm" variant="danger" onClick={handleResetEmergencyStop}>
                Reset Emergency Stop
              </Button>
            </div>
          )}

          {/* Telemetry Footer */}
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              paddingTop: '4px',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Last Sent to Bridge:</span>
              <strong style={{ color: lastSentAction ? 'var(--color-primary-blue)' : 'inherit' }}>
                {lastSentAction
                  ? `${lastSentAction.action} (${Math.round((Date.now() - lastSentAction.time) / 1000)}s ago)`
                  : 'NONE'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Last Confirmed Injected:</span>
              <strong style={{ color: lastDispatchedAction !== 'NONE' ? 'var(--color-success)' : 'inherit' }}>
                {lastDispatchedAction !== 'NONE'
                  ? `${lastDispatchedAction} (${Math.round((Date.now() - lastDispatchedTime) / 1000)}s ago)`
                  : 'NONE'}
              </strong>
            </div>
          </div>
        </Card>
      </div>

      {/* Real-Time Control Pipeline Diagnostics & Activity Feed */}
      <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-deep-blue)', margin: '0 0 2px 0' }}>
              Real-Time Control Pipeline Diagnostics & Activity Feed
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Live verification of head gestures, window focus guards, and hardware keystroke injection.
            </p>
          </div>
          {diagnosticEntries.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setDiagnosticEntries([])}>
              Clear Feed
            </Button>
          )}
        </div>

        {/* 8-Point Pipeline Status Overview Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
            backgroundColor: 'var(--color-bg-surface)',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            fontSize: '0.85rem',
          }}
        >
          <div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>
              1. Camera & Tracking
            </div>
            <strong style={{ color: isCameraActive && trackingData.facePresent ? '#059669' : '#dc2626' }}>
              {!isCameraActive ? 'Camera Inactive' : trackingData.facePresent ? 'Tracking Face' : 'Face Missing'}
            </strong>
          </div>

          <div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>
              2. Resting Baseline
            </div>
            <strong style={{ color: isCalibrated ? '#059669' : '#d97706' }}>
              {isCalibrated ? 'Calibrated' : 'Not Calibrated'}
            </strong>
          </div>

          <div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>
              3. Current Gesture
            </div>
            <strong style={{ color: trackingData.action !== 'NONE' ? '#2563eb' : '#64748b' }}>
              {trackingData.action !== 'NONE' ? `Turning ${trackingData.action}` : 'Facing Center'}
            </strong>
          </div>

          <div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>
              4. Re-Arm Status
            </div>
            <strong style={{ color: awaitingNeutral ? '#d97706' : '#059669' }}>
              {awaitingNeutral ? 'Deflected (Holding)' : 'Neutral Position'}
            </strong>
          </div>

          <div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>
              5. Bridge Link
            </div>
            <strong style={{ color: bridgeStatus.state === 'ENABLED' ? '#059669' : bridgeStatus.state === 'CONNECTED' ? '#2563eb' : '#64748b' }}>
              {bridgeStatus.state === 'ENABLED'
                ? 'Enabled (Armed)'
                : bridgeStatus.state === 'CONNECTED'
                ? 'Connected (Idle)'
                : bridgeStatus.state === 'STOPPED'
                ? 'Emergency Halted'
                : bridgeStatus.state === 'DISABLED'
                ? 'Disabled (Standby)'
                : 'Offline (Standby)'}
            </strong>
          </div>

          <div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginBottom: '2px' }}>
              6. Foreground Focus
            </div>
            <strong style={{ color: bridgeStatus.foregroundAllowed ? '#059669' : isGazeMouseActive ? '#2563eb' : '#d97706' }}>
              {bridgeStatus.foregroundAllowed
                ? 'Approved Game Window'
                : isGazeMouseActive
                ? 'GazeMouse-OS Setup'
                : 'Unapproved Window'}
            </strong>
          </div>
        </div>

        {/* Live Recent Events List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
            Recent Activity Log:
          </div>
          {diagnosticEntries.length === 0 ? (
            <div
              style={{
                padding: '12px',
                backgroundColor: 'rgba(0, 0, 0, 0.02)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
              }}
            >
              No gesture events logged yet. Connect to bridge, click Enable Keyboard Input, and move your head.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {diagnosticEntries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    backgroundColor:
                      entry.type === 'EXECUTED'
                        ? 'rgba(16, 185, 129, 0.08)'
                        : entry.type === 'SENT'
                        ? 'rgba(37, 99, 235, 0.08)'
                        : entry.type === 'HELD' || entry.type === 'WARNING'
                        ? 'rgba(245, 158, 11, 0.08)'
                        : entry.type === 'ERROR'
                        ? 'rgba(239, 68, 68, 0.08)'
                        : 'rgba(0, 0, 0, 0.03)',
                    borderLeft: `3px solid ${
                      entry.type === 'EXECUTED'
                        ? '#10b981'
                        : entry.type === 'SENT'
                        ? '#2563eb'
                        : entry.type === 'HELD' || entry.type === 'WARNING'
                        ? '#f59e0b'
                        : entry.type === 'ERROR'
                        ? '#ef4444'
                        : '#94a3b8'
                    }`,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                    [{entry.time}]
                  </span>
                  <Badge
                    size="sm"
                    status={
                      entry.type === 'EXECUTED'
                        ? 'success'
                        : entry.type === 'SENT'
                        ? 'info'
                        : entry.type === 'HELD' || entry.type === 'WARNING'
                        ? 'warning'
                        : entry.type === 'ERROR'
                        ? 'error'
                        : 'neutral'
                    }
                  >
                    {entry.type}
                  </Badge>
                  <span style={{ color: 'var(--color-text-main)', flex: 1 }}>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Beginner-Friendly Step-by-Step Guided Setup */}
      <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)', marginBottom: '4px' }}>
            Beginner's Guide: How to Setup Windows and Play Subway Surfers
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            Follow these 4 simple steps to arrange your windows and enjoy hands-free head gesture gaming.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Step 1 */}
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--color-deep-blue)' }}>
              1. Open Subway Surfers in a Separate Window (Side-by-Side)
            </h4>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
              Click{' '}
              <a
                href="https://poki.com/en/g/subway-surfers"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-primary-blue)', fontWeight: 600, textDecoration: 'underline' }}
              >
                Play Subway Surfers on Poki ↗
              </a>
              . When the page opens, drag its browser tab out into its <strong>own separate window</strong>.
            </p>
            <div
              style={{
                fontSize: '0.85rem',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                color: '#1e40af',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              💡 <strong>Why separate windows?</strong> GazeMouse-OS needs to stay visible so your webcam can track your head gestures, while Windows sends keyboard strokes to whichever window currently has keyboard focus. Arrange GazeMouse-OS on the left and Subway Surfers on the right (or on dual monitors).
            </div>
          </div>

          {/* Step 2 */}
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--color-deep-blue)' }}>
              2. Start Python Desktop Bridge and Connect
            </h4>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
              Open Windows PowerShell in <code>d:\Gaze Mouse - OS\desktop-bridge</code> and run:
            </p>
            <pre
              style={{
                margin: '0 0 8px 0',
                padding: '8px 12px',
                backgroundColor: '#0f172a',
                color: '#38bdf8',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
              }}
            >
              python main.py
            </pre>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
              Click <strong>Load File</strong> above to load the token file, then click <strong>Connect to Bridge</strong>.
            </p>
          </div>

          {/* Step 3 */}
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--color-deep-blue)' }}>
              3. Calibrate Your Head & Click "Enable Keyboard Input"
            </h4>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
              Face your screen comfortably in neutral posture and click <strong>Calibrate Center</strong>. Then click <strong>Enable Keyboard Input</strong>.
            </p>
            <div
              style={{
                fontSize: '0.85rem',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                color: '#1e40af',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              ℹ <strong>Why does it show "GazeMouse-OS Active (Setup Mode)"?</strong> Because you just clicked inside this tab! Windows reports GazeMouse-OS as the active window. The bridge intentionally locks keystrokes so head movements do not accidentally type into your browser controls.
            </div>
          </div>

          {/* Step 4 */}
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--color-deep-blue)' }}>
              4. Click Inside Subway Surfers to Start the Run & Play!
            </h4>
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '10px',
                fontSize: '0.9rem',
                color: '#92400e',
              }}
            >
              ⚠️ <strong>Important One-Time Game Start Click:</strong> Subway Surfers opens to a start screen where Jake is standing still in the train yard. You <strong>MUST click 'Play' or 'Tap to Play' with your mouse once</strong> to start Jake running! Head gestures steer Jake left and right while he is running, but cannot click the on-screen start button.
            </div>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
              Click inside the Subway Surfers window to give it keyboard focus and click Play. Notice that the badge in GazeMouse-OS will automatically turn green to <strong>"Approved Game Window"</strong> within 1 second!
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <li><strong>Steer Left:</strong> Turn head left, then return to neutral center.</li>
              <li><strong>Steer Right:</strong> Turn head right, then return to neutral center.</li>
              <li><strong>Jump:</strong> Tilt head up (when vertical gestures enabled in Settings).</li>
              <li><strong>Slide:</strong> Tilt head down (when vertical gestures enabled in Settings).</li>
              <li><strong>Emergency Stop:</strong> Press <code>Ctrl + Alt + Q</code> anywhere in Windows to instantly halt input.</li>
            </ul>
          </div>
        </div>

        {/* Beginner FAQ & Troubleshooting Checklist */}
        <div
          style={{
            marginTop: '8px',
            padding: '16px',
            backgroundColor: 'var(--color-bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-deep-blue)' }}>
            Frequently Asked Questions & Troubleshooting
          </h4>

          <div>
            <strong style={{ fontSize: '0.9rem', color: 'var(--color-text-main)' }}>
              • Why did Subway Surfers require mouse interaction?
            </strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Web-based games require browser keyboard focus on their canvas and a mouse click to dismiss the start screen / tap 'Play'. Once Jake starts running down the tracks, your head turns will steer him left and right hands-free!
            </p>
          </div>

          <div>
            <strong style={{ fontSize: '0.9rem', color: 'var(--color-text-main)' }}>
              • Why was the active window shown as GazeMouse-OS?
            </strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Windows reports whichever window holds keyboard focus. When you click buttons on the GazeMouse-OS website, Windows detects <code>GazeMouse-OS — Accessible Head-Movement Gaming — Google Chrome</code>. For your security, the bridge never sends keystrokes into GazeMouse-OS or general browser tabs.
            </p>
          </div>

          <div>
            <strong style={{ fontSize: '0.9rem', color: 'var(--color-text-main)' }}>
              • What if the game window stays unapproved after clicking it?
            </strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Verify that: (1) The Subway Surfers tab has finished loading so its title contains "Subway Surfers" or "Poki"; (2) You actually clicked inside the game canvas; and (3) The game window is not minimized.
            </p>
          </div>

          <div>
            <strong style={{ fontSize: '0.9rem', color: 'var(--color-text-main)' }}>
              • Safe Offline Testing with Notepad ("Test Window"):
            </strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              You can test the entire pipeline without opening the web game! Open Windows Notepad and save an empty file titled <code>Test Window.txt</code>. Keep that Notepad window open on your screen. The bridge recognizes any window with <code>Test Window</code> in its title as approved. When you click into Notepad and turn your head, you will see left/right arrow keys safely move the text cursor!
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

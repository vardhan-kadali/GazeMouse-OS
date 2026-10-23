import React, { useRef, useEffect } from 'react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { Alert } from '../components/common/Alert'
import { Slider } from '../components/common/Slider'
import { Toggle } from '../components/common/Toggle'
import { GestureGauge } from '../components/common/GestureGauge'
import { useSettings } from '../context/SettingsContext'
import { useTracking } from '../context/TrackingContext'
import { CameraIcon, EyeGazeIcon } from '../components/common/Icons'

export const CameraSetupPage: React.FC = () => {
  const { settings, updateSetting } = useSettings()
  const {
    trackingData,
    startCamera,
    stopCamera,
    startCalibration,
    cancelCalibration,
    attachElements,
    detachElements,
    recalibrate,
    isCameraActive,
  } = useTracking()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Manage DOM element binding across navigation
  useEffect(() => {
    if (isCameraActive && videoRef.current && canvasRef.current) {
      attachElements(videoRef.current, canvasRef.current)
    }

    return () => {
      detachElements()
    }
  }, [isCameraActive, attachElements, detachElements])

  const handleStartCamera = async () => {
    if (videoRef.current && canvasRef.current) {
      await startCamera(videoRef.current, canvasRef.current)
    }
  }

  const handleStopCamera = () => {
    stopCamera()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Page Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          {trackingData.status === 'ACTIVE' && (
            <Badge status="success" size="sm" icon={<EyeGazeIcon size={14} />}>
              Camera Active ({trackingData.fps} FPS)
            </Badge>
          )}
          {trackingData.status === 'TRACKING_LOST' && (
            <Badge status="warning" size="sm" icon={<EyeGazeIcon size={14} />}>
              Face Tracking Lost
            </Badge>
          )}
          {trackingData.status === 'INITIALIZING' && (
            <Badge status="info" size="sm">
              Initializing Vision Model...
            </Badge>
          )}
          {trackingData.status === 'OFF' && (
            <Badge status="neutral" size="sm" icon={<CameraIcon size={14} />}>
              Camera Standby (Off)
            </Badge>
          )}
          {(trackingData.status === 'PERMISSION_DENIED' || trackingData.status === 'UNAVAILABLE' || trackingData.status === 'ERROR') && (
            <Badge status="error" size="sm">
              Camera Error
            </Badge>
          )}
          <Badge status="info" size="sm">
            Phase 2 Vision Engine
          </Badge>
        </div>
        <h1 style={{ fontSize: '2.25rem', color: 'var(--color-deep-blue)', marginBottom: '8px' }}>
          Camera Setup & Neutral Calibration
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: '780px' }}>
          Enable your camera explicitly, calibrate your neutral resting posture, and verify head gesture sensitivity in real time.
        </p>
      </div>

      {/* Error Banners if camera fails */}
      {trackingData.status === 'PERMISSION_DENIED' && (
        <Alert
          type="error"
          title="Camera Permission Denied"
          action={
            <Button size="sm" variant="outline" onClick={handleStartCamera}>
              Retry Permission
            </Button>
          }
        >
          Camera access was blocked by your browser. To play, click the camera icon on the left side of your browser URL bar, choose "Allow", and click Retry.
        </Alert>
      )}

      {trackingData.status === 'UNAVAILABLE' && (
        <Alert type="error" title="No Webcam Detected">
          No video input device was detected on your computer. Please connect a webcam via USB or verify built-in camera drivers.
        </Alert>
      )}

      {trackingData.status === 'TRACKING_LOST' && (
        <Alert type="warning" title="Face Position Lost">
          {trackingData.errorMessage || 'Face is not visible in camera frame. Please center your face and ensure your room is adequately lit.'}
        </Alert>
      )}

      {/* Main 2-Column Setup Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '32px',
        }}
      >
        {/* Left Column: Real Camera Viewport & Calibration */}
        <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)' }}>
              Optical Camera Feed & Mesh
            </h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              {isCameraActive ? (trackingData.facePresent ? '✓ Face Tracked' : 'Searching for Face...') : 'Off'}
            </span>
          </div>

          {/* Video & Canvas Container */}
          <div
            style={{
              width: '100%',
              aspectRatio: '4 / 3',
              backgroundColor: '#0b1120',
              borderRadius: 'var(--radius-lg)',
              border: '2px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Live HTML5 Video Element */}
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)', // Mirrored view
                display: isCameraActive ? 'block' : 'none',
              }}
            />

            {/* Landmark Overlay Canvas */}
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)', // Match mirrored video
                pointerEvents: 'none',
                display: isCameraActive ? 'block' : 'none',
              }}
            />

            {/* Camera Off / Inactive State */}
            {!isCameraActive && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '24px', textAlign: 'center' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-light-blue)',
                    border: '1px solid var(--color-light-blue-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-primary-blue)',
                  }}
                >
                  <CameraIcon size={32} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', color: '#ffffff', marginBottom: '4px' }}>
                    Webcam is Inactive
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '300px' }}>
                    Click below to start camera tracking. Video frames are processed strictly on-device in WebAssembly.
                  </p>
                </div>
                <Button
                  variant="primary"
                  icon={<CameraIcon size={18} />}
                  onClick={handleStartCamera}
                >
                  Enable Camera
                </Button>
              </div>
            )}

            {/* Model Initializing HUD Overlay */}
            {trackingData.status === 'INITIALIZING' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(11, 17, 32, 0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: '#ffffff',
                  zIndex: 10,
                }}
              >
                <span style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⟳</span>
                <span style={{ fontWeight: 600 }}>Loading MediaPipe Vision Model...</span>
              </div>
            )}

            {/* Calibration Preparation Countdown HUD */}
            {trackingData.calibration.state === 'PREPARING' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(30, 58, 138, 0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: '#ffffff',
                  zIndex: 20,
                  textAlign: 'center',
                  padding: '20px',
                }}
              >
                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Get Ready...</span>
                <span style={{ fontSize: '4.5rem', fontWeight: 800, lineHeight: 1 }}>
                  {trackingData.calibration.countdownSeconds}
                </span>
                <p style={{ fontSize: '0.9rem', maxWidth: '280px', color: '#dbeafe' }}>
                  Sit in your comfortable natural resting position looking forward.
                </p>
                <Button size="sm" variant="outline" onClick={cancelCalibration}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Calibration Sampling Window HUD */}
            {trackingData.calibration.state === 'SAMPLING' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(21, 128, 61, 0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '14px',
                  color: '#ffffff',
                  zIndex: 20,
                  textAlign: 'center',
                  padding: '24px',
                }}
              >
                <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  Sampling Resting Posture...
                </span>
                <div
                  style={{
                    width: '80%',
                    height: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    borderRadius: 'var(--radius-full)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${trackingData.calibration.samplingPercent}%`,
                      backgroundColor: '#ffffff',
                      transition: 'width 100ms linear',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.85rem' }}>
                  Averaging resting coordinates ({trackingData.calibration.sampleCount} frames)
                </span>
              </div>
            )}
          </div>

          {/* Camera Power Actions */}
          {isCameraActive && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onClick={handleStopCamera}
              >
                Stop Camera
              </Button>
              <Button
                variant="primary"
                style={{ flex: 1.5 }}
                disabled={!trackingData.facePresent || trackingData.calibration.state === 'PREPARING' || trackingData.calibration.state === 'SAMPLING'}
                onClick={trackingData.baseline ? recalibrate : startCalibration}
              >
                {trackingData.baseline ? 'Recalibrate Neutral Position' : 'Calibrate Neutral Baseline'}
              </Button>
            </div>
          )}

          {/* Calibration Result Feedback */}
          {trackingData.calibration.state === 'SUCCESS' && (
            <Alert type="success" title="Calibration Successful">
              Neutral baseline (0,0) established from {trackingData.baseline?.sampleCount} sample frames. Your comfortable resting posture is now locked in.
            </Alert>
          )}

          {trackingData.calibration.state === 'FAILED' && (
            <Alert type="error" title="Calibration Incomplete">
              {trackingData.calibration.errorMessage || 'Unable to establish baseline. Please face camera steadily and try again.'}
            </Alert>
          )}

          {/* Calibration Explanation & Timing Checklist */}
          <div
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              border: '1px solid var(--color-light-blue-border)',
            }}
          >
            <h3 style={{ fontSize: '1rem', color: 'var(--color-deep-blue)', marginBottom: '6px' }}>
              Calibration Protocol:
            </h3>
            <ol style={{ paddingLeft: '20px', fontSize: '0.875rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Sit in your natural, comfortable posture looking forward.</li>
              <li>A 3-second preparation countdown gives you time to settle.</li>
              <li>A 2-second sampling window records and averages ~60 frames to establish baseline (0,0).</li>
              <li>All game movements are measured as relative deltas ($\Delta X, \Delta Y$) from your personal resting pose.</li>
            </ol>
          </div>
        </Card>

        {/* Right Column: Live Movement Test Gauges & Assistive Tuning */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Movement Test Visualizer Card */}
          <GestureGauge variant="full" />

          {/* Real-time Settings Adjusters Card */}
          <Card variant="bordered">
            <h2 style={{ fontSize: '1.25rem', color: 'var(--color-deep-blue)', marginBottom: '16px' }}>
              Real-Time Tracking Parameters
            </h2>

            <Slider
              id="setup-sensitivity"
              label="Movement Sensitivity"
              value={settings.sensitivity}
              min={1.0}
              max={3.0}
              step={0.1}
              unit="x"
              helpText="Higher values trigger game actions with smaller physical head turns."
              onChange={(v) => updateSetting('sensitivity', v)}
            />

            <Slider
              id="setup-smoothing"
              label="Jitter Smoothing (EMA Filter)"
              value={settings.smoothing}
              min={0.1}
              max={0.9}
              step={0.05}
              unit=""
              helpText="Eliminates webcam sensor noise and involuntary hand/head tremors."
              onChange={(v) => updateSetting('smoothing', v)}
            />

            <Slider
              id="setup-deadzone"
              label="Dead-Zone Radius"
              value={settings.deadZone}
              min={5}
              max={30}
              step={1}
              unit="%"
              helpText="Displacements inside this boundary are ignored so you can rest comfortably."
              onChange={(v) => updateSetting('deadZone', v)}
            />

            <Toggle
              id="setup-vertical-toggle"
              label="Enable Vertical Gestures (Up/Down)"
              checked={settings.verticalGestures}
              onChange={(v) => updateSetting('verticalGestures', v)}
              helpText="Recommended OFF to prevent neck strain unless needed for jumping or sliding."
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

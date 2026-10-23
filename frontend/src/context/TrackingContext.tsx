import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import type {
  TrackingData,
  TrackingStatus,
  FaceLandmarks,
  NormalizedDisplacement,
  DirectionalAction,
  CalibrationProgress,
} from '../types/tracking'
import { INITIAL_TRACKING_DATA } from '../types/tracking'
import { VisionManager } from '../vision/visionManager'

interface TrackingContextValue {
  trackingData: TrackingData
  startCamera: (video?: HTMLVideoElement | null, canvas?: HTMLCanvasElement | null) => Promise<void>
  stopCamera: () => void
  attachElements: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void
  detachElements: () => void
  startCalibration: () => void
  cancelCalibration: () => void
  recalibrate: () => void
  resetGestures: () => void
  isCameraActive: boolean
}

export const TrackingContext = createContext<TrackingContextValue | undefined>(undefined)

export const TrackingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trackingData, setTrackingData] = useState<TrackingData>(INITIAL_TRACKING_DATA)

  // Singleton VisionManager instance retained across re-renders
  const visionManagerRef = useRef<VisionManager | null>(null)

  // Latch non-NONE action for 160ms to prevent React state batching from swallowing 33ms pulses
  const actionLatchRef = useRef<{ action: DirectionalAction; expiresAt: number }>({
    action: 'NONE',
    expiresAt: 0,
  })

  if (!visionManagerRef.current) {
    visionManagerRef.current = new VisionManager({
      onStatusChange: (status: TrackingStatus, errorMessage: string | null) => {
        setTrackingData((prev) => ({
          ...prev,
          status,
          errorMessage,
          facePresent: status === 'ACTIVE',
        }))
      },
      onFrameUpdate: (data: {
        landmarks: FaceLandmarks | null
        displacement: NormalizedDisplacement
        action: DirectionalAction
        calibration: CalibrationProgress
        fps: number
        facePresent: boolean
      }) => {
        const now = Date.now()
        let effectiveAction = data.action

        // Latch active gestures so React effects observe brief pulses,
        // but immediately release when head returns to neutral center (<0.08 offset or in dead-zone)
        const isNeutral = data.displacement.inDeadZone || Math.abs(data.displacement.deltaX) < 0.08

        if (data.action !== 'NONE') {
          actionLatchRef.current = { action: data.action, expiresAt: now + 160 }
        } else if (isNeutral) {
          actionLatchRef.current = { action: 'NONE', expiresAt: 0 }
          effectiveAction = 'NONE'
        } else if (now < actionLatchRef.current.expiresAt) {
          effectiveAction = actionLatchRef.current.action
        } else {
          actionLatchRef.current = { action: 'NONE', expiresAt: 0 }
          effectiveAction = 'NONE'
        }

        setTrackingData((prev) => ({
          ...prev,
          landmarks: data.landmarks,
          displacement: data.displacement,
          action: effectiveAction,
          calibration: data.calibration,
          fps: data.fps,
          facePresent: data.facePresent,
          baseline: visionManagerRef.current?.getBaseline() || prev.baseline,
        }))
      },
    })
  }

  const startCamera = useCallback(async (video?: HTMLVideoElement | null, canvas?: HTMLCanvasElement | null) => {
    if (visionManagerRef.current) {
      await visionManagerRef.current.start(video, canvas)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (visionManagerRef.current) {
      visionManagerRef.current.stop()
      setTrackingData(INITIAL_TRACKING_DATA)
    }
  }, [])

  const attachElements = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    if (visionManagerRef.current) {
      visionManagerRef.current.attachElements(video, canvas)
    }
  }, [])

  const detachElements = useCallback(() => {
    if (visionManagerRef.current) {
      visionManagerRef.current.detachElements()
    }
  }, [])

  const startCalibration = useCallback(() => {
    if (visionManagerRef.current) {
      visionManagerRef.current.startCalibration()
    }
  }, [])

  const cancelCalibration = useCallback(() => {
    if (visionManagerRef.current) {
      visionManagerRef.current.cancelCalibration()
    }
  }, [])

  const recalibrate = useCallback(() => {
    if (visionManagerRef.current) {
      visionManagerRef.current.setBaseline(null)
      visionManagerRef.current.startCalibration()
    }
  }, [])

  // Guarantee that on component unmount (or application teardown), all vision resources are completely disposed
  useEffect(() => {
    return () => {
      if (visionManagerRef.current) {
        visionManagerRef.current.dispose()
      }
    }
  }, [])

  const resetGestures = useCallback(() => {
    actionLatchRef.current = { action: 'NONE', expiresAt: 0 }
    if (visionManagerRef.current) {
      visionManagerRef.current.resetClassifier()
    }
  }, [])

  const isCameraActive =
    trackingData.status === 'ACTIVE' ||
    trackingData.status === 'TRACKING_LOST' ||
    trackingData.status === 'INITIALIZING'

  return (
    <TrackingContext.Provider
      value={{
        trackingData,
        startCamera,
        stopCamera,
        attachElements,
        detachElements,
        startCalibration,
        cancelCalibration,
        recalibrate,
        resetGestures,
        isCameraActive,
      }}
    >
      {children}
    </TrackingContext.Provider>
  )
}

export const useTracking = (): TrackingContextValue => {
  const context = useContext(TrackingContext)
  if (!context) {
    throw new Error('useTracking must be used within a TrackingProvider')
  }
  return context
}

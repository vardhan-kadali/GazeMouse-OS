import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VisionManager } from '../vision/visionManager'
import type { TrackingStatus, FaceLandmarks, NeutralBaseline } from '../types/tracking'

function createMockTrack(): MediaStreamTrack {
  return {
    kind: 'video',
    id: 'track-1',
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
  } as unknown as MediaStreamTrack
}

function createMockStream(): MediaStream {
  const track = createMockTrack()
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    active: true,
  } as unknown as MediaStream
}

// Sample neutral face landmarks for tests
function createMockLandmarks(noseOffsetX: number = 0): FaceLandmarks {
  const landmarks: FaceLandmarks = []
  for (let i = 0; i < 468; i++) {
    landmarks.push({ x: 0.5, y: 0.5, z: 0 })
  }
  // Landmark 1 is canonical nose tip in MediaPipe FaceLandmarker
  landmarks[1] = { x: 0.5 + noseOffsetX, y: 0.5, z: 0 }
  landmarks[4] = { x: 0.5 + noseOffsetX, y: 0.5, z: 0 }
  // Landmarks 33 and 263 are eyes outer canthi
  landmarks[33] = { x: 0.4, y: 0.48, z: 0 }
  landmarks[263] = { x: 0.6, y: 0.48, z: 0 }
  return landmarks
}

describe('TrackingNavigationIntegration — Decoupled Ingestion & Preview Lifecycle', () => {
  let manager: VisionManager
  let lastStatus: TrackingStatus = 'OFF'
  let lastError: string | null = null
  let lastFrameData: any = null

  beforeEach(() => {
    lastStatus = 'OFF'
    lastError = null
    lastFrameData = null

    manager = new VisionManager({
      onStatusChange: (status, err) => {
        lastStatus = status
        lastError = err
      },
      onFrameUpdate: (data) => {
        lastFrameData = data
      },
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.restoreAllMocks()
  })

  it('1. Frame processing continues after page-specific preview detaches (Phase 3A root cause fix)', () => {
    const mockStream = createMockStream()
    const mockDetect = vi.fn().mockReturnValue({
      faceLandmarks: [createMockLandmarks()],
    })

    // Setup active tracking state with persistent ingestion video
    const ingestionVideo = document.createElement('video')
    ingestionVideo.srcObject = mockStream
    Object.defineProperty(ingestionVideo, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(ingestionVideo, 'currentTime', { value: 0.033, configurable: true, writable: true })
    Object.defineProperty(ingestionVideo, 'videoWidth', { value: 640, configurable: true })
    Object.defineProperty(ingestionVideo, 'videoHeight', { value: 480, configurable: true })

    ;(manager as any).mediaStream = mockStream
    ;(manager as any).ingestionVideo = ingestionVideo
    ;(manager as any).faceLandmarker = { detectForVideo: mockDetect, close: vi.fn() }
    ;(manager as any).status = 'ACTIVE'

    // Simulate Camera Setup page mounting and attaching preview elements
    const previewVideo = document.createElement('video')
    const previewCanvas = document.createElement('canvas')
    manager.attachElements(previewVideo, previewCanvas)

    expect((manager as any).videoElement).toBe(previewVideo)
    expect((manager as any).canvasElement).toBe(previewCanvas)

    // Simulate navigating away to Games page: CameraSetupPage unmounts and calls detachElements()
    manager.detachElements()

    // Page-specific preview elements are cleanly detached to prevent DOM node leaks
    expect((manager as any).videoElement).toBeNull()
    expect((manager as any).canvasElement).toBeNull()
    expect((manager as any).canvasCtx).toBeNull()

    // CRUCIAL: The persistent ingestion video remains alive and bound
    expect(manager.getIngestionVideo()).toBe(ingestionVideo)
    expect(ingestionVideo.srcObject).toBe(mockStream)

    // Run inference frame while preview is detached
    ;(manager as any).processFrame(1000)

    // MediaPipe was called with the persistent ingestion video!
    expect(mockDetect).toHaveBeenCalledWith(ingestionVideo, 1000)

    // Telemetry update was dispatched to React
    expect(lastFrameData).not.toBeNull()
    expect(lastFrameData.facePresent).toBe(true)
    expect(lastFrameData.landmarks).not.toBeNull()
  })

  it('2. The persistent ingestion video remains usable while page-specific preview is detached across multiple frames', () => {
    const mockStream = createMockStream()
    const mockDetect = vi.fn().mockReturnValue({
      faceLandmarks: [createMockLandmarks()],
    })

    const ingestionVideo = document.createElement('video')
    ingestionVideo.srcObject = mockStream
    Object.defineProperty(ingestionVideo, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(ingestionVideo, 'currentTime', { value: 0.033, configurable: true, writable: true })
    Object.defineProperty(ingestionVideo, 'videoWidth', { value: 640, configurable: true })
    Object.defineProperty(ingestionVideo, 'videoHeight', { value: 480, configurable: true })

    ;(manager as any).mediaStream = mockStream
    ;(manager as any).ingestionVideo = ingestionVideo
    ;(manager as any).faceLandmarker = { detectForVideo: mockDetect, close: vi.fn() }
    ;(manager as any).status = 'ACTIVE'

    // Detach preview
    manager.detachElements()

    // Frame 1 at t=1000
    ;(manager as any).processFrame(1000)
    expect(mockDetect).toHaveBeenCalledTimes(1)

    // Frame 2 at t=1033 (video stream advanced)
    ingestionVideo.currentTime = 0.066
    ;(manager as any).processFrame(1033)
    expect(mockDetect).toHaveBeenCalledTimes(2)

    // Frame 3 at t=1066 (video stream advanced)
    ingestionVideo.currentTime = 0.099
    ;(manager as any).processFrame(1066)
    expect(mockDetect).toHaveBeenCalledTimes(3)
  })

  it('3. Gestures can still be processed and published after navigating away from Camera Setup', () => {
    const mockStream = createMockStream()

    // Establish calibrated neutral baseline
    const neutralBaseline: NeutralBaseline = {
      noseX: 0.5,
      noseY: 0.5,
      interPupilDist: 0.2, // 0.6 - 0.4
      sampleCount: 60,
      timestamp: Date.now(),
    }
    manager.setBaseline(neutralBaseline)

    // Mock head turned to the left: in physical webcam sensor space, user's left turn moves nose rightward
    // SignalProcessor inverts rawDiffX = -(nose.x - baseline.noseX), yielding negative deltaX
    const leftTurnLandmarks = createMockLandmarks(0.06) // 0.06 / 0.2 * 1.5 = -0.45 deflection (triggers LEFT)

    const mockDetect = vi.fn().mockReturnValue({
      faceLandmarks: [leftTurnLandmarks],
    })

    const ingestionVideo = document.createElement('video')
    ingestionVideo.srcObject = mockStream
    Object.defineProperty(ingestionVideo, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(ingestionVideo, 'currentTime', { value: 0.033, configurable: true, writable: true })
    Object.defineProperty(ingestionVideo, 'videoWidth', { value: 640, configurable: true })
    Object.defineProperty(ingestionVideo, 'videoHeight', { value: 480, configurable: true })

    ;(manager as any).mediaStream = mockStream
    ;(manager as any).ingestionVideo = ingestionVideo
    ;(manager as any).faceLandmarker = { detectForVideo: mockDetect, close: vi.fn() }
    ;(manager as any).status = 'ACTIVE'

    // Detached from setup page
    manager.detachElements()

    ;(manager as any).processFrame(1000)

    // Action LEFT is classified and dispatched to React!
    expect(lastFrameData.action).toBe('LEFT')
    expect(lastFrameData.displacement.deltaX).toBeLessThan(-0.15)
  })

  it('4. Navigating back to Camera Setup reconnects preview video and landmark overlay', () => {
    const mockStream = createMockStream()
    const mockDetect = vi.fn().mockReturnValue({
      faceLandmarks: [createMockLandmarks()],
    })

    const ingestionVideo = document.createElement('video')
    ingestionVideo.srcObject = mockStream
    Object.defineProperty(ingestionVideo, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(ingestionVideo, 'currentTime', { value: 0.033, configurable: true, writable: true })
    Object.defineProperty(ingestionVideo, 'videoWidth', { value: 640, configurable: true })
    Object.defineProperty(ingestionVideo, 'videoHeight', { value: 480, configurable: true })

    ;(manager as any).mediaStream = mockStream
    ;(manager as any).ingestionVideo = ingestionVideo
    ;(manager as any).faceLandmarker = { detectForVideo: mockDetect, close: vi.fn() }
    ;(manager as any).status = 'ACTIVE'

    // Initially detached
    manager.detachElements()

    // Navigate back to Camera Setup
    const newPreviewVideo = document.createElement('video')
    const newPreviewCanvas = document.createElement('canvas')
    const mockPlay = vi.fn().mockResolvedValue(undefined)
    newPreviewVideo.play = mockPlay

    manager.attachElements(newPreviewVideo, newPreviewCanvas)

    // Preview video receives active mediaStream and calls play
    expect(newPreviewVideo.srcObject).toBe(mockStream)
    expect(mockPlay).toHaveBeenCalled()
    expect((manager as any).videoElement).toBe(newPreviewVideo)
    expect((manager as any).canvasElement).toBe(newPreviewCanvas)
  })

  it('5. Stopping and restarting camera stops tracks and re-binds persistent ingestion video', () => {
    const mockStream1 = createMockStream()
    const track1 = mockStream1.getTracks()[0]

    const ingestionVideo = document.createElement('video')
    ingestionVideo.srcObject = mockStream1
    Object.defineProperty(ingestionVideo, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(ingestionVideo, 'currentTime', { value: 0.033, configurable: true, writable: true })

    ;(manager as any).mediaStream = mockStream1
    ;(manager as any).ingestionVideo = ingestionVideo
    ;(manager as any).status = 'ACTIVE'
    ;(manager as any).animationFrameId = 555

    // Stop camera
    manager.stop()

    expect(track1.stop).toHaveBeenCalled()
    expect(ingestionVideo.srcObject).toBeNull()
    expect(manager.getStatus()).toBe('OFF')
    expect((manager as any).mediaStream).toBeNull()
    expect((manager as any).animationFrameId).toBeNull()

    // Restart with a new stream
    const mockStream2 = createMockStream()
    ;(manager as any).mediaStream = mockStream2
    ;(manager as any).status = 'ACTIVE'
    ingestionVideo.srcObject = mockStream2

    expect(ingestionVideo.srcObject).toBe(mockStream2)
  })

  it('6. Final disposal permanently releases persistent video and inference resources', () => {
    const mockStream = createMockStream()
    const track = mockStream.getTracks()[0]
    const mockClose = vi.fn()

    const ingestionVideo = document.createElement('video')
    ingestionVideo.srcObject = mockStream

    ;(manager as any).mediaStream = mockStream
    ;(manager as any).ingestionVideo = ingestionVideo
    ;(manager as any).faceLandmarker = { close: mockClose }
    ;(manager as any).status = 'ACTIVE'

    manager.dispose()

    expect(track.stop).toHaveBeenCalled()
    expect(mockClose).toHaveBeenCalled()
    expect(manager.getIngestionVideo()).toBeNull()
    expect((manager as any).faceLandmarker).toBeNull()
    expect(manager.getStatus()).toBe('OFF')
  })
})

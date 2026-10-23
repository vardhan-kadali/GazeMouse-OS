import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VisionManager } from '../vision/visionManager'
import type { TrackingStatus } from '../types/tracking'

describe('VisionManager Lifecycle & Teardown', () => {
  let manager: VisionManager
  let lastStatus: TrackingStatus = 'OFF'
  let lastError: string | null = null

  beforeEach(() => {
    lastStatus = 'OFF'
    lastError = null
    manager = new VisionManager({
      onStatusChange: (status, err) => {
        lastStatus = status
        lastError = err
      },
      onFrameUpdate: () => {},
    })
  })

  it('initializes in OFF status with null elements and no active stream', () => {
    expect(manager.getStatus()).toBe('OFF')
    expect(manager.getErrorMessage()).toBeNull()
    expect(manager.getBaseline()).toBeNull()
  })

  it('attaches DOM elements and re-binds mediaStream when attachElements is called', () => {
    const mockVideo = document.createElement('video')
    const mockCanvas = document.createElement('canvas')
    const mockPlay = vi.fn().mockResolvedValue(undefined)
    mockVideo.play = mockPlay

    const mockTrack = { stop: vi.fn() } as unknown as MediaStreamTrack
    const mockStream = {
      getTracks: () => [mockTrack],
    } as unknown as MediaStream

    // Inject active stream to test re-attachment
    ;(manager as any).mediaStream = mockStream

    manager.attachElements(mockVideo, mockCanvas)

    expect(mockVideo.srcObject).toBe(mockStream)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('detaches DOM elements safely on detachElements to avoid retaining unmounted nodes', () => {
    const mockVideo = document.createElement('video')
    const mockCanvas = document.createElement('canvas')
    mockVideo.srcObject = {} as MediaStream

    manager.attachElements(mockVideo, mockCanvas)
    expect(mockVideo.srcObject).not.toBeNull()

    manager.detachElements()

    expect(mockVideo.srcObject).toBeNull()
    expect((manager as any).videoElement).toBeNull()
    expect((manager as any).canvasElement).toBeNull()
    expect((manager as any).canvasCtx).toBeNull()
  })

  it('stops all media tracks, cancels animation frames, and resets state on stop()', () => {
    const mockTrack1 = { stop: vi.fn() } as unknown as MediaStreamTrack
    const mockTrack2 = { stop: vi.fn() } as unknown as MediaStreamTrack
    const mockStream = {
      getTracks: () => [mockTrack1, mockTrack2],
    } as unknown as MediaStream

    ;(manager as any).mediaStream = mockStream
    ;(manager as any).animationFrameId = 1234
    ;(manager as any).status = 'ACTIVE'

    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')

    manager.stop()

    expect(mockTrack1.stop).toHaveBeenCalled()
    expect(mockTrack2.stop).toHaveBeenCalled()
    expect(cancelSpy).toHaveBeenCalledWith(1234)
    expect(manager.getStatus()).toBe('OFF')
    expect((manager as any).animationFrameId).toBeNull()
    expect((manager as any).mediaStream).toBeNull()

    cancelSpy.mockRestore()
  })

  it('disposes of FaceLandmarker instance via close() during permanent teardown', () => {
    const mockClose = vi.fn()
    ;(manager as any).faceLandmarker = { close: mockClose }

    const stopSpy = vi.spyOn(manager, 'stop')

    manager.dispose()

    expect(stopSpy).toHaveBeenCalled()
    expect(mockClose).toHaveBeenCalled()
    expect((manager as any).faceLandmarker).toBeNull()

    stopSpy.mockRestore()
  })

  it('handles multiple consecutive dispose() calls idempotently without throwing', () => {
    expect(() => {
      manager.dispose()
      manager.dispose()
    }).not.toThrow()
  })
})

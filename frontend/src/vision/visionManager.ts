import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision'
import type {
  FaceLandmarks,
  NeutralBaseline,
  NormalizedDisplacement,
  DirectionalAction,
  TrackingStatus,
  CalibrationState,
  CalibrationProgress,
} from '../types/tracking'
import { INITIAL_DISPLACEMENT } from '../types/tracking'
import { SignalProcessor, CalibrationAccumulator, LANDMARK_INDEX_NOSE_TIP, LANDMARK_INDEX_LEFT_EYE_OUTER, LANDMARK_INDEX_RIGHT_EYE_OUTER } from './signalProcessor'
import { GestureClassifier } from './gestureClassifier'
import type { UserSettings } from '../types/settings'

export interface VisionManagerCallbacks {
  onStatusChange: (status: TrackingStatus, errorMessage: string | null) => void
  onFrameUpdate: (data: {
    landmarks: FaceLandmarks | null
    displacement: NormalizedDisplacement
    action: DirectionalAction
    calibration: CalibrationProgress
    fps: number
    facePresent: boolean
  }) => void
}

export class VisionManager {
  // Dedicated persistent ingestion video element for MediaPipe inference (lives across route changes)
  private ingestionVideo: HTMLVideoElement | null = null

  // Page-specific preview elements (can be attached/detached as user navigates to/from setup)
  private videoElement: HTMLVideoElement | null = null
  private canvasElement: HTMLCanvasElement | null = null
  private canvasCtx: CanvasRenderingContext2D | null = null

  private mediaStream: MediaStream | null = null
  private faceLandmarker: FaceLandmarker | null = null
  private animationFrameId: number | null = null

  private status: TrackingStatus = 'OFF'
  private errorMessage: string | null = null
  private isInitializing: boolean = false

  private signalProcessor = new SignalProcessor()
  private gestureClassifier = new GestureClassifier()
  private calibrationAccumulator = new CalibrationAccumulator()

  private baseline: NeutralBaseline | null = null
  private calibrationState: CalibrationState = 'IDLE'
  private countdownTimer: number = 3
  private countdownIntervalId: number | null = null
  private samplingStartTime: number = 0
  private readonly SAMPLING_DURATION_MS = 2000 // 2 seconds sampling window

  private lastVideoTime = -1
  private lastFaceDetectedTime = 0
  private frameCount = 0
  private lastFpsCalcTime = performance.now()
  private currentFps = 0

  private callbacks: VisionManagerCallbacks

  constructor(callbacks: VisionManagerCallbacks) {
    this.callbacks = callbacks
  }

  public getIngestionVideo(): HTMLVideoElement | null {
    return this.ingestionVideo
  }

  public setElements(video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null): void {
    this.videoElement = video
    this.canvasElement = canvas
    this.canvasCtx = canvas ? canvas.getContext('2d') : null
  }

  /**
   * Attaches new video and canvas DOM preview elements to an active tracking stream.
   * Useful when navigating to or returning to Camera Setup page.
   */
  public attachElements(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
    this.videoElement = video
    this.canvasElement = canvas
    this.canvasCtx = canvas.getContext('2d')

    if (this.mediaStream && video.srcObject !== this.mediaStream) {
      video.srcObject = this.mediaStream
      if (typeof video.play === 'function') {
        try {
          const p = video.play()
          if (p && typeof p.catch === 'function') {
            p.catch((err) => {
              console.warn('Could not auto-play reattached preview video element:', err)
            })
          }
        } catch (e) {
          // Safe ignore in environments without full media playback support
        }
      }
    }
  }

  /**
   * Detaches page-level preview DOM elements when the hosting page unmounts.
   * Crucially, does NOT detach the persistent ingestion video, ensuring
   * background MediaPipe tracking continues across page navigation.
   */
  public detachElements(): void {
    if (this.videoElement) {
      this.videoElement.srcObject = null
      this.videoElement = null
    }
    this.canvasElement = null
    this.canvasCtx = null
  }

  public getStatus(): TrackingStatus {
    return this.status
  }

  public getErrorMessage(): string | null {
    return this.errorMessage
  }

  public getBaseline(): NeutralBaseline | null {
    return this.baseline
  }

  public setBaseline(baseline: NeutralBaseline | null): void {
    this.baseline = baseline
    this.signalProcessor.reset()
    this.gestureClassifier.reset()
  }

  /**
   * Initializes the MediaPipe FaceLandmarker model.
   * Attempts to load from local bundled assets first with safe CDN fallback.
   */
  public async initializeModel(): Promise<void> {
    if (this.faceLandmarker) return

    try {
      // 1. Resolve vision WebAssembly loader (try local /wasm/ first, fallback to CDN)
      let filesetResolver: any
      try {
        filesetResolver = await FilesetResolver.forVisionTasks('/wasm')
      } catch (localWasmErr) {
        console.warn('Local Wasm resolution failed, falling back to official CDN:', localWasmErr)
        filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'
        )
      }

      // 2. Initialize FaceLandmarker with Float16 model bundle
      let modelPath = '/models/face_landmarker.task'
      try {
        this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        })
      } catch (gpuErr) {
        console.warn('GPU delegate failed, attempting CPU delegate with local model:', gpuErr)
        try {
          this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          })
        } catch (localCpuErr) {
          console.warn('Local model CPU load failed, attempting remote CDN fallback:', localCpuErr)
          this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          })
        }
      }
    } catch (err: any) {
      console.error('Failed to initialize MediaPipe FaceLandmarker:', err)
      throw new Error(`Vision model initialization failed: ${err?.message || 'Unsupported WebAssembly environment'}`)
    }
  }

  /**
   * Requests camera access after explicit user button click and begins the real tracking loop.
   */
  public async start(previewVideo?: HTMLVideoElement | null, previewCanvas?: HTMLCanvasElement | null): Promise<void> {
    if (this.isInitializing || this.status === 'ACTIVE') return
    this.isInitializing = true

    if (previewVideo && previewCanvas) {
      this.attachElements(previewVideo, previewCanvas)
    }
    this.updateStatus('INITIALIZING', null)

    try {
      // 1. Verify Browser Support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser. Please use Chrome, Edge, or Firefox.')
      }

      // 2. Initialize MediaPipe Model
      await this.initializeModel()

      // 3. Request Camera Stream (mirrored user webcam @ 640x480)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      })

      // 4. Set up dedicated persistent ingestion video element for MediaPipe inference
      if (!this.ingestionVideo) {
        this.ingestionVideo = document.createElement('video')
        this.ingestionVideo.setAttribute('playsinline', 'true')
        this.ingestionVideo.setAttribute('muted', 'true')
        this.ingestionVideo.muted = true
        this.ingestionVideo.autoplay = true
      }
      this.ingestionVideo.srcObject = this.mediaStream
      if (typeof this.ingestionVideo.play === 'function') {
        try {
          const playPromise = this.ingestionVideo.play()
          if (playPromise && typeof playPromise.catch === 'function') {
            await playPromise.catch((err) => {
              console.warn('Ingestion video play warning:', err)
            })
          }
        } catch (e) {
          // Safe ignore in environments without media playback
        }
      }

      // 5. If page preview element is mounted, bind stream to preview video as well
      if (this.videoElement) {
        this.videoElement.srcObject = this.mediaStream
        if (typeof this.videoElement.play === 'function') {
          try {
            const previewPromise = this.videoElement.play()
            if (previewPromise && typeof previewPromise.catch === 'function') {
              await previewPromise.catch((err) => {
                console.warn('Preview video play warning:', err)
              })
            }
          } catch (e) {
            // Safe ignore
          }
        }
      }

      this.updateStatus('ACTIVE', null)
      this.lastFaceDetectedTime = performance.now()
      this.isInitializing = false

      // 6. Begin continuous tracking render loop
      this.startLoop()
    } catch (err: any) {
      this.isInitializing = false
      let msg = err?.message || 'Unable to access webcam.'

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        this.updateStatus('PERMISSION_DENIED', 'Camera permission was denied. Please allow camera access in your browser address bar.')
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        this.updateStatus('UNAVAILABLE', 'No webcam was detected on your device. Please connect a camera.')
      } else {
        this.updateStatus('ERROR', msg)
      }
      this.stop()
    }
  }

  /**
   * Completely stops all camera tracks, cancels animation frames, and resets tracking state.
   */
  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.countdownIntervalId !== null) {
      clearInterval(this.countdownIntervalId)
      this.countdownIntervalId = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch (e) {
          console.warn('Error stopping track:', e)
        }
      })
      this.mediaStream = null
    }

    if (this.ingestionVideo) {
      this.ingestionVideo.srcObject = null
      if (typeof this.ingestionVideo.pause === 'function') {
        this.ingestionVideo.pause()
      }
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null
    }

    if (this.canvasElement && this.canvasCtx) {
      this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height)
    }

    this.signalProcessor.reset()
    this.gestureClassifier.reset()
    this.calibrationAccumulator.reset()
    this.calibrationState = 'IDLE'
    this.isInitializing = false
    if (this.status !== 'PERMISSION_DENIED' && this.status !== 'UNAVAILABLE') {
      this.updateStatus('OFF', null)
    }
  }

  /**
   * Resets the signal processor and gesture classifier states without stopping the video stream.
   * Useful when starting or restarting a game so previous gestures do not persist.
   */
  public resetClassifier(): void {
    this.signalProcessor.reset()
    this.gestureClassifier.reset()
  }

  /**
   * Permanently disposes of all vision resources, camera hardware tracks,
   * animation frame loops, persistent ingestion video, and closes the MediaPipe FaceLandmarker WebAssembly instance.
   */
  public dispose(): void {
    this.stop()
    if (this.ingestionVideo) {
      this.ingestionVideo = null
    }
    if (this.faceLandmarker) {
      try {
        this.faceLandmarker.close()
      } catch (e) {
        console.warn('Error closing FaceLandmarker instance:', e)
      }
      this.faceLandmarker = null
    }
  }

  /**
   * Triggers the neutral calibration workflow:
   * 1. 3-second preparation countdown (3... 2... 1...)
   * 2. 2-second sampling window (~60 frames)
   * 3. Averages samples to calculate neutral baseline (0,0)
   */
  public startCalibration(): void {
    if (this.status !== 'ACTIVE' && this.status !== 'TRACKING_LOST') {
      console.warn('Cannot calibrate when camera is inactive.')
      return
    }

    this.calibrationState = 'PREPARING'
    this.countdownTimer = 3
    this.calibrationAccumulator.reset()

    if (this.countdownIntervalId !== null) {
      clearInterval(this.countdownIntervalId)
    }

    this.countdownIntervalId = window.setInterval(() => {
      this.countdownTimer -= 1
      if (this.countdownTimer <= 0) {
        if (this.countdownIntervalId !== null) {
          clearInterval(this.countdownIntervalId)
          this.countdownIntervalId = null
        }
        // Transition to 2-second sampling phase
        this.calibrationState = 'SAMPLING'
        this.samplingStartTime = performance.now()
      }
    }, 1000)
  }

  public cancelCalibration(): void {
    if (this.countdownIntervalId !== null) {
      clearInterval(this.countdownIntervalId)
      this.countdownIntervalId = null
    }
    this.calibrationState = 'IDLE'
    this.calibrationAccumulator.reset()
  }

  /**
   * Main per-frame animation and vision detection loop.
   */
  private startLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    const loop = (currentTime: number) => {
      if (this.status !== 'ACTIVE' && this.status !== 'TRACKING_LOST') {
        return
      }

      this.processFrame(currentTime)
      this.animationFrameId = requestAnimationFrame(loop)
    }

    this.animationFrameId = requestAnimationFrame(loop)
  }

  private processFrame(currentTime: number): void {
    const video = this.ingestionVideo
    if (!video || !this.faceLandmarker || (video.readyState !== undefined && video.readyState < 2)) {
      return
    }

    // Calculate real-time FPS
    this.frameCount++
    if (currentTime - this.lastFpsCalcTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsCalcTime))
      this.frameCount = 0
      this.lastFpsCalcTime = currentTime
    }

    // Only run MediaPipe inference and gesture updates when the video stream has advanced to a new frame
    if (video.currentTime === this.lastVideoTime && this.lastVideoTime !== -1) {
      return
    }
    this.lastVideoTime = video.currentTime

    let landmarks: FaceLandmarks | null = null
    let facePresent = false

    try {
      const results = this.faceLandmarker.detectForVideo(video, Math.round(currentTime))

      if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        landmarks = results.faceLandmarks[0] as FaceLandmarks
        facePresent = true
        this.lastFaceDetectedTime = currentTime

        if (this.status === 'TRACKING_LOST') {
          this.updateStatus('ACTIVE', null)
          this.signalProcessor.reset()
          this.gestureClassifier.reset()
        }
      }
    } catch (e) {
      console.warn('Frame landmark detection warning:', e)
    }

    // Check for tracking loss timeout (> 300ms without face)
    if (!facePresent && currentTime - this.lastFaceDetectedTime > 300) {
      if (this.status === 'ACTIVE') {
        this.updateStatus('TRACKING_LOST', 'Face lost from camera view. Please center your face.')
        this.signalProcessor.reset()
        this.gestureClassifier.reset()
      }
    }

    // Handle Active Calibration Progression
    let calibrationProgress: CalibrationProgress = {
      state: this.calibrationState,
      countdownSeconds: this.countdownTimer,
      samplingPercent: 0,
      sampleCount: this.calibrationAccumulator.getSampleCount(),
      errorMessage: null,
    }

    if (this.calibrationState === 'SAMPLING') {
      const elapsed = currentTime - this.samplingStartTime
      const percent = Math.min(100, Math.round((elapsed / this.SAMPLING_DURATION_MS) * 100))
      calibrationProgress.samplingPercent = percent

      if (landmarks) {
        this.calibrationAccumulator.addSample(landmarks)
        calibrationProgress.sampleCount = this.calibrationAccumulator.getSampleCount()
      }

      if (elapsed >= this.SAMPLING_DURATION_MS) {
        // Finalize 2-second sampling window
        const result = this.calibrationAccumulator.finalize(20)
        if (result.baseline) {
          this.baseline = result.baseline
          this.calibrationState = 'SUCCESS'
          calibrationProgress.state = 'SUCCESS'
          this.signalProcessor.reset()
          this.gestureClassifier.reset()
        } else {
          this.calibrationState = 'FAILED'
          calibrationProgress.state = 'FAILED'
          calibrationProgress.errorMessage = result.error
        }
      }
    }

    // Process Movement Signals if Calibrated Baseline Exists
    let displacement: NormalizedDisplacement = INITIAL_DISPLACEMENT
    let action: DirectionalAction = 'NONE'

    if (landmarks && this.baseline) {
      // Read current dynamic user settings
      const settings = this.getCurrentSettings()

      displacement = this.signalProcessor.process(landmarks, this.baseline, {
        sensitivity: settings.sensitivity,
        smoothing: settings.smoothing,
        deadZonePercent: settings.deadZone,
        verticalGestures: settings.verticalGestures,
      })

      action = this.gestureClassifier.classify(displacement, {
        verticalGestures: settings.verticalGestures,
      })
    }

    // Render Real Landmark Mesh onto Overlay Canvas if preview canvas is attached
    if (this.canvasElement && this.canvasCtx && video.videoWidth > 0) {
      this.drawLandmarksOverlay(landmarks, displacement, action)
    }

    // Dispatch processed frame telemetry
    this.callbacks.onFrameUpdate({
      landmarks,
      displacement,
      action,
      calibration: calibrationProgress,
      fps: this.currentFps,
      facePresent,
    })
  }

  /**
   * Renders the mirrored landmark mesh, center reticle, and target direction cues.
   */
  private drawLandmarksOverlay(
    landmarks: FaceLandmarks | null,
    displacement: NormalizedDisplacement,
    _action: DirectionalAction
  ): void {
    const ctx = this.canvasCtx
    const canvas = this.canvasElement
    const video = this.videoElement || this.ingestionVideo
    if (!ctx || !canvas || !video) return

    // Ensure canvas internal pixel dimensions match incoming video stream
    if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!landmarks) return

    const w = canvas.width
    const h = canvas.height

    // 1. Draw subtle connecting facial mesh points
    ctx.fillStyle = 'rgba(37, 99, 235, 0.4)' // Primary Blue translucent
    const sampleIndices = [
      10, 152, 234, 454, 61, 291, 197, 168, 5, 4, // Facial contour & centerline
    ]
    for (const idx of sampleIndices) {
      const pt = landmarks[idx]
      if (pt) {
        ctx.beginPath()
        ctx.arc(pt.x * w, pt.y * h, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 2. Highlight Eyes Outer Canthi in Green
    ctx.fillStyle = '#15803d'
    const leftEye = landmarks[LANDMARK_INDEX_LEFT_EYE_OUTER]
    const rightEye = landmarks[LANDMARK_INDEX_RIGHT_EYE_OUTER]
    if (leftEye) {
      ctx.beginPath()
      ctx.arc(leftEye.x * w, leftEye.y * h, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    if (rightEye) {
      ctx.beginPath()
      ctx.arc(rightEye.x * w, rightEye.y * h, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // 3. Highlight Nose Tip (Primary tracking anchor)
    const nose = landmarks[LANDMARK_INDEX_NOSE_TIP]
    if (nose) {
      const nx = nose.x * w
      const ny = nose.y * h

      ctx.fillStyle = displacement.inDeadZone ? '#2563eb' : '#1e3a8a'
      ctx.beginPath()
      ctx.arc(nx, ny, 6, 0, Math.PI * 2)
      ctx.fill()

      // Draw active displacement vector line if deflected
      if (this.baseline && !displacement.inDeadZone) {
        const bx = this.baseline.noseX * w
        const by = this.baseline.noseY * h

        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 2])
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(nx, ny)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // 4. Draw Neutral Baseline Target Circle
    if (this.baseline) {
      const bx = this.baseline.noseX * w
      const by = this.baseline.noseY * h

      ctx.strokeStyle = 'rgba(21, 128, 61, 0.7)' // Green dashed circle
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(bx, by, 10, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private getCurrentSettings(): UserSettings {
    try {
      const stored = localStorage.getItem('gazemouse_user_settings_v1')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (e) {
      // Fallback
    }
    return {
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
  }

  private updateStatus(status: TrackingStatus, errorMessage: string | null): void {
    this.status = status
    this.errorMessage = errorMessage
    this.callbacks.onStatusChange(status, errorMessage)
  }
}

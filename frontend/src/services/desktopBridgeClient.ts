/**
 * Client service for connecting GazeMouse-OS frontend to the local Desktop Input Bridge.
 * Binds strictly to loopback (ws://127.0.0.1:8765) and validates state transitions.
 */

export type BridgeState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISABLED' | 'ENABLED' | 'STOPPED' | 'ERROR'

export type BridgeAction = 'LEFT' | 'RIGHT' | 'JUMP' | 'SLIDE'

export interface BridgeStatus {
  state: BridgeState
  foregroundAllowed: boolean
  activeTitle: string
  emergencyStopActive: boolean
  errorMessage: string | null
}

export interface DesktopBridgeClientOptions {
  onStatusChange?: (status: BridgeStatus) => void
  onActionExecuted?: (action: BridgeAction, success: boolean) => void
  host?: string
  port?: number
}

export class DesktopBridgeClient {
  private ws: WebSocket | null = null
  private host: string
  private port: number
  private token: string = ''
  private heartbeatInterval: number | null = null
  private options: DesktopBridgeClientOptions

  private currentStatus: BridgeStatus = {
    state: 'DISCONNECTED',
    foregroundAllowed: false,
    activeTitle: '',
    emergencyStopActive: false,
    errorMessage: null,
  }

  constructor(options: DesktopBridgeClientOptions = {}) {
    this.options = options
    this.host = options.host || '127.0.0.1'
    this.port = options.port || 8765
  }

  public getStatus(): BridgeStatus {
    return { ...this.currentStatus }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  public isEnabled(): boolean {
    return this.currentStatus.state === 'ENABLED'
  }

  public isStopped(): boolean {
    return this.currentStatus.state === 'STOPPED'
  }

  /**
   * Connects to the local bridge WebSocket using token authentication.
   */
  public async connect(token: string): Promise<void> {
    if (!token || !token.trim()) {
      this.updateStatus({
        state: 'ERROR',
        errorMessage: 'Authentication token is required to connect to the desktop bridge.',
      })
      throw new Error('Token required')
    }

    this.token = token.trim()
    this.disconnect()

    this.updateStatus({
      state: 'CONNECTING',
      errorMessage: null,
    })

    const url = `ws://${this.host}:${this.port}/?token=${encodeURIComponent(this.token)}`

    return new Promise((resolve, reject) => {
      let isSettled = false

      try {
        // Connect to loopback WebSocket with authenticated token query parameter
        this.ws = new WebSocket(url)
      } catch (err) {
        this.updateStatus({
          state: 'ERROR',
          errorMessage: `Failed to construct WebSocket: ${err instanceof Error ? err.message : String(err)}`,
        })
        reject(err)
        return
      }

      this.ws.onopen = () => {
        isSettled = true
        this.startHeartbeat()
        this.updateStatus({
          state: 'CONNECTED',
          errorMessage: null,
        })
        this.requestStatus()
        resolve()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onerror = () => {
        if (!isSettled) {
          isSettled = true
          this.updateStatus({
            state: 'ERROR',
            errorMessage: 'Unable to connect to bridge at ws://127.0.0.1:8765. Verify the bridge is running.',
          })
          reject(new Error('Connection failed'))
        }
      }

      this.ws.onclose = (event) => {
        this.stopHeartbeat()
        const reason = event.reason || (event.code === 1006 ? 'Abnormal closure (Bridge closed connection)' : 'Connection closed')
        this.updateStatus({
          state: 'DISCONNECTED',
          foregroundAllowed: false,
          activeTitle: '',
          errorMessage: event.code === 1000 ? null : `Disconnected: ${reason} (code ${event.code})`,
        })
        if (!isSettled) {
          isSettled = true
          reject(new Error(reason))
        }
      }
    })
  }

  public disconnect(): void {
    this.stopHeartbeat()
    if (this.ws) {
      try {
        if (this.currentStatus.state === 'ENABLED') {
          this.disable()
        }
        this.ws.close(1000, 'Frontend requested disconnect')
      } catch {
        // Ignore close errors
      }
      this.ws = null
    }
    this.updateStatus({
      state: 'DISCONNECTED',
      foregroundAllowed: false,
      activeTitle: '',
      emergencyStopActive: false,
      errorMessage: null,
    })
  }

  public enable(): void {
    if (this.currentStatus.state === 'STOPPED') {
      this.updateStatus({
        errorMessage: 'Bridge is in EMERGENCY STOP state. You must reset the emergency stop before enabling.',
      })
      return
    }
    this.send({ type: 'ENABLE' })
  }

  public disable(): void {
    this.send({ type: 'DISABLE' })
  }

  public stop(): void {
    this.send({ type: 'STOP' })
  }

  public resetStop(): void {
    this.send({ type: 'RESET_STOP' })
  }

  public requestStatus(): void {
    this.send({ type: 'STATUS' })
  }

  public sendAction(action: BridgeAction): void {
    if (this.currentStatus.state !== 'ENABLED') {
      return
    }
    this.send({ type: 'ACTION', action })
  }

  public sendPing(): void {
    this.send({ type: 'PING', timestamp: Date.now() })
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg))
      } catch (err) {
        this.updateStatus({
          errorMessage: `Failed to send command: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    // Poll bridge status and refresh the inactivity watchdog every 1000ms
    this.heartbeatInterval = window.setInterval(() => {
      if (this.isConnected()) {
        this.requestStatus()
      }
    }, 1000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private handleMessage(rawData: string): void {
    try {
      const data = JSON.parse(rawData)
      const type = data.type

      switch (type) {
        case 'STATUS':
        case 'STATUS_UPDATE':
          this.updateStatus({
            state: (data.state || data.status) as BridgeState,
            foregroundAllowed: Boolean(data.foregroundAllowed),
            activeTitle: typeof data.activeTitle === 'string' ? data.activeTitle : this.currentStatus.activeTitle,
            emergencyStopActive: Boolean(data.emergencyStopActive || data.state === 'STOPPED' || data.status === 'STOPPED'),
            errorMessage: data.reason === 'WATCHDOG_TIMEOUT'
              ? 'Safety watchdog expired due to inactivity. Input has been automatically disabled.'
              : data.reason === 'FOREGROUND_NOT_ALLOWED'
              ? 'Foreground window is not approved. Input has been automatically disabled.'
              : null,
          })
          break

        case 'ENABLED':
          this.updateStatus({
            state: 'ENABLED',
            errorMessage: null,
          })
          break

        case 'DISABLED':
          this.updateStatus({
            state: 'DISABLED',
            errorMessage: null,
          })
          break

        case 'STOPPED':
          this.updateStatus({
            state: 'STOPPED',
            emergencyStopActive: true,
            errorMessage: 'Emergency stop activated. All inputs halted.',
          })
          break

        case 'RESET_STOP_ACK':
          this.updateStatus({
            state: 'DISABLED',
            emergencyStopActive: false,
            errorMessage: null,
          })
          break

        case 'RESET_STOP_REJECTED':
          this.updateStatus({
            state: 'STOPPED',
            emergencyStopActive: true,
            errorMessage: `Cannot reset emergency stop: ${data.reason || 'Hotkey still held'}`,
          })
          break

        case 'ENABLE_REJECTED':
          this.updateStatus({
            errorMessage: `Enable rejected: ${data.reason || 'Bridge is in STOPPED state'}`,
          })
          break

        case 'ACTION_EXECUTED':
          if (this.options.onActionExecuted && data.action) {
            this.options.onActionExecuted(data.action as BridgeAction, Boolean(data.success))
          }
          break

        case 'ACTION_REJECTED':
          if (data.status) {
            this.updateStatus({ state: data.status as BridgeState })
          }
          break

        case 'ERROR':
          this.updateStatus({
            errorMessage: data.message || 'Bridge reported an error.',
          })
          break

        case 'PONG':
          // Heartbeat acknowledged
          break

        default:
          break
      }
    } catch {
      // Ignore malformed responses
    }
  }

  private updateStatus(partial: Partial<BridgeStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...partial }
    if (this.options.onStatusChange) {
      this.options.onStatusChange(this.getStatus())
    }
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DesktopBridgeClient } from '../services/desktopBridgeClient'
import type { BridgeStatus, BridgeAction } from '../services/desktopBridgeClient'

// Mock WebSocket implementation for unit tests
class MockWebSocket {
  public static instances: MockWebSocket[] = []
  public url: string
  public protocols?: string | string[]
  public readyState: number = 0 // CONNECTING
  public onopen: ((event: unknown) => void) | null = null
  public onclose: ((event: { code: number; reason: string }) => void) | null = null
  public onerror: ((event: unknown) => void) | null = null
  public onmessage: ((event: { data: string }) => void) | null = null
  public sentMessages: string[] = []

  public static readonly CONNECTING = 0
  public static readonly OPEN = 1
  public static readonly CLOSING = 2
  public static readonly CLOSED = 3

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    MockWebSocket.instances.push(this)
  }

  public send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.sentMessages.push(data)
  }

  public close(code: number = 1000, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose({ code, reason })
    }
  }

  // Test helper to simulate server opening connection
  public simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) {
      this.onopen({})
    }
  }

  // Test helper to simulate incoming server message
  public simulateMessage(data: Record<string, unknown>): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) })
    }
  }

  // Test helper to simulate server error
  public simulateError(err: unknown = {}): void {
    if (this.onerror) {
      this.onerror(err)
    }
  }
}

describe('DesktopBridgeClient Service', () => {
  const originalWebSocket = global.WebSocket

  beforeEach(() => {
    MockWebSocket.instances = []
    // @ts-expect-error Mock WebSocket assignment
    global.WebSocket = MockWebSocket
    vi.useFakeTimers()
  })

  afterEach(() => {
    global.WebSocket = originalWebSocket
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('1. Initializes in DISCONNECTED state with default safe settings', () => {
    const client = new DesktopBridgeClient()
    const status = client.getStatus()

    expect(status.state).toBe('DISCONNECTED')
    expect(status.foregroundAllowed).toBe(false)
    expect(status.emergencyStopActive).toBe(false)
    expect(status.errorMessage).toBeNull()
    expect(client.isConnected()).toBe(false)
    expect(client.isEnabled()).toBe(false)
    expect(client.isStopped()).toBe(false)
  })

  it('2. Rejects connection attempt if session token is empty or whitespace', async () => {
    const client = new DesktopBridgeClient()

    await expect(client.connect('')).rejects.toThrow('Token required')
    expect(client.getStatus().state).toBe('ERROR')
    expect(client.getStatus().errorMessage).toContain('Authentication token is required')

    await expect(client.connect('   ')).rejects.toThrow('Token required')
  })

  it('3. Connects using loopback URL and authenticated token query parameter', async () => {
    const client = new DesktopBridgeClient({ host: '127.0.0.1', port: 8765 })
    const token = 'test-secret-token-12345'

    const connectPromise = client.connect(token)
    expect(MockWebSocket.instances.length).toBe(1)
    const ws = MockWebSocket.instances[0]

    expect(ws.url).toBe(`ws://127.0.0.1:8765/?token=${encodeURIComponent(token)}`)
    expect(ws.protocols).toBeUndefined()
    expect(client.getStatus().state).toBe('CONNECTING')

    // Simulate successful handshake
    ws.simulateOpen()
    await connectPromise

    expect(client.getStatus().state).toBe('CONNECTED')
    expect(client.isConnected()).toBe(true)

    // Bridge requests STATUS upon opening
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'STATUS' }))
  })

  it('4. Handles connection failure and error states', async () => {
    const client = new DesktopBridgeClient()
    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]

    ws.simulateError(new Error('Connection refused'))
    ws.close(1006, 'Abnormal closure')

    await expect(connectPromise).rejects.toThrow()
    expect(client.getStatus().state).toBe('DISCONNECTED')
    expect(client.getStatus().errorMessage).toContain('Disconnected')
  })

  it('5. Sends periodic STATUS heartbeat while connected to monitor window and refresh watchdog', async () => {
    const client = new DesktopBridgeClient()
    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    await connectPromise

    ws.sentMessages = [] // Clear initial status request

    // Fast forward 1 second for first periodic status heartbeat
    vi.advanceTimersByTime(1000)
    expect(ws.sentMessages.length).toBe(1)
    const statusMsg = JSON.parse(ws.sentMessages[0])
    expect(statusMsg.type).toBe('STATUS')

    // Fast forward another second for second heartbeat
    vi.advanceTimersByTime(1000)
    expect(ws.sentMessages.length).toBe(2)
    expect(JSON.parse(ws.sentMessages[1]).type).toBe('STATUS')

    // sendPing utility sends manual PING frame
    client.sendPing()
    expect(ws.sentMessages.length).toBe(3)
    const pingMsg = JSON.parse(ws.sentMessages[2])
    expect(pingMsg.type).toBe('PING')
    expect(typeof pingMsg.timestamp).toBe('number')

    client.disconnect()
    // Heartbeat must stop after disconnect
    vi.advanceTimersByTime(2000)
    expect(ws.sentMessages.length).toBe(3)
  })

  it('6. Does NOT send ACTION messages when bridge is not ENABLED', () => {
    const client = new DesktopBridgeClient()
    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()

    ws.sentMessages = []

    // State is CONNECTED (not ENABLED)
    client.sendAction('LEFT')
    client.sendAction('RIGHT')
    client.sendAction('JUMP')
    client.sendAction('SLIDE')

    // None should be sent
    expect(ws.sentMessages.length).toBe(0)
  })

  it('7. Sends ACTION messages strictly when state is ENABLED', async () => {
    const client = new DesktopBridgeClient()
    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    await connectPromise

    // Simulate server ENABLE confirmation
    ws.simulateMessage({ type: 'ENABLED', status: 'ENABLED' })
    expect(client.isEnabled()).toBe(true)

    ws.sentMessages = []
    client.sendAction('LEFT')
    client.sendAction('JUMP')

    expect(ws.sentMessages).toEqual([
      JSON.stringify({ type: 'ACTION', action: 'LEFT' }),
      JSON.stringify({ type: 'ACTION', action: 'JUMP' }),
    ])
  })

  it('8. Enforces STOPPED emergency-stop protocol and blocks ENABLE until reset', async () => {
    const client = new DesktopBridgeClient()
    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    await connectPromise

    // Server broadcasts STOPPED
    ws.simulateMessage({ type: 'STOPPED', status: 'STOPPED' })
    expect(client.isStopped()).toBe(true)
    expect(client.getStatus().emergencyStopActive).toBe(true)

    // Attempting to enable while STOPPED must be blocked on client side
    ws.sentMessages = []
    client.enable()
    expect(ws.sentMessages.length).toBe(0)
    expect(client.getStatus().errorMessage).toContain('Bridge is in EMERGENCY STOP state')

    // User triggers resetStop()
    client.resetStop()
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'RESET_STOP' }))

    // Server acknowledges reset stop -> state becomes DISABLED
    ws.simulateMessage({ type: 'RESET_STOP_ACK', status: 'DISABLED', message: 'Cleared' })
    expect(client.getStatus().state).toBe('DISABLED')
    expect(client.getStatus().emergencyStopActive).toBe(false)

    // Now ENABLE is permitted
    client.enable()
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'ENABLE' }))
  })

  it('9. Handles server status updates and foreground window eligibility', async () => {
    let latestStatus: BridgeStatus | null = null
    const client = new DesktopBridgeClient({
      onStatusChange: (status) => {
        latestStatus = status
      },
    })

    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    await connectPromise

    ws.simulateMessage({
      type: 'STATUS_UPDATE',
      status: 'ENABLED',
      state: 'ENABLED',
      foregroundAllowed: true,
      activeTitle: 'Subway Surfers - Play on Poki - Google Chrome',
      emergencyStopActive: false,
    })

    expect(latestStatus?.state).toBe('ENABLED')
    expect(latestStatus?.foregroundAllowed).toBe(true)
    expect(latestStatus?.activeTitle).toBe('Subway Surfers - Play on Poki - Google Chrome')
    expect(latestStatus?.emergencyStopActive).toBe(false)
  })

  it('10. Handles watchdog timeout notice from server safely', async () => {
    let latestStatus: BridgeStatus | null = null
    const client = new DesktopBridgeClient({
      onStatusChange: (status) => {
        latestStatus = status
      },
    })

    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    await connectPromise

    ws.simulateMessage({
      type: 'STATUS_UPDATE',
      status: 'DISABLED',
      state: 'DISABLED',
      reason: 'WATCHDOG_TIMEOUT',
      foregroundAllowed: false,
      emergencyStopActive: false,
    })

    expect(latestStatus?.state).toBe('DISABLED')
    expect(latestStatus?.errorMessage).toContain('Safety watchdog expired due to inactivity')
  })

  it('11. Notifies action execution callback on ACTION_EXECUTED', async () => {
    const executedActions: { action: BridgeAction; success: boolean }[] = []
    const client = new DesktopBridgeClient({
      onActionExecuted: (action, success) => {
        executedActions.push({ action, success })
      },
    })

    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    await connectPromise

    ws.simulateMessage({
      type: 'ACTION_EXECUTED',
      status: 'ENABLED',
      action: 'RIGHT',
      success: true,
    })

    expect(executedActions).toEqual([{ action: 'RIGHT', success: true }])
  })

  it('12. Safely handles disconnect() by disabling input and closing WebSocket with code 1000', async () => {
    const client = new DesktopBridgeClient()
    const connectPromise = client.connect('valid-token')
    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    await connectPromise

    ws.simulateMessage({ type: 'ENABLED', status: 'ENABLED' })
    expect(client.isEnabled()).toBe(true)

    ws.sentMessages = []
    client.disconnect()

    // Must have sent DISABLE before closing
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'DISABLE' }))
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
    expect(client.isConnected()).toBe(false)
    expect(client.getStatus().state).toBe('DISCONNECTED')
  })
})

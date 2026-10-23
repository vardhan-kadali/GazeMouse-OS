import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ThreeRenderer } from '../games/runner3d/threeRenderer'
import { Runner3DEngine } from '../games/runner3d/runner3dEngine'

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      public setSize = vi.fn()
      public setPixelRatio = vi.fn()
      public render = vi.fn()
      public dispose = vi.fn()
      public shadowMap = { enabled: false, type: 0 }
    },
  }
})

describe('ThreeRenderer — Procedural Humanoid Character & Animation', () => {
  let canvas: HTMLCanvasElement
  let renderer: ThreeRenderer
  let engine: Runner3DEngine

  beforeEach(() => {
    canvas = document.createElement('canvas')
    renderer = new ThreeRenderer(canvas, 540, 640)
    engine = new Runner3DEngine({ initialSpeed: 20, maxSpeed: 40, speedIncrement: 0.5 })
  })

  it('1. Constructs a recognizable humanoid runner composed of head, torso, arms, and legs', () => {
    expect(renderer.playerGroup).toBeDefined()
    expect(renderer.playerGroup.name).toBe('HumanoidRunner')

    // Torso exists
    expect(renderer.torsoMesh).toBeDefined()
    expect(renderer.torsoMesh.name).toBe('Torso')

    // Head group exists
    expect(renderer.headGroup).toBeDefined()
    expect(renderer.headGroup.name).toBe('HeadGroup')
    expect(renderer.headGroup.children.some((c) => c.name === 'Head')).toBe(true)

    // Shoulders & Arms exist with independent pivot groups
    expect(renderer.leftArmGroup).toBeDefined()
    expect(renderer.leftArmGroup.name).toBe('LeftArmGroup')
    expect(renderer.rightArmGroup).toBeDefined()
    expect(renderer.rightArmGroup.name).toBe('RightArmGroup')

    // Hips & Legs exist with independent pivot groups
    expect(renderer.leftLegGroup).toBeDefined()
    expect(renderer.leftLegGroup.name).toBe('LeftLegGroup')
    expect(renderer.rightLegGroup).toBeDefined()
    expect(renderer.rightLegGroup.name).toBe('RightLegGroup')
  })

  it('2. Animates alternating arm and leg stride while player is running', () => {
    engine.start()
    expect(engine.state).toBe('PLAYING')

    // Initial render
    renderer.render(engine, 0.05)
    const arm1X = renderer.leftArmGroup.rotation.x
    const arm2X = renderer.rightArmGroup.rotation.x
    const leg1X = renderer.leftLegGroup.rotation.x
    const leg2X = renderer.rightLegGroup.rotation.x

    // Arms and legs should be in opposing phases
    expect(arm1X).toBeCloseTo(-arm2X, 2)
    expect(leg1X).toBeCloseTo(-leg2X, 2)
    expect(arm1X).toBeCloseTo(-leg1X, 2)

    // Advance time in run cycle
    renderer.render(engine, 0.1)
    // Angles should update smoothly
    expect(renderer.leftArmGroup.rotation.x).not.toBe(arm1X)
  })

  it('3. Applies readable jump and slide poses during vertical actions', () => {
    engine.start()

    // Trigger jump
    engine.jump()
    expect(engine.player.verticalState).toBe('JUMPING')
    renderer.render(engine, 0.05)

    // In jump pose, arms raise forward for balance, knees tuck
    expect(renderer.leftArmGroup.rotation.x).toBeLessThan(0)
    expect(renderer.rightArmGroup.rotation.x).toBeLessThan(0)
    expect(renderer.leftLegGroup.rotation.x).toBeGreaterThan(0)

    // Trigger slide
    engine.slide()
    expect(engine.player.verticalState).toBe('SLIDING')
    renderer.render(engine, 0.05)

    // In slide pose, legs extend forward
    expect(renderer.leftLegGroup.rotation.x).toBeLessThan(-0.8)
    expect(renderer.rightLegGroup.rotation.x).toBeLessThan(-0.8)
  })

  it('4. Cleans up all shared geometries and materials on dispose', () => {
    expect(() => renderer.dispose()).not.toThrow()
  })
})

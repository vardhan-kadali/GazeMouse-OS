import * as THREE from 'three'
import type { Runner3DEngine } from './runner3dEngine'
import { LANE_COORDINATES } from './runner3dEngine'
import type { Runner3DObstacle } from './types'

export class ThreeRenderer {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera

  // Visual Entity Groups
  public playerGroup: THREE.Group
  public trackGroup: THREE.Group

  // Humanoid Runner Body Groups & Meshes (for animation and unit tests)
  public leftArmGroup!: THREE.Group
  public rightArmGroup!: THREE.Group
  public leftLegGroup!: THREE.Group
  public rightLegGroup!: THREE.Group
  public torsoMesh!: THREE.Mesh
  public headGroup!: THREE.Group
  private runCycleTime: number = 0

  // Active Obstacle & Coin Render Meshes
  private obstacleMeshes: Map<number, THREE.Group> = new Map()
  private coinMeshes: Map<number, THREE.Mesh> = new Map()

  // Shared reusable geometries & materials (Object pooling)
  private sharedGeometries: THREE.BufferGeometry[] = []
  private sharedMaterials: THREE.Material[] = []
  private coinGeometry: THREE.CylinderGeometry
  private coinMaterial: THREE.MeshStandardMaterial

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    // 1. Initialize Scene & Fog
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x090d16) // Deep midnight cyber blue
    this.scene.fog = new THREE.Fog(0x090d16, 45, 175)

    // 2. Initialize Camera
    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 220)
    this.camera.position.set(0, 4.2, -7.0)
    this.camera.lookAt(0, 1.8, 18.0)

    // 3. Initialize WebGL Renderer
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
    } catch (err) {
      console.warn(
        '[ThreeRenderer] High-performance WebGL context creation failed, retrying with default attributes:',
        err
      )
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
      })
    }
    this.renderer.setSize(width, height, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // 4. Setup Lighting
    this.setupLighting()

    // 5. Setup Procedural Tracks & Tunnel
    this.trackGroup = new THREE.Group()
    this.trackGroup.add(this.buildTrackBed())
    this.buildRailsAndTies()
    this.buildSupportArches()
    this.scene.add(this.trackGroup)

    // 6. Setup Procedural Humanoid Runner Character
    this.playerGroup = this.buildHumanoidRunner()
    this.scene.add(this.playerGroup)

    // 7. Coin Materials & Geometries
    this.coinGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.15, 6)
    this.coinGeometry.rotateX(Math.PI / 2)
    this.sharedGeometries.push(this.coinGeometry)

    this.coinMaterial = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0xca8a04,
      emissiveIntensity: 0.45,
    })
    this.sharedMaterials.push(this.coinMaterial)
  }

  public static isWebGLAvailable(): boolean {
    try {
      if (typeof window === 'undefined' || !window.WebGL2RenderingContext) {
        return false
      }
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2')
      if (!gl) {
        return false
      }
      const loseExt = gl.getExtension('WEBGL_lose_context')
      if (loseExt) {
        loseExt.loseContext()
      }
      return true
    } catch {
      return false
    }
  }

  public setSize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private setupLighting(): void {
    // Ambient light with cool slate tint
    const ambientLight = new THREE.AmbientLight(0x334155, 1.4)
    this.scene.add(ambientLight)

    // Key Directional Sun / Tunnel illumination
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.2)
    dirLight.position.set(12, 28, -10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 1024
    dirLight.shadow.mapSize.height = 1024
    dirLight.shadow.camera.near = 5
    dirLight.shadow.camera.far = 140
    dirLight.shadow.camera.left = -16
    dirLight.shadow.camera.right = 16
    dirLight.shadow.camera.top = 40
    dirLight.shadow.camera.bottom = -10
    this.scene.add(dirLight)

    // Secondary fill light (warm neon accent)
    const fillLight = new THREE.DirectionalLight(0xf59e0b, 0.8)
    fillLight.position.set(-15, 15, 30)
    this.scene.add(fillLight)

    // Player Follow / Rim Backlight (illuminates runner shoulders, cap & sneakers from behind camera)
    const playerBacklight = new THREE.DirectionalLight(0xffffff, 1.6)
    playerBacklight.position.set(0, 10, -14)
    this.scene.add(playerBacklight)
  }

  private buildTrackBed(): THREE.Mesh {
    // Ground plane spanning the 3 tracks
    const groundGeo = new THREE.PlaneGeometry(16, 260)
    groundGeo.rotateX(-Math.PI / 2)
    this.sharedGeometries.push(groundGeo)

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Slate 900
      roughness: 0.8,
      metalness: 0.2,
    })
    this.sharedMaterials.push(groundMat)

    const mesh = new THREE.Mesh(groundGeo, groundMat)
    mesh.position.set(0, 0, 90)
    mesh.receiveShadow = true
    return mesh
  }

  private buildRailsAndTies(): void {
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
    })
    this.sharedMaterials.push(railMat)

    const tieMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.1,
    })
    this.sharedMaterials.push(tieMat)

    const railGeo = new THREE.BoxGeometry(0.12, 0.12, 260)
    this.sharedGeometries.push(railGeo)

    // For each of the 3 tracks, place twin guide rails
    const lanes: (0 | 1 | 2)[] = [0, 1, 2]
    lanes.forEach((lane) => {
      const centerX = LANE_COORDINATES[lane]
      const leftRail = new THREE.Mesh(railGeo, railMat)
      leftRail.position.set(centerX - 0.9, 0.08, 90)
      this.trackGroup.add(leftRail)

      const rightRail = new THREE.Mesh(railGeo, railMat)
      rightRail.position.set(centerX + 0.9, 0.08, 90)
      this.trackGroup.add(rightRail)
    })

    // Cross ballast ties along the tracks
    const tieGeo = new THREE.BoxGeometry(2.4, 0.06, 0.4)
    this.sharedGeometries.push(tieGeo)

    for (let z = -20; z < 210; z += 3.5) {
      lanes.forEach((lane) => {
        const tie = new THREE.Mesh(tieGeo, tieMat)
        tie.position.set(LANE_COORDINATES[lane], 0.03, z)
        tie.receiveShadow = true
        this.trackGroup.add(tie)
      })
    }
  }

  private buildSupportArches(): void {
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.5,
      roughness: 0.5,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.15,
    })
    this.sharedMaterials.push(archMat)

    const beamGeo = new THREE.BoxGeometry(15, 0.4, 0.4)
    const pillarGeo = new THREE.BoxGeometry(0.4, 7, 0.4)
    this.sharedGeometries.push(beamGeo, pillarGeo)

    for (let z = 0; z < 200; z += 40) {
      const arch = new THREE.Group()

      // Left Pillar
      const leftP = new THREE.Mesh(pillarGeo, archMat)
      leftP.position.set(-7.5, 3.5, 0)
      arch.add(leftP)

      // Right Pillar
      const rightP = new THREE.Mesh(pillarGeo, archMat)
      rightP.position.set(7.5, 3.5, 0)
      arch.add(rightP)

      // Top Crossbeam
      const beam = new THREE.Mesh(beamGeo, archMat)
      beam.position.set(0, 7.0, 0)
      arch.add(beam)

      arch.position.set(0, 0, z)
      this.trackGroup.add(arch)
    }
  }

  private buildHumanoidRunner(): THREE.Group {
    const root = new THREE.Group()
    root.name = 'HumanoidRunner'

    // 1. Torso / Cyber Runner Jacket (Cobalt Blue with Neon Cyan Trim)
    const torsoGeo = new THREE.BoxGeometry(0.85, 0.95, 0.45)
    this.sharedGeometries.push(torsoGeo)
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Vibrant cobalt cyber blue
      metalness: 0.5,
      roughness: 0.4,
    })
    this.sharedMaterials.push(torsoMat)
    this.torsoMesh = new THREE.Mesh(torsoGeo, torsoMat)
    this.torsoMesh.position.y = 1.45
    this.torsoMesh.castShadow = true
    this.torsoMesh.name = 'Torso'
    root.add(this.torsoMesh)

    // Chest Neon Stripe Accent
    const stripeGeo = new THREE.BoxGeometry(0.88, 0.15, 0.47)
    this.sharedGeometries.push(stripeGeo)
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.8,
    })
    this.sharedMaterials.push(stripeMat)
    const stripe = new THREE.Mesh(stripeGeo, stripeMat)
    stripe.position.set(0, 1.55, 0)
    root.add(stripe)

    // Athletic Shorts / Hips
    const hipsGeo = new THREE.BoxGeometry(0.75, 0.35, 0.42)
    this.sharedGeometries.push(hipsGeo)
    const hipsMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark slate
      roughness: 0.8,
      metalness: 0.2,
    })
    this.sharedMaterials.push(hipsMat)
    const hips = new THREE.Mesh(hipsGeo, hipsMat)
    hips.position.y = 0.95
    hips.castShadow = true
    hips.name = 'Hips'
    root.add(hips)

    // 2. Head Group (Head, Cap, Goggles)
    this.headGroup = new THREE.Group()
    this.headGroup.position.set(0, 2.15, 0)
    this.headGroup.name = 'HeadGroup'

    // Face / Head mesh
    const headGeo = new THREE.BoxGeometry(0.48, 0.5, 0.46)
    this.sharedGeometries.push(headGeo)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Warm stylized tone
      roughness: 0.6,
      metalness: 0.1,
    })
    this.sharedMaterials.push(headMat)
    const head = new THREE.Mesh(headGeo, headMat)
    head.castShadow = true
    head.name = 'Head'
    this.headGroup.add(head)

    // Runner Athletic Cap (Dark Navy with Cyan Visor)
    const capGeo = new THREE.BoxGeometry(0.52, 0.16, 0.5)
    this.sharedGeometries.push(capGeo)
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
    })
    this.sharedMaterials.push(capMat)
    const cap = new THREE.Mesh(capGeo, capMat)
    cap.position.y = 0.22
    this.headGroup.add(cap)

    // Cap Visor Brim pointing forward (+Z)
    const brimGeo = new THREE.BoxGeometry(0.48, 0.05, 0.22)
    this.sharedGeometries.push(brimGeo)
    const brimMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
    })
    this.sharedMaterials.push(brimMat)
    const brim = new THREE.Mesh(brimGeo, brimMat)
    brim.position.set(0, 0.22, 0.3)
    this.headGroup.add(brim)

    // Glowing Runner Goggles
    const goggleGeo = new THREE.BoxGeometry(0.44, 0.12, 0.14)
    this.sharedGeometries.push(goggleGeo)
    const goggleMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.8,
    })
    this.sharedMaterials.push(goggleMat)
    const goggles = new THREE.Mesh(goggleGeo, goggleMat)
    goggles.position.set(0, 0.04, 0.22)
    this.headGroup.add(goggles)

    root.add(this.headGroup)

    // 3. Left Arm Group (Pivot at shoulder: x = -0.52, y = 1.82, z = 0)
    this.leftArmGroup = new THREE.Group()
    this.leftArmGroup.position.set(-0.52, 1.82, 0)
    this.leftArmGroup.name = 'LeftArmGroup'

    const armGeo = new THREE.BoxGeometry(0.18, 0.75, 0.18)
    this.sharedGeometries.push(armGeo)
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.5,
    })
    this.sharedMaterials.push(armMat)
    const leftArmMesh = new THREE.Mesh(armGeo, armMat)
    leftArmMesh.position.y = -0.32
    leftArmMesh.castShadow = true
    this.leftArmGroup.add(leftArmMesh)

    // Glove
    const gloveGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2)
    this.sharedGeometries.push(gloveGeo)
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
    this.sharedMaterials.push(gloveMat)
    const leftGlove = new THREE.Mesh(gloveGeo, gloveMat)
    leftGlove.position.y = -0.68
    this.leftArmGroup.add(leftGlove)
    root.add(this.leftArmGroup)

    // 4. Right Arm Group (Pivot at shoulder: x = 0.52, y = 1.82, z = 0)
    this.rightArmGroup = new THREE.Group()
    this.rightArmGroup.position.set(0.52, 1.82, 0)
    this.rightArmGroup.name = 'RightArmGroup'

    const rightArmMesh = new THREE.Mesh(armGeo, armMat)
    rightArmMesh.position.y = -0.32
    rightArmMesh.castShadow = true
    this.rightArmGroup.add(rightArmMesh)

    const rightGlove = new THREE.Mesh(gloveGeo, gloveMat)
    rightGlove.position.y = -0.68
    this.rightArmGroup.add(rightGlove)
    root.add(this.rightArmGroup)

    // 5. Left Leg Group (Pivot at hip: x = -0.24, y = 0.88, z = 0)
    this.leftLegGroup = new THREE.Group()
    this.leftLegGroup.position.set(-0.24, 0.88, 0)
    this.leftLegGroup.name = 'LeftLegGroup'

    const legGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2)
    this.sharedGeometries.push(legGeo)
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Compression tights
      roughness: 0.7,
    })
    this.sharedMaterials.push(legMat)
    const leftLegMesh = new THREE.Mesh(legGeo, legMat)
    leftLegMesh.position.y = -0.3
    leftLegMesh.castShadow = true
    this.leftLegGroup.add(leftLegMesh)

    // Electric Neon Runner Sneaker
    const shoeGeo = new THREE.BoxGeometry(0.22, 0.18, 0.42)
    this.sharedGeometries.push(shoeGeo)
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Bright yellow/gold sneaker
      emissive: 0xf97316,
      emissiveIntensity: 0.5,
      roughness: 0.3,
    })
    this.sharedMaterials.push(shoeMat)
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat)
    leftShoe.position.set(0, -0.68, 0.08)
    leftShoe.castShadow = true
    this.leftLegGroup.add(leftShoe)
    root.add(this.leftLegGroup)

    // 6. Right Leg Group (Pivot at hip: x = 0.24, y = 0.88, z = 0)
    this.rightLegGroup = new THREE.Group()
    this.rightLegGroup.position.set(0.24, 0.88, 0)
    this.rightLegGroup.name = 'RightLegGroup'

    const rightLegMesh = new THREE.Mesh(legGeo, legMat)
    rightLegMesh.position.y = -0.3
    rightLegMesh.castShadow = true
    this.rightLegGroup.add(rightLegMesh)

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat)
    rightShoe.position.set(0, -0.68, 0.08)
    rightShoe.castShadow = true
    this.rightLegGroup.add(rightShoe)
    root.add(this.rightLegGroup)

    return root
  }

  public render(engine: Runner3DEngine, dtSeconds: number): void {
    // 1. Advance Run Cycle Time
    if (engine.state === 'PLAYING') {
      const speedScale = Math.max(1.0, engine.stats.speed / 18.0)
      this.runCycleTime += dtSeconds * speedScale * 12.0
    }

    // 2. Animate Humanoid Limbs & Poses
    if (engine.player.verticalState === 'JUMPING') {
      // Jump pose: Arms raised forward/up for balance, knees bent
      this.leftArmGroup.rotation.x = -1.1
      this.rightArmGroup.rotation.x = -1.1
      this.leftLegGroup.rotation.x = 0.6
      this.rightLegGroup.rotation.x = 0.35
      this.playerGroup.rotation.x = -0.1
      this.playerGroup.scale.set(1.0, 1.0, 1.0)
      this.playerGroup.position.y = engine.player.y
    } else if (engine.player.verticalState === 'SLIDING') {
      // Slide pose: Low athletic baseball-style slide under high arches
      this.leftArmGroup.rotation.x = 0.7
      this.rightArmGroup.rotation.x = 0.7
      this.leftLegGroup.rotation.x = -1.25
      this.rightLegGroup.rotation.x = -1.05
      this.playerGroup.rotation.x = 0.4
      this.playerGroup.scale.set(1.1, 0.65, 1.3)
      this.playerGroup.position.y = 0.15
    } else if (engine.state === 'PLAYING') {
      // Running pose: Dynamic alternating sprint
      const stride = Math.sin(this.runCycleTime) * 0.85
      this.leftArmGroup.rotation.x = stride
      this.rightArmGroup.rotation.x = -stride
      this.leftLegGroup.rotation.x = -stride
      this.rightLegGroup.rotation.x = stride

      // Slight arm lateral flare
      this.leftArmGroup.rotation.z = 0.15
      this.rightArmGroup.rotation.z = -0.15

      // Natural vertical stride bounce
      const bounce = Math.abs(Math.sin(this.runCycleTime)) * 0.1
      this.playerGroup.position.y = engine.player.y + bounce

      // Forward athletic sprint lean
      this.playerGroup.rotation.x = 0.14
      this.playerGroup.scale.set(1.0, 1.0, 1.0)
    } else {
      // Idle / Menu / Paused
      this.leftArmGroup.rotation.x = 0.1
      this.rightArmGroup.rotation.x = -0.1
      this.leftLegGroup.rotation.x = 0
      this.rightLegGroup.rotation.x = 0
      this.leftArmGroup.rotation.z = 0.08
      this.rightArmGroup.rotation.z = -0.08
      this.playerGroup.rotation.x = 0
      this.playerGroup.scale.set(1.0, 1.0, 1.0)
      this.playerGroup.position.y = engine.player.y
    }

    // 3. Update Player Horizontal and Depth Position + Banking Roll
    this.playerGroup.position.x = engine.player.x
    this.playerGroup.position.z = engine.player.z
    this.playerGroup.rotation.z = -engine.player.rollAngle

    // 4. Camera Chase
    const camTargetX = engine.player.x * 0.45
    const camTargetY = 4.2 + engine.player.y * 0.4
    this.camera.position.x += (camTargetX - this.camera.position.x) * Math.min(1, 10 * dtSeconds)
    this.camera.position.y += (camTargetY - this.camera.position.y) * Math.min(1, 8 * dtSeconds)
    this.camera.lookAt(engine.player.x * 0.5, 2.0 + engine.player.y * 0.3, 18.0)

    // 3. Update / Sync Obstacle Meshes
    this.syncObstacles(engine)

    // 4. Update / Sync Coin Meshes
    this.syncCoins(engine, dtSeconds)

    // 5. Render Three.js Scene
    this.renderer.render(this.scene, this.camera)
  }

  private syncObstacles(engine: Runner3DEngine): void {
    const activeIds = new Set<number>()

    for (const obs of engine.obstacles) {
      activeIds.add(obs.id)
      let meshGroup = this.obstacleMeshes.get(obs.id)

      if (!meshGroup) {
        meshGroup = this.createObstacleMesh(obs)
        this.obstacleMeshes.set(obs.id, meshGroup)
        this.scene.add(meshGroup)
      }

      // Position update
      meshGroup.position.x = LANE_COORDINATES[obs.lane]
      meshGroup.position.z = obs.z
    }

    // Remove despawned obstacles
    for (const [id, meshGroup] of this.obstacleMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(meshGroup)
        this.disposeObject(meshGroup)
        this.obstacleMeshes.delete(id)
      }
    }
  }

  private createObstacleMesh(obs: Runner3DObstacle): THREE.Group {
    const group = new THREE.Group()

    if (obs.type === 'TRAIN') {
      // Mag-Train Locomotive Pod
      const trainBodyGeo = new THREE.BoxGeometry(2.3, 3.0, obs.length)
      const trainMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.7,
        roughness: 0.3,
      })
      const body = new THREE.Mesh(trainBodyGeo, trainMat)
      body.position.y = 1.55
      body.castShadow = true
      group.add(body)

      // Front Headlight Bars (approaching front is facing -Z towards player)
      const lightGeo = new THREE.BoxGeometry(1.8, 0.3, 0.2)
      const lightMat = new THREE.MeshStandardMaterial({
        color: 0xef4444, // Glowing Red Caution
        emissive: 0xef4444,
        emissiveIntensity: 1.5,
      })
      const frontLight = new THREE.Mesh(lightGeo, lightMat)
      frontLight.position.set(0, 1.8, -obs.length / 2 - 0.05)
      group.add(frontLight)

      // Side Neon Hazard Trim
      const stripeGeo = new THREE.BoxGeometry(2.35, 0.2, obs.length - 1)
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xf97316,
        emissiveIntensity: 0.8,
      })
      const stripe = new THREE.Mesh(stripeGeo, stripeMat)
      stripe.position.y = 1.0
      group.add(stripe)
    } else if (obs.type === 'LOW_BARRIER') {
      // Low Hurdle Barrier
      const barGeo = new THREE.BoxGeometry(2.4, 0.35, 0.3)
      const barMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 0.5,
      })
      const bar = new THREE.Mesh(barGeo, barMat)
      bar.position.y = 0.75
      bar.castShadow = true
      group.add(bar)

      // Support Posts
      const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8)
      const postMat = new THREE.MeshStandardMaterial({ color: 0x334155 })
      const leftPost = new THREE.Mesh(postGeo, postMat)
      leftPost.position.set(-1.0, 0.45, 0)
      const rightPost = new THREE.Mesh(postGeo, postMat)
      rightPost.position.set(1.0, 0.45, 0)
      group.add(leftPost, rightPost)
    } else if (obs.type === 'HIGH_ARCH') {
      // Overhead High Gantry Sign
      const beamGeo = new THREE.BoxGeometry(2.5, 0.8, 0.4)
      const beamMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0284c7,
        emissiveIntensity: 0.6,
      })
      const beam = new THREE.Mesh(beamGeo, beamMat)
      beam.position.y = 2.1
      beam.castShadow = true
      group.add(beam)

      // Tall Support Struts
      const strutGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.5, 8)
      const strutMat = new THREE.MeshStandardMaterial({ color: 0x1e293b })
      const leftS = new THREE.Mesh(strutGeo, strutMat)
      leftS.position.set(-1.15, 1.25, 0)
      const rightS = new THREE.Mesh(strutGeo, strutMat)
      rightS.position.set(1.15, 1.25, 0)
      group.add(leftS, rightS)
    }

    return group
  }

  private syncCoins(engine: Runner3DEngine, dtSeconds: number): void {
    const activeIds = new Set<number>()

    for (const coin of engine.coins) {
      if (coin.collected) continue
      activeIds.add(coin.id)

      let mesh = this.coinMeshes.get(coin.id)
      if (!mesh) {
        mesh = new THREE.Mesh(this.coinGeometry, this.coinMaterial)
        this.coinMeshes.set(coin.id, mesh)
        this.scene.add(mesh)
      }

      mesh.position.set(coin.x, coin.y, coin.z)
      mesh.rotation.y += dtSeconds * 3.5
    }

    // Remove collected or off-screen coins
    for (const [id, mesh] of this.coinMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh)
        this.coinMeshes.delete(id)
      }
    }
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else if (child.material) {
          child.material.dispose()
        }
      }
    })
  }

  public dispose(): void {
    // 1. Dispose Obstacle Meshes
    for (const meshGroup of this.obstacleMeshes.values()) {
      this.scene.remove(meshGroup)
      this.disposeObject(meshGroup)
    }
    this.obstacleMeshes.clear()

    // 2. Dispose Coin Meshes
    for (const mesh of this.coinMeshes.values()) {
      this.scene.remove(mesh)
    }
    this.coinMeshes.clear()

    // 3. Dispose Shared Geometries & Materials
    this.sharedGeometries.forEach((g) => g.dispose())
    this.sharedMaterials.forEach((m) => m.dispose())

    // 4. Dispose Scene Hierarchy
    this.disposeObject(this.scene)

    // 5. Dispose WebGL Renderer
    this.renderer.dispose()
  }
}

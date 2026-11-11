import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import {
  db,
  cellFromLonLat,
  districtAt,
  districtById,
  ensureLayer,
  formatValue,
  layerDef,
  lonLatFromWorld,
  valueFromQ,
  type LayerDef,
} from '../lib/data'
import { useStore } from '../store'
import { spikeFragment, spikeUniforms, spikeVertex } from './spikeShader'
import {
  BASE_HEIGHT,
  CELL_KM,
  groundTexture,
  makeDataTexture,
  makeRampTexture,
  shapeOf,
} from './layers'
import { HOME, applyCamera, boundsToWorld, fitState, type CamState } from './camera'
import Rivers from './Rivers'
import CityLabels from './labels'

const EASE = 'power3.inOut'

/** categorical and flat layers must keep their exact classes; continuous ramps compress */
const COLOR_POW = (def: LayerDef) => (def.type === 'categorical' || shapeOf(def).flat ? 1 : 2.6)

type HoverPayload = { id: number; label: string; value: string; x: number; y: number } | null

function useLayerBin(id: string) {
  const [bin, setBin] = useState<Uint8Array | null>(() => db.bins.get(id) ?? null)
  useEffect(() => {
    const cached = db.bins.get(id)
    if (cached) {
      setBin(cached)
      return
    }
    let alive = true
    // keep the previous field on screen while the next one arrives: blanking it
    // unmounted the spikes, so a layer visited for the first time had nothing
    // to morph from and simply appeared
    useStore.getState().setLayerLoading(id)
    ensureLayer(id).then((b) => {
      if (!alive) return
      setBin(b)
      useStore.getState().setLayerLoading(null)
    })
    return () => {
      alive = false
    }
  }, [id])
  return bin
}

/** tapered four-sided prism, 8 triangles, no cap (the tip is 7.5% wide) */
function spikeGeometry() {
  const TOP = 0.055
  const base: [number, number, number][] = [
    [-0.5, 0, -0.5],
    [0.5, 0, -0.5],
    [0.5, 0, 0.5],
    [-0.5, 0, 0.5],
  ]
  const positions: number[] = []
  const normals: number[] = []
  const index: number[] = []
  let v = 0
  for (let i = 0; i < 4; i++) {
    const a = base[i]
    const b = base[(i + 1) % 4]
    const t = [a[0] * TOP, 1, a[2] * TOP]
    const u = [b[0] * TOP, 1, b[2] * TOP]
    const ex = b[0] - a[0]
    const ez = b[2] - a[2]
    const len = Math.hypot(ex, ez) || 1
    positions.push(...a, ...b, ...u, ...t)
    for (let k = 0; k < 4; k++) normals.push(ez / len, 0.16, -ex / len)
    index.push(v, v + 1, v + 2, v, v + 2, v + 3)
    v += 4
  }
  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setIndex(index)
  return geo
}

function Spikes({ bin }: { bin: Uint8Array }) {
  const invalidate = useThree((s) => s.invalidate)
  const activeLayer = useStore((s) => s.activeLayer)
  const selectedDivision = useStore((s) => s.selectedDivision)
  const selectedDistrict = useStore((s) => s.selectedDistrict)
  const hovered = useStore((s) => s.hovered)

  const meta = db.meta!
  const step = db.meta && window.matchMedia('(max-width: 768px)').matches ? 2 : 1

  const uniforms = useMemo(() => spikeUniforms(), [])
  const current = useRef<{ def: LayerDef; tex: THREE.DataTexture; ramp: THREE.Texture } | null>(null)
  const mix = useRef({ v: 0 })

  const geometry = useMemo(() => {
    const geo = spikeGeometry()
    const cells: number[] = []
    for (let r = 0; r < meta.rows; r += step) {
      for (let c = 0; c < meta.cols; c += step) {
        if (db.divisionsBin?.[r * meta.cols + c]) cells.push(c + (step - 1) / 2, r + (step - 1) / 2)
      }
    }
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(cells), 2)
    geo.setAttribute('aCell', attr)
    geo.instanceCount = cells.length / 2
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, 0), 1400)
    uniforms.uGrid.value = [meta.cols, meta.rows]
    uniforms.uCellSize.value = CELL_KM
    uniforms.uBaseHeight.value = BASE_HEIGHT
    uniforms.uWidth.value = step * 0.82
    return geo
  }, [meta, step, uniforms])

  const regionTextures = useMemo(() => {
    const regions = makeDataTexture(db.regionsBin!, meta.cols, meta.rows)
    const divisions = makeDataTexture(db.divisionsBin!, meta.cols, meta.rows)
    uniforms.uRegions.value = regions
    uniforms.uDivisions.value = divisions
    return { regions, divisions }
  }, [meta, uniforms])

  useEffect(
    () => () => {
      regionTextures.regions.dispose()
      regionTextures.divisions.dispose()
    },
    [regionTextures],
  )

  // layer load + morph
  useEffect(() => {
    if (!bin) return
    const def = layerDef(activeLayer)
    const tex = makeDataTexture(bin, meta.cols, meta.rows)
    const ramp = makeRampTexture(def)
    const u = uniforms

    if (!current.current) {
      current.current = { def, tex, ramp }
      u.uTexA.value = tex
      u.uRampA.value = ramp
      u.uTexB.value = tex
      u.uRampB.value = ramp
      const shape = shapeOf(def)
      u.uHeight.value = [shape.scale, shape.scale]
      u.uColorPow.value = [COLOR_POW(def), COLOR_POW(def)]
      u.uExp.value = [shape.exp, shape.exp]
      u.uFlat.value = [shape.flat ? 1 : 0, shape.flat ? 1 : 0]
      u.uSink.value = [def.sink ? 1 : 0, def.sink ? 1 : 0]
      u.uWidth.value = step * (shape.flat ? 1.0 : 0.82)
      invalidate()
      return
    }

    const nextShape = shapeOf(def)
    u.uTexB.value = tex
    u.uRampB.value = ramp
    u.uHeight.value = [u.uHeight.value[0], nextShape.scale]
    u.uColorPow.value = [u.uColorPow.value[0], COLOR_POW(def)]
    u.uExp.value = [u.uExp.value[0], nextShape.exp]
    u.uFlat.value = [u.uFlat.value[0], nextShape.flat ? 1 : 0]
    u.uSink.value = [u.uSink.value[0], def.sink ? 1 : 0]
    u.uWidth.value = step * (nextShape.flat ? 1.0 : 0.82)
    u.uMix.value = 0
    mix.current.v = 0

    const previous = current.current
    gsap.killTweensOf(mix.current)
    gsap.to(mix.current, {
      v: 1,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => {
        u.uMix.value = mix.current.v
        invalidate()
      },
      onComplete: () => {
        u.uTexA.value = tex
        u.uRampA.value = ramp
        u.uHeight.value = [nextShape.scale, nextShape.scale]
        u.uColorPow.value = [COLOR_POW(def), COLOR_POW(def)]
        u.uExp.value = [nextShape.exp, nextShape.exp]
        u.uFlat.value = [nextShape.flat ? 1 : 0, nextShape.flat ? 1 : 0]
        u.uSink.value = [def.sink ? 1 : 0, def.sink ? 1 : 0]
        u.uWidth.value = step * (nextShape.flat ? 1.0 : 0.82)
        u.uMix.value = 0
        mix.current.v = 0
        current.current = { def, tex, ramp }
        previous.tex.dispose()
        previous.ramp.dispose()
        invalidate()
      },
    })
  }, [bin, activeLayer, meta, uniforms, invalidate])

  // selection: the chosen district ripples up on a plinth while the rest sink
  useEffect(() => {
    uniforms.uSelDistrict.value = selectedDistrict ?? 0
    uniforms.uSelDivision.value = selectedDivision ?? 0

    const bbox = selectedDistrict
      ? districtById(selectedDistrict)?.bbox
      : selectedDivision
        ? db.regions.find((v) => v.id === selectedDivision)?.bbox
        : null

    if (bbox) {
      const b = boundsToWorld(bbox)
      uniforms.uPopCenter.value = [b.cx, b.cz]
      uniforms.uPopRadius.value = Math.max(b.w, b.h) / 2
    }

    const target = bbox ? 1 : 0
    gsap.killTweensOf([uniforms.uPop, uniforms.uMorph])
    gsap.to(uniforms.uPop, {
      value: target,
      duration: 1.2,
      ease: EASE,
      overwrite: true,
      onUpdate: invalidate,
    })
    gsap.to(uniforms.uMorph, {
      value: target,
      duration: 1.2,
      ease: EASE,
      overwrite: true,
      onUpdate: invalidate,
    })
  }, [selectedDistrict, selectedDivision, uniforms, invalidate])

  // hover highlight
  useEffect(() => {
    uniforms.uHoverDistrict.value = hovered?.kind === 'district' ? hovered.id : 0
    invalidate()
  }, [hovered, uniforms, invalidate])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: spikeVertex,
        fragmentShader: spikeFragment,
        toneMapped: false,
      }),
    [uniforms],
  )

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      dispose={null}
      castShadow={false}
      receiveShadow={false}
    />
  )
}

function Ground({ bin }: { bin: Uint8Array }) {
  const activeLayer = useStore((s) => s.activeLayer)
  const texRef = useRef<THREE.CanvasTexture | null>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const meta = db.meta!
  const invalidate = useThree((s) => s.invalidate)

  // only ever dispose a texture we have already replaced, never the one on screen
  useEffect(() => {
    const next = groundTexture(layerDef(activeLayer))
    if (!next) return
    const previous = texRef.current
    texRef.current = next
    // swapping map in or out changes the shader program, so the material must rebuild
    if (matRef.current) {
      matRef.current.map = next
      matRef.current.needsUpdate = true
    }
    previous?.dispose()
    invalidate()
  }, [activeLayer, bin, invalidate])

  useEffect(() => () => texRef.current?.dispose(), [])

  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -0.55, 0]}
        receiveShadow={false}
        name="ground"
      >
        <planeGeometry args={[meta.cols * CELL_KM, meta.rows * CELL_KM]} />
        <meshBasicMaterial ref={matRef} color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} name="hit" visible={false}>
        <planeGeometry args={[meta.cols * CELL_KM, meta.rows * CELL_KM]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  )
}

function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const selectedDivision = useStore((s) => s.selectedDivision)
  const selectedDistrict = useStore((s) => s.selectedDistrict)
  const state = useRef<CamState>({ ...HOME })

  useEffect(() => {
    camera.fov = 28
    camera.updateProjectionMatrix()
    applyCamera(camera, state.current)
    invalidate()
  }, [camera, invalidate])

  useEffect(() => {
    const active = Boolean(selectedDistrict || selectedDivision)
    // a slightly lower tilt so the lifted district reads as a slab
    const target = active ? { ...fitState(selectionBox(), 28), phi: 0.78 } : HOME
    gsap.to(state.current, {
      ...target,
      duration: 1.2,
      ease: EASE,
      overwrite: true,
      onUpdate: invalidate,
    })
  }, [selectedDivision, selectedDistrict, invalidate])

  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let px = 0
    let py = 0

    const down = (e: PointerEvent) => {
      dragging = true
      px = e.clientX
      py = e.clientY
      gsap.killTweensOf(state.current)
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - px
      const dy = e.clientY - py
      px = e.clientX
      py = e.clientY
      state.current.theta -= dx * 0.005
      state.current.phi = THREE.MathUtils.clamp(state.current.phi + dy * 0.004, 0.34, 1.24)
      invalidate()
    }
    const up = (e: PointerEvent) => {
      dragging = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    // wheel-zoom is deliberately gone: it hijacked the page scroll and made the
    // stage zoom out under Lenis. Drag or orbit, scroll scrolls the page.

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl, invalidate])

  useFrame(() => applyCamera(camera, state.current))
  return null
}

function selectionBox() {
  const { selectedDivision, selectedDistrict } = useStore.getState()
  if (selectedDistrict) return districtById(selectedDistrict)?.bbox ?? db.meta!.bbox
  if (selectedDivision) {
    return db.regions.find((v) => v.id === selectedDivision)?.bbox ?? db.meta!.bbox
  }
  return db.meta!.bbox
}

function HitPlane({ onHover }: { onHover: (p: HoverPayload) => void }) {
  const setHovered = useStore((s) => s.setHovered)
  const setSelection = useStore((s) => s.setSelection)
  const clearSelection = useStore((s) => s.clearSelection)
  const meta = db.meta!
  const last = useRef(0)

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    const now = performance.now()
    if (now - last.current < 45) return
    last.current = now
    const [lon, lat] = lonLatFromWorld(e.point.x, e.point.z, CELL_KM)
    const id = districtAt(lon, lat)
    const def = layerDef(useStore.getState().activeLayer)
    const bin = db.bins.get(def.id)
    const cell = cellFromLonLat(lon, lat)
    let value = '—'
    if (id && bin && cell) {
      const q = bin[cell.row * meta.cols + cell.col] ?? 0
      value = formatValue(def, valueFromQ(def, q))
    }
    onHover({ id, label: districtById(id)?.name ?? '', value, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
    const prev = useStore.getState().hovered
    if (!prev || prev.id !== id) {
      setHovered(id ? { kind: 'district', id, lon, lat } : null)
    }
  }

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, 0.03, 0]}
      onPointerMove={handleMove}
      onPointerLeave={() => {
        onHover(null)
        setHovered(null)
      }}
      onClick={(e) => {
        e.stopPropagation()
        const [lon, lat] = lonLatFromWorld(e.point.x, e.point.z, CELL_KM)
        const id = districtAt(lon, lat)
        if (id) setSelection({ district: id, division: null })
        else clearSelection()
      }}
    >
      <planeGeometry args={[meta.cols * CELL_KM, meta.rows * CELL_KM]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/** re-render once when the stage comes back on screen */
function Wake({ on }: { on: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (on) invalidate()
  }, [on, invalidate])
  return null
}

export default function DensityMap() {
  const dataLoaded = useStore((s) => s.dataLoaded)
  const activeLayer = useStore((s) => s.activeLayer)
  const bin = useLayerBin(activeLayer)
  const tip = useRef<HTMLDivElement>(null)
  const tipName = useRef<HTMLDivElement>(null)
  const tipValue = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)

  // the stage slept "never" while offscreen: the rivers dash loop used to keep
  // the whole canvas rendering even behind the hero and footer, which stole
  // frames from the page's own scroll and hover animation
  useEffect(() => {
    const el = host.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: '160px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const handleHover = (p: HoverPayload) => {
    const el = tip.current
    if (!el) return
    if (!p || !p.id || !p.label) {
      el.style.opacity = '0'
      return
    }
    el.style.opacity = '1'
    el.style.transform = `translate3d(${Math.min(p.x + 16, window.innerWidth - 220)}px, ${p.y + 16}px, 0)`
    if (tipName.current) tipName.current.textContent = p.label
    if (tipValue.current) tipValue.current.textContent = p.value
  }

  if (!dataLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-cream">
        <p className="mono-label text-[#5f5f5f]">Reading the delta…</p>
      </div>
    )
  }

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-cream">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={inView ? 'demand' : 'never'}
        camera={{ fov: 28, near: 1, far: 12000, position: [0, 1400, 900] }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#fcfbf9']} />
        {bin && <><Ground bin={bin} /><Spikes bin={bin} /><CityLabels /></>}
        <Rivers />
        <HitPlane onHover={handleHover} />
        <CameraRig />
        <Wake on={inView} />
      </Canvas>

      <div
        ref={tip}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[70] rounded-card border border-line bg-cream/95 px-3 py-2 opacity-0 shadow-[0_20px_50px_-24px_rgba(31,122,84,0.35)] backdrop-blur-sm transition-opacity duration-300 premium-ease"
      >
        <div
          ref={tipName}
          className="font-serif text-[15px] italic leading-none text-ink"
        />
        <div
          ref={tipValue}
          className="mono-label mt-1.5 !text-[11px] !tracking-[0.2em] text-accent"
        />
      </div>
    </div>
  )
}

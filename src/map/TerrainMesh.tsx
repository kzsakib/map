import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { BASE, db, districtById, layerDef, type LayerDef } from '../lib/data'
import { useStore } from '../store'
import { COLOR_POW_OVERRIDE } from '../lib/look'
import { makeDataTexture, makeDataTextureLinear, makeRampTexture, shapeOf } from './layers'
import { boundsToWorld } from './camera'
import { terrainFragment, terrainUniforms, terrainVertex } from './terrainShader'
import type { Terrain } from './terrain'

const EASE = 'power3.inOut'

const COLOR_POW = (def: LayerDef) =>
  COLOR_POW_OVERRIDE[def.id] ?? (def.type === 'categorical' || shapeOf(def).flat ? 1 : 2.6)

/** small tileable noise for the micro-detail pass */
function noiseTexture(): THREE.CanvasTexture {
  const S = 512
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')
  if (ctx) {
    const img = ctx.createImageData(S, S)
    // value noise, wrapped so the tile repeats seamlessly
    const grid = 64
    const rand = new Float32Array(grid * grid)
    for (let i = 0; i < rand.length; i++) rand[i] = Math.random()
    const at = (x: number, y: number) => rand[(y % grid) * grid + (x % grid)]
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * grid
        const fy = (y / S) * grid
        const x0 = Math.floor(fx)
        const y0 = Math.floor(fy)
        const tx = fx - x0
        const ty = fy - y0
        const sx = tx * tx * (3 - 2 * tx)
        const sy = ty * ty * (3 - 2 * ty)
        const a = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx
        const b = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx
        const v = Math.round((a * (1 - sy) + b * sy) * 255)
        const p = (y * S + x) * 4
        img.data[p] = v
        img.data[p + 1] = v
        img.data[p + 2] = v
        img.data[p + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * The country as one continuous surface: a displaced plane sampling the baked
 * height field plus the active layer's own values, shaded by the baked relief.
 */
export default function TerrainMesh({ bin, terrain }: { bin: Uint8Array; terrain: Terrain }) {
  const invalidate = useThree((s) => s.invalidate)
  const activeLayer = useStore((s) => s.activeLayer)
  const quality = useStore((s) => s.quality)
  const selectedDivision = useStore((s) => s.selectedDivision)
  const selectedDistrict = useStore((s) => s.selectedDistrict)
  const hovered = useStore((s) => s.hovered)
  const meta = db.meta!
  const lite = quality === 'lite'

  const segX = lite ? 512 : 1024
  const segY = lite ? 640 : 1280

  const uniforms = useMemo(() => terrainUniforms(), [])
  const current = useRef<{ def: LayerDef; tex: THREE.Texture; ramp: THREE.Texture } | null>(null)
  const mix = useRef({ v: 0 })

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(terrain.w, terrain.h, segX, segY),
    [terrain, segX, segY],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  const relief = useMemo(() => {
    const loader = new THREE.TextureLoader()
    const load = (file: string) => {
      const tex = loader.load(`${BASE}data/terrain/${file}`, () => invalidate())
      tex.colorSpace = THREE.NoColorSpace
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.generateMipmaps = true
      tex.anisotropy = 4
      return tex
    }
    return {
      mask: load('mask.webp'),
      hillshade: load('hillshade.webp'),
      ao: load('ao.webp'),
      water: load('water.webp'),
      noise: noiseTexture(),
    }
  }, [invalidate])
  useEffect(
    () => () => {
      relief.mask.dispose()
      relief.hillshade.dispose()
      relief.ao.dispose()
      relief.water.dispose()
      relief.noise.dispose()
    },
    [relief],
  )

  const fields = useMemo(() => {
    const regions = makeDataTexture(db.regionsBin!, meta.cols, meta.rows)
    const divisions = makeDataTexture(db.divisionsBin!, meta.cols, meta.rows)
    return { regions, divisions }
  }, [meta])
  useEffect(
    () => () => {
      fields.regions.dispose()
      fields.divisions.dispose()
    },
    [fields],
  )

  // static wiring: sizes, the baked surfaces and the quality switches
  useEffect(() => {
    const u = uniforms
    u.uSize.value = [terrain.w, terrain.h]
    u.uTSize.value = [terrain.cols, terrain.rows]
    u.uGrid.value = [meta.cols, meta.rows]
    u.uTerrainScale.value = terrain.heightScale
    u.uTerrainHeight.value = terrain.texture
    u.uMask.value = relief.mask
    u.uHillshade.value = relief.hillshade
    u.uAO.value = relief.ao
    u.uWater.value = relief.water
    u.uNoise.value = relief.noise
    u.uRegions.value = fields.regions
    u.uDivisions.value = fields.divisions
    u.uAOAmount.value = lite ? 0 : 1
    u.uGrain.value = lite ? 0 : 1
    invalidate()
  }, [uniforms, terrain, relief, fields, meta, lite, invalidate])

  // the flat map is already on screen, so the relief fades in over 500 ms
  useEffect(() => {
    uniforms.uOpacity.value = 0
    gsap.killTweensOf(uniforms.uOpacity)
    gsap.to(uniforms.uOpacity, {
      value: 1,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: invalidate,
      onComplete: () => invalidate(),
    })
  }, [uniforms, invalidate])

  // layer swap: the same morph the columns used, now in the surface
  useEffect(() => {
    if (!bin) return
    const def = layerDef(activeLayer)
    const tex = makeDataTextureLinear(bin, meta.cols, meta.rows)
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
      u.uCatA.value = def.type === 'categorical' ? 1 : 0
      u.uCatB.value = def.type === 'categorical' ? 1 : 0
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
    u.uCatB.value = def.type === 'categorical' ? 1 : 0
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
        u.uCatA.value = def.type === 'categorical' ? 1 : 0
        u.uMix.value = 0
        mix.current.v = 0
        current.current = { def, tex, ramp }
        previous.tex.dispose()
        previous.ramp.dispose()
        invalidate()
      },
    })
  }, [bin, activeLayer, meta, uniforms, invalidate])

  // selection: the chosen district rises as a plinth while the rest sinks a little
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
    gsap.to(uniforms.uPop, { value: target, duration: 1.2, ease: EASE, overwrite: true, onUpdate: invalidate })
    gsap.to(uniforms.uMorph, {
      value: target,
      duration: 1.2,
      ease: EASE,
      overwrite: true,
      onUpdate: invalidate,
    })
  }, [selectedDistrict, selectedDivision, uniforms, invalidate])

  useEffect(() => {
    uniforms.uHoverDistrict.value = hovered?.kind === 'district' ? hovered.id : 0
    invalidate()
  }, [hovered, uniforms, invalidate])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: terrainVertex,
        fragmentShader: terrainFragment,
        toneMapped: false,
        transparent: true,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      rotation-x={-Math.PI / 2}
      dispose={null}
    />
  )
}

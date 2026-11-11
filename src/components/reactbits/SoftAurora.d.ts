import type { CSSProperties, ReactElement } from 'react'

export type SoftAuroraProps = {
  /** tint of the first aurora layer */
  color1?: string
  /** tint of the second aurora layer */
  color2?: string
  /** how much of the shifting rainbow shows through the tints, 0..1 */
  spectrum?: number
  /** overall animation speed */
  speed?: number
  /** how fast the colours drift along the band */
  colorSpeed?: number
  /** scale of the noise that shapes the band */
  scale?: number
  /** overall brightness */
  brightness?: number
  /** how tightly the band ripples */
  noiseFrequency?: number
  /** how far the band waves up and down */
  noiseAmplitude?: number
  /** vertical position of the band, 0 bottom to 1 top */
  bandHeight?: number
  /** how tight and bright the band is */
  bandSpread?: number
  /** tilts the band in degrees */
  tilt?: number
  /** how much fine ripple sits on the large waves */
  octaveDecay?: number
  /** shifts the second layer in time so the two separate */
  layerOffset?: number
  /** drift and reach with the cursor */
  enableMouseInteraction?: boolean
  /** strength of the cursor drift */
  mouseInfluence?: number
  /** click sends a soft pulse along the band */
  clickPulse?: boolean
  /** band blooms in on mount */
  intro?: boolean
  /** print as soft ink so it sits on light pages */
  lightMode?: boolean
  /** overall opacity, 0..1 */
  opacity?: number
  className?: string
  style?: CSSProperties
}

export default function SoftAurora(props: SoftAuroraProps): ReactElement

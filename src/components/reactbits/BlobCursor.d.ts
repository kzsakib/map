import type { CSSProperties, ReactElement } from 'react'

export type BlobMaterial = 'chrome' | 'jelly' | 'pearl' | 'ink'
export type BlobBlend = 'normal' | 'difference' | 'exclusion' | 'multiply' | 'screen' | 'overlay'

export type BlobCursorProps = {
  material?: BlobMaterial
  color?: string
  blend?: BlobBlend
  size?: number
  morph?: number
  morphSpeed?: number
  depth?: number
  trail?: number
  lag?: number
  goo?: number
  stretch?: number
  wobble?: number
  drip?: number
  shine?: number
  splash?: boolean
  splashCount?: number
  splashSpeed?: number
  splashSize?: number
  splashGravity?: number
  regrow?: number
  shadow?: boolean
  hideCursor?: boolean
  className?: string
  style?: CSSProperties
}

export default function BlobCursor(props: BlobCursorProps): ReactElement

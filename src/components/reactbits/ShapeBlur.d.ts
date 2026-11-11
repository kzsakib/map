import type { CSSProperties, ReactNode, ReactElement } from 'react'

export type ShapeBlurProps = {
  /** shape to draw; a rectangle follows the container */
  shape?: 'rect' | 'circle' | 'polygon' | 'star'
  /** url of an svg or transparent png used as the shape silhouette */
  src?: string
  /** sides of the polygon or points of the star */
  sides?: number
  /** how much of the container the shape fills, 0..1 */
  size?: number
  /** rounds the corners, 0..1 */
  roundness?: number
  /** line width in pixels */
  thickness?: number
  /** fill the shape instead of drawing its outline */
  fill?: boolean
  /** number of nested lines or ripples */
  echoes?: number
  /** distance between echoes in pixels */
  spacing?: number
  /** line colour */
  color?: string
  /** how far out of focus the lens pushes the shape, in pixels */
  blur?: number
  /** lens radius around the pointer, relative to the short side */
  lensSize?: number
  /** how gradually the blur fades toward the lens edge, 0..1 */
  lensSoftness?: number
  /** inverts the lens: sharp only under the pointer */
  focus?: boolean
  /** chromatic fringing in the blurred parts, 0..1 */
  chroma?: number
  /** rotation in degrees */
  rotation?: number
  /** rotation speed in degrees per second */
  spin?: number
  /** let the lens drift on its own while the pointer is away */
  idle?: boolean
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export default function ShapeBlur(props: ShapeBlurProps): ReactElement

import { validateDimensions } from './processing'

export type WatermarkPosition = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right'
export type WatermarkOptions = { type: 'text' | 'image'; text: string; color: string; size: number; opacity: number; position: WatermarkPosition; scale: number }

export function watermarkPosition(position: WatermarkPosition, width: number, height: number, markWidth: number, markHeight: number, padding = 24) {
  const x = position.endsWith('left') ? padding : position.endsWith('right') ? width - markWidth - padding : (width - markWidth) / 2
  const y = position.startsWith('top') ? padding : position.startsWith('bottom') ? height - markHeight - padding : (height - markHeight) / 2
  return { x: Math.round(x), y: Math.round(y) }
}

export function createWatermarkStamp(width: number, height: number, options: WatermarkOptions, image: HTMLImageElement | null, rasterScale = 1) {
  validateDimensions(width, height)
  if (!Number.isFinite(rasterScale) || rasterScale <= 0 || rasterScale > 1) throw new Error('Invalid preview scale.')
  if (!Number.isFinite(options.opacity) || options.opacity < 0 || options.opacity > 1) throw new Error('Choose an opacity between 0 and 1.')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not render the watermark.')
  let markWidth: number, markHeight: number, left = 0, top = 0
  if (options.type === 'image') {
    if (!image) throw new Error('Select a watermark image before applying.')
    if (!Number.isFinite(options.scale) || options.scale < 0.1 || options.scale > 0.8) throw new Error('Choose a watermark scale between 10% and 80%.')
    markWidth = Math.max(1, Math.round(width * options.scale))
    markHeight = Math.max(1, Math.round(image.height / image.width * markWidth))
    validateDimensions(markWidth, markHeight)
    canvas.width = Math.max(1, Math.ceil(markWidth * rasterScale)); canvas.height = Math.max(1, Math.ceil(markHeight * rasterScale))
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
  } else {
    if (!options.text.trim() || options.text.length > 300) throw new Error('Enter watermark text between 1 and 300 characters.')
    if (!Number.isFinite(options.size) || options.size < 14 || options.size > 120 || !/^#[0-9a-f]{6}$/i.test(options.color)) throw new Error('Choose a valid text size and color.')
    const font = `700 ${options.size}px "Space Grotesk", sans-serif`
    context.font = font
    const metrics = context.measureText(options.text)
    markWidth = metrics.width; markHeight = options.size
    left = Math.floor(-metrics.actualBoundingBoxLeft)
    top = Math.floor(markHeight - metrics.actualBoundingBoxAscent)
    const stampWidth = Math.max(1, Math.ceil(metrics.actualBoundingBoxRight) - left)
    const stampHeight = Math.max(1, Math.ceil(markHeight + metrics.actualBoundingBoxDescent) - top)
    validateDimensions(stampWidth, stampHeight)
    canvas.width = Math.max(1, Math.ceil(stampWidth * rasterScale)); canvas.height = Math.max(1, Math.ceil(stampHeight * rasterScale))
    context.font = `700 ${options.size * rasterScale}px "Space Grotesk", sans-serif`
    context.fillStyle = options.color
    context.fillText(options.text, -left * rasterScale, (markHeight - top) * rasterScale)
  }
  const position = watermarkPosition(options.position, width, height, markWidth, markHeight)
  return { canvas, x: position.x + left, y: position.y + top, opacity: options.opacity }
}

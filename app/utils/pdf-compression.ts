import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib'

export const MAX_COMPRESSION_BYTES = 64 * 1024 * 1024
export type PdfCompressionLevel = 'lossless' | 'balanced' | 'small' | 'maximum' | 'custom'
export type PdfCustomCompressionSettings = { quality: number; dpi: number }
export type PdfJpegInput = {
  bytes: Uint8Array
  width: number
  height: number
  components: 1 | 3 | 4
  format: 'jpeg' | 'flate' | 'raw'
  quality: number
  maxSide: number
}
export type PdfJpegOutput = { bytes: Uint8Array; width: number; height: number }
export type PdfImageTargetMap = ReadonlyMap<string, number>
export type PdfCompressionResult = {
  bytes: Uint8Array; originalBytes: number; pages: number; imagesCompressed: number
  streamsCompressed: number; imagesSkipped: number; keptOriginal: boolean
}
const name = (value: string) => PDFName.of(value)
const settings = {
  balanced: { quality: 0.76, maxSide: 2400 },
  small: { quality: 0.55, maxSide: 1600 },
  maximum: { quality: 0.5, maxSide: 900 },
}

export function validatePdfCompressionInput(bytes: Uint8Array, level: PdfCompressionLevel, customSettings?: PdfCustomCompressionSettings) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_COMPRESSION_BYTES) throw new Error('Select a PDF up to 64 MB.')
  if (!['lossless', 'balanced', 'small', 'maximum', 'custom'].includes(level)) throw new Error('Choose a valid compression level.')
  if (level === 'custom' && (!customSettings
    || !Number.isInteger(customSettings.quality) || customSettings.quality < 10 || customSettings.quality > 100
    || !Number.isInteger(customSettings.dpi) || customSettings.dpi < 75 || customSettings.dpi > 300)) {
    throw new Error('Choose image quality from 10% to 100% and resolution from 75 to 300 DPI.')
  }
  // A PDF header may follow a short binary prefix.
  if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('This file does not contain a PDF header.')
}

export async function compressPdf(
  bytes: Uint8Array,
  level: PdfCompressionLevel,
  encodeJpeg?: (input: PdfJpegInput) => Promise<PdfJpegOutput>,
  progress: (message: string) => void = () => {},
  imageTargets?: PdfImageTargetMap,
  customSettings?: PdfCustomCompressionSettings,
): Promise<PdfCompressionResult> {
  validatePdfCompressionInput(bytes, level, customSettings)
  progress('Reading PDF…')
  let pdf: PDFDocument, pages: number
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true })
    pages = pdf.getPageCount()
  }
  catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message)) throw new Error('This PDF is encrypted. Use an unencrypted copy.')
    throw new Error('Could not read this PDF. It may be damaged or unsupported.')
  }
  if (!pages || pages > 300) throw new Error('Use a PDF with 1 to 300 pages.')
  const objects = pdf.context.enumerateIndirectObjects()
  if (objects.length > 50000) throw new Error('This PDF is too complex. Split it into smaller documents first.')
  // Rewriting a digitally signed document invalidates its cryptographic signature.
  const pending: unknown[] = objects.map(([, object]) => object)
  const seen = new Set<unknown>()
  while (pending.length) {
    const object = pending.pop()
    if (seen.has(object)) continue
    seen.add(object)
    const dict = object instanceof PDFDict ? object : object instanceof PDFRawStream ? object.dict : null
    if (dict && (dict.has(name('ByteRange')) || dict.get(name('Type')) === name('Sig'))) {
      throw new Error('This PDF contains a digital signature. Compress an unsigned copy to preserve the signed original.')
    }
    if (dict) pending.push(...dict.values())
    else if (object instanceof PDFArray) for (let i = 0; i < object.size(); i++) pending.push(object.get(i))
  }
  let metadataRemoved = pdf.context.trailerInfo.Info !== undefined
  const removedMetadataRefs = new Set<PDFRef>()
  const info = pdf.context.trailerInfo.Info
  if (info instanceof PDFRef) {
    removedMetadataRefs.add(info)
    pdf.context.delete(info)
  }
  pdf.context.trailerInfo.Info = undefined
  for (const [, object] of objects) {
    const dict = object instanceof PDFDict ? object : object instanceof PDFRawStream ? object.dict : null
    if (!dict || !dict.has(name('Metadata'))) continue
    metadataRemoved = true
    const metadata = dict.get(name('Metadata'))
    if (metadata instanceof PDFRef) {
      removedMetadataRefs.add(metadata)
      pdf.context.delete(metadata)
    }
    dict.delete(name('Metadata'))
  }
  let imagesCompressed = 0, streamsCompressed = 0, imagesSkipped = 0
  for (const [index, [ref, object]] of objects.entries()) {
    if (removedMetadataRefs.has(ref)) continue
    if (!(object instanceof PDFRawStream)) continue
    const dict = object.dict
    if (dict.has(name('F'))) continue // External stream data is not embedded content.
    const isImage = dict.get(name('Subtype')) === name('Image')
    if (!isImage && !dict.has(name('Filter')) && !dict.has(name('DecodeParms')) && object.contents.length > 128) {
      const compressed = pdf.context.flateStream(object.contents)
      if (compressed.contents.length < object.contents.length) {
        const replacement = dict.clone(pdf.context)
        replacement.set(name('Filter'), name('FlateDecode'))
        pdf.context.assign(ref, PDFRawStream.of(replacement, compressed.contents))
        streamsCompressed++
      }
    }
    if (!isImage || level === 'lossless') continue
    const w = dict.lookup(name('Width')), h = dict.lookup(name('Height'))
    const width = w instanceof PDFNumber ? w.asNumber() : 0, height = h instanceof PDFNumber ? h.asNumber() : 0
    const filter = dict.get(name('Filter'))
    const colorSpace = dict.get(name('ColorSpace'))
    const components: 1 | 3 | 4 | null = colorSpace === name('DeviceRGB') ? 3
      : colorSpace === name('DeviceGray') ? 1
        : colorSpace === name('DeviceCMYK') && filter === name('DCTDecode') ? 4 : null
    const format: PdfJpegInput['format'] | null = filter === name('DCTDecode') ? 'jpeg'
      : filter === name('FlateDecode') ? 'flate'
        : filter === undefined ? 'raw' : null
    const supported = format !== null && components !== null
      && dict.get(name('BitsPerComponent')) instanceof PDFNumber
      && (dict.get(name('BitsPerComponent')) as PDFNumber).asNumber() === 8
      && !['SMask', 'Mask', 'Decode', 'DecodeParms', 'ImageMask', 'Alternates', 'OPI'].some((key) => dict.has(name(key)))
      && Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
      && width <= 16384 && height <= 16384 && width * height <= 12000000
    if (!supported || !encodeJpeg || !components || !format) { imagesSkipped++; continue }
    progress('Optimizing image ' + (imagesCompressed + imagesSkipped + 1) + '…')
    try {
      const imageSettings = level === 'custom'
        ? { quality: customSettings!.quality / 100, maxSide: Math.round(2000 * customSettings!.dpi / 300) }
        : settings[level]
      const maxSide = imageTargets?.get(`${width}x${height}`) ?? imageSettings.maxSide
      const result = await encodeJpeg({ bytes: object.contents, width, height, components, format, quality: imageSettings.quality, maxSide })
      if (!Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) || result.width < 1 || result.height < 1
        || result.width > width || result.height > height || Math.abs(result.width / result.height - width / height) > 0.02
        || !(result.bytes instanceof Uint8Array) || result.bytes[0] !== 0xff || result.bytes[1] !== 0xd8) throw new Error('Invalid JPEG result.')
      if (result.bytes.length < object.contents.length) {
        const replacement = dict.clone(pdf.context)
        replacement.set(name('Width'), PDFNumber.of(result.width))
        replacement.set(name('Height'), PDFNumber.of(result.height))
        replacement.set(name('ColorSpace'), name('DeviceRGB'))
        replacement.set(name('BitsPerComponent'), PDFNumber.of(8))
        replacement.set(name('Filter'), name('DCTDecode'))
        pdf.context.assign(ref, PDFRawStream.of(replacement, result.bytes))
        imagesCompressed++
      } else imagesSkipped++
    } catch { imagesSkipped++ } // Unsupported images retain their original bytes.
    if (index % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  progress('Writing optimized PDF…')
  const candidate = await pdf.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 25 })
  const keptOriginal = candidate.length >= bytes.length && !metadataRemoved
  return { bytes: keptOriginal ? bytes : candidate, originalBytes: bytes.length, pages, imagesCompressed: keptOriginal ? 0 : imagesCompressed, streamsCompressed: keptOriginal ? 0 : streamsCompressed, imagesSkipped, keptOriginal }
}

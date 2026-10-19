import { encoding, widths, kerning } from './ejari-fonts'

export type EjariValues = Record<string, string | number>
export type EjariField = { page: number; style: number; x: number; top: number; text: string; bytes: number[] }
export const ejariLayout: [string, number, number, number][] = [
  ['ownerName',14,27.2,58], ['lessorName',14,35.2,58], ['lessorEmiratesId',17,43.2,58],
  ['lessorLicensingAuthority',136,50.2,40], ['lessorLicenseNo',14,50.2,44],
  ['lessorEmail',14,60.2,58], ['lessorPhone',14,70.2,58], ['tenantName',14,88.2,58],
  ['tenantEmiratesId',19,94.2,58], ['tenantLicensingAuthority',136,102.2,40],
  ['tenantLicenseNo',14,102.2,44], ['tenantEmail',14,112.2,58], ['tenantPhone',14,122.2,58],
  ['plotOrMakaniNo',14,145.2,44], ['buildingName',14,155.2,45], ['propertyNo',136,155.2,48],
  ['propertyType',14,164.2,40], ['propertyAreaSqm',136,164.2,34], ['location',14,174.2,47],
  ['premisesNoDewa',136,174.2,50], ['contractStartDate',14,192.2,40], ['contractEndDate',55,192.2,40],
  ['modeOfPayment',17,208.2,46], ['contractValueAed',136,192.2,58],
  ['annualRentAed',14,200.2,58], ['securityDepositAed',136,200.2,58]
]

function formatValue(key: string, value: string | number) {
  if (key.endsWith('Aed')) {
    const amount = Number(value)
    return Number.isFinite(amount) ? `AED ${amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(value)
  }
  if (key.endsWith('Date')) {
    const date = new Date(value)
    return !value || Number.isNaN(date.getTime()) ? '' : `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`
  }
  return String(value)
}

export function fitEjariText(value: string, widthMm: number, label: string) {
  let text = value.trim()
  if (text.length > 1024) throw new Error(`${label}: maximum 1024 characters.`)
  const bytes = Array.from(text, char => {
    const code = encoding[char.codePointAt(0)!]
    if (code === undefined || code < 32 || code === 127) throw new Error(`${label}: this template supports Latin/WinAnsi text. Unsupported character: ${char}`)
    return code
  })
  const measure = () => bytes.reduce((sum, byte, index) => sum + (widths[byte] ?? 250) + (kerning[byte * 256 + (bytes[index + 1] ?? 0)] ?? 0), 0) * 8 / 1000
  while (bytes.length && measure() > widthMm * 72 / 25.4) { bytes.pop(); text = text.slice(0,-1) }
  return { text, bytes }
}

export function ejariFields(values: EjariValues): EjariField[] {
  const fields: EjariField[] = []
  const add = (key: string, x: number, top: number, width: number, page = 0) => {
    const fitted = fitEjariText(formatValue(key, values[key] ?? ''), width, key)
    if (fitted.bytes.length) fields.push({ ...fitted, page, style: 0, x, top })
  }
  for (const [key,x,top,width] of ejariLayout) add(key,x,top,width)
  for (const [index, top] of [78,86,96,104,112].entries()) add(`additionalTerm${index+1}`,0,top,170,2)
  const choices: Record<string, number> = { Residential:110.5, Commercial:70.5, Industrial:32.5 }
  const check = choices[String(values.propertyUsage)]
  if (check !== undefined) fields.push({ page:0, style:1, x:check, top:141.2, text:'X', bytes:[88] })
  return fields
}

export function encodeEjariFields(fields: EjariField[]) {
  const offsets = new Uint32Array(fields.length+1)
  const placements = new Float64Array(fields.length*4)
  const bytes: number[] = []
  fields.forEach((field,index) => {
    offsets[index] = bytes.length
    bytes.push(...field.bytes)
    placements.set([field.page,field.style,field.x,field.top],index*4)
  })
  offsets[fields.length] = bytes.length
  return { text: new Uint8Array(bytes).buffer, offsets: offsets.buffer, placements: placements.buffer }
}

/** Keep original source lines for review, but exclude unreadable Arabic glyph runs
 * and broken PDF font codes from the current English-only field matcher. */
export function englishDocumentLine(text: string) {
  return text.normalize('NFKC')
    .replace(/\(cid:\d+\)/g, '')
    .replace(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+/g, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\x00]/g, '')
    .replace(/\p{L}+/gu, word => /[^\p{Script=Latin}]/u.test(word) ? ' ' : word)
    .replace(/\b(owner|landlord|lessor|tenant)['’]s\b/gi, '$1')
    .replace(/[’‘]/g, "'")
    .replace(/passport number\s*\/\s*emirates id/gi, 'Passport or Emirates ID')
    .replace(/^[\s|_~\-–—•>=�#]+/, '')
    .replace(/^(?:[A-Za-z]{1,4}\s*[-,|]?\s+)(?=(?:name|nationality|occupation|issuing place|date of birth)\s*:)/i, '')
    .trim()
}

export function isDocumentPlaceholder(value: string, zeroAmount = false) {
  const text = englishDocumentLine(value)
  return !text || !/[A-Za-z0-9]/.test(text)
    || /^(?:n\/?a|none|nil|not provided|not applicable|tbd|select|enter (?:name|value|date)|dd[\s/.-]*mm[\s/.-]*yyyy|yyyy[\s/.-]*mm[\s/.-]*dd)$/i.test(text)
    || ((zeroAmount || /AED/i.test(text)) && /^(?:AED\s*)?0+(?:[.,]0+)?\s*(?:\/-)?\s*(?:AED)?$/i.test(text))
}

/** Preserve columns as tabs rather than concatenating unrelated PDF fields. */
export function pdfDocumentText(items: { str: string; transform: number[]; width: number }[]) {
  const rows: { y: number; items: typeof items }[] = []
  for (const item of items) {
    if (!item.str.trim()) continue
    const y = item.transform[5]!
    let row = rows.find(row => Math.abs(row.y - y) < 3)
    if (!row) { row = { y, items: [] }; rows.push(row) }
    row.items.push(item)
  }
  return rows.sort((a, b) => b.y - a.y).map(row => row.items.sort((a, b) => a.transform[4]! - b.transform[4]!).map(item => item.str).join('\t')).join('\n')
}

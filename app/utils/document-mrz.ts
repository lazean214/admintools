export type MrzValue = { key: 'fullName' | 'surname' | 'givenNames' | 'passportNumber' | 'cardNumber' | 'nationality' | 'issuingCountry' | 'birthDate' | 'identityExpiryDate' | 'sex'; value: string; source: string; warning?: string }

/** ICAO 9303 7/3/1 transcription check; it does not authenticate a document. */
export function mrzCheckDigit(value: string) {
  if (!/^[A-Z0-9<]+$/.test(value)) return -1
  return [...value].reduce((sum, char, index) => sum + (char === '<' ? 0 : /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 55) * [7, 3, 1][index % 3]!, 0) % 10
}

export function parseDocumentMrz(text: string): MrzValue[] {
  const lines = text.toUpperCase().split(/\r?\n/).map(source => ({ source, value: source.replace(/\s/g, '') }))
  for (let i = 0; i < lines.length - 1; i++) {
    const first = lines[i]!, second = lines[i + 1]!, third = lines[i + 2]
    let names: string, number: string, nationality: string, dob: string, expiry: string, sex: string, source: string, valid: boolean, passport: boolean
    const check = (value: string, digit: string) => /^\d$/.test(digit) && mrzCheckDigit(value) === Number(digit)
    if (/^P[A-Z<][A-Z<]{3}[A-Z<]{39}$/.test(first.value) && /^[A-Z0-9<]{44}$/.test(second.value)) {
      passport = true
      const line = second.value
      names = first.value.slice(5); number = line.slice(0, 9); nationality = line.slice(10, 13)
      dob = line.slice(13, 19); expiry = line.slice(21, 27); sex = line[20]!
      valid = check(number, line[9]!) && check(dob, line[19]!) && check(expiry, line[27]!)
        && (check(line.slice(28, 42), line[42]!) || /^<+$/.test(line.slice(28, 43)))
        && check(line.slice(0, 10) + line.slice(13, 20) + line.slice(21, 43), line[43]!)
      source = first.source + '\n' + second.source
    } else if (/^[IAC][A-Z<][A-Z<]{3}[A-Z0-9<]{25}$/.test(first.value) && /^[A-Z0-9<]{30}$/.test(second.value) && third && /^[A-Z<]{30}$/.test(third.value)) {
      passport = false
      const line = second.value
      names = third.value; number = first.value.slice(5, 14); nationality = line.slice(15, 18)
      dob = line.slice(0, 6); expiry = line.slice(8, 14); sex = line[7]!
      valid = check(number, first.value[14]!) && check(dob, line[6]!) && check(expiry, line[14]!)
        && check(first.value.slice(5, 30) + line.slice(0, 7) + line.slice(8, 15) + line.slice(18, 29), line[29]!)
      source = first.source + '\n' + second.source + '\n' + third.source
    } else continue
    const clean = (value: string) => value.replace(/</g, ' ').replace(/\s+/g, ' ').trim()
    const [family = '', given = ''] = names.split('<<')
    const warning = valid ? 'Compare with the printed details before use. Text checks do not prove authenticity.' : 'Some text checks failed. Correct this value against the document before use.'
    const values: MrzValue[] = []
    const add = (key: MrzValue['key'], value: string, note = warning) => { if (value) values.push({ key, value, source, warning: note }) }
    add('fullName', [clean(given), clean(family)].filter(Boolean).join(' '))
    add('surname', clean(family)); add('givenNames', clean(given))
    add(passport ? 'passportNumber' : 'cardNumber', clean(number))
    add('issuingCountry', clean(first.value.slice(2, 5))); add('nationality', clean(nationality))
    // A two-digit year does not establish its century; keep the source value for correction.
    if (/^\d{6}$/.test(dob)) add('birthDate', dob, `${warning} The year has two digits; enter the full date as YYYY-MM-DD.`)
    if (/^\d{6}$/.test(expiry)) add('identityExpiryDate', expiry, `${warning} The year has two digits; enter the full date as YYYY-MM-DD.`)
    if (/^[MFX]$/.test(sex)) add('sex', sex)
    return values
  }
  return []
}

import crypto from 'node:crypto'

const CHAR_TABLE =
  'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe='

const HEX_ARRAY: (number | null)[] = [
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, null, null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null, null, null, 10, 11, 12, 13, 14, 15,
]

const UA_KEY = Buffer.from([0x00, 0x01, 0x0c])

function md5(input: string | number[]): string {
  const data = typeof input === 'string' ? Buffer.from(input) : Buffer.from(input)
  return crypto.createHash('md5').update(data).digest('hex')
}

function md5StrToArray(md5Str: string): number[] {
  if (md5Str.length > 32) {
    return Array.from(md5Str).map(c => c.charCodeAt(0))
  }
  const arr: number[] = []
  for (let i = 0; i < md5Str.length; i += 2) {
    const high = HEX_ARRAY[md5Str.charCodeAt(i)] ?? 0
    const low = HEX_ARRAY[md5Str.charCodeAt(i + 1)] ?? 0
    arr.push((high << 4) | low)
  }
  return arr
}

function rc4Encrypt(key: Buffer, data: Buffer): Buffer {
  const S = Array.from({ length: 256 }, (_, i) => i)
  let j = 0

  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) % 256
    ;[S[i], S[j]] = [S[j], S[i]]
  }

  let i = 0
  j = 0
  const result: number[] = []

  for (const byte of data) {
    i = (i + 1) % 256
    j = (j + S[i]) % 256
    ;[S[i], S[j]] = [S[j], S[i]]
    result.push(byte ^ S[(S[i] + S[j]) % 256])
  }

  return Buffer.from(result)
}

function calculation(a1: number, a2: number, a3: number): string {
  const x1 = (a1 & 255) << 16
  const x2 = (a2 & 255) << 8
  const x3 = x1 | x2 | a3
  return (
    CHAR_TABLE[(x3 & 16515072) >> 18] +
    CHAR_TABLE[(x3 & 258048) >> 12] +
    CHAR_TABLE[(x3 & 4032) >> 6] +
    CHAR_TABLE[x3 & 63]
  )
}

function encodingConversion(
  a: number, b: number, c: number, e: number, d: number,
  t: number, f: number, r: number, n: number, o: number,
  i: number, _: number, x: number, u: number, s: number,
  l: number, v: number, h: number, p: number
): string {
  const y = [a, Math.floor(i), b, _, c, x, e, u, d, s, t, l, f, v, r, h, n, p, o]
  return Buffer.from(y).toString('latin1')
}

function encodingConversion2(a: number, b: number, c: string): string {
  return String.fromCharCode(a) + String.fromCharCode(b) + c
}

export interface XBogusResult {
  params: string
  xbogus: string
  userAgent: string
}

export function getXBogus(urlParams: string, userAgent?: string): XBogusResult {
  const ua =
    userAgent ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'

  const encryptedUa = rc4Encrypt(UA_KEY, Buffer.from(ua, 'latin1'))
  const base64Ua = encryptedUa.toString('base64')
  const array1 = md5StrToArray(md5(base64Ua))

  const array2 = md5StrToArray(md5(md5StrToArray('d41d8cd98f00b204e9800998ecf8427e')))

  const urlParamsHash1 = md5(urlParams)
  const urlParamsHash2 = md5(md5StrToArray(urlParamsHash1))
  const urlParamsArray = md5StrToArray(urlParamsHash2)

  const timer = Math.floor(Date.now() / 1000)
  const ct = 536919696

  const newArray: number[] = [
    64, 0.00390625, 1, 12,
    urlParamsArray[14], urlParamsArray[15],
    array2[14], array2[15],
    array1[14], array1[15],
    (timer >> 24) & 255, (timer >> 16) & 255, (timer >> 8) & 255, timer & 255,
    (ct >> 24) & 255, (ct >> 16) & 255, (ct >> 8) & 255, ct & 255,
  ].map(v => (typeof v === 'number' ? Math.floor(v) : v))

  let xorResult = newArray[0]
  for (let i = 1; i < newArray.length; i++) {
    xorResult ^= newArray[i]
  }
  newArray.push(xorResult)

  const array3: number[] = []
  const array4: number[] = []
  for (let i = 0; i < newArray.length; i += 2) {
    array3.push(newArray[i])
    if (i + 1 < newArray.length) {
      array4.push(newArray[i + 1])
    }
  }

  const mergeArray = [...array3, ...array4]
  const encoded = encodingConversion(
    mergeArray[0], mergeArray[1], mergeArray[2], mergeArray[3], mergeArray[4],
    mergeArray[5], mergeArray[6], mergeArray[7], mergeArray[8], mergeArray[9],
    mergeArray[10], mergeArray[11], mergeArray[12], mergeArray[13], mergeArray[14],
    mergeArray[15], mergeArray[16], mergeArray[17], mergeArray[18]
  )

  const rc4Result = rc4Encrypt(Buffer.from([0xff]), Buffer.from(encoded, 'latin1'))
  const garbledCode = encodingConversion2(2, 255, rc4Result.toString('latin1'))

  let xb = ''
  for (let i = 0; i < garbledCode.length; i += 3) {
    xb += calculation(
      garbledCode.charCodeAt(i),
      garbledCode.charCodeAt(i + 1),
      garbledCode.charCodeAt(i + 2)
    )
  }

  return {
    params: `${urlParams}&X-Bogus=${xb}`,
    xbogus: xb,
    userAgent: ua,
  }
}

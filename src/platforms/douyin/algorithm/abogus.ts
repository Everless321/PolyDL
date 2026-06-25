import smCrypto from 'sm-crypto'
const { sm3 } = smCrypto

const CHARACTER = 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe'
const CHARACTER2 = 'ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe'
const CHARACTER_LIST = [CHARACTER, CHARACTER2]

const UA_KEY = Buffer.from([0x00, 0x01, 0x0e])

const BIG_ARRAY = [
  121, 243, 55, 234, 103, 36, 47, 228, 30, 231, 106, 6, 115, 95, 78, 101, 250, 207, 198, 50, 139,
  227, 220, 105, 97, 143, 34, 28, 194, 215, 18, 100, 159, 160, 43, 8, 169, 217, 180, 120, 247, 45,
  90, 11, 27, 197, 46, 3, 84, 72, 5, 68, 62, 56, 221, 75, 144, 79, 73, 161, 178, 81, 64, 187, 134,
  117, 186, 118, 16, 241, 130, 71, 89, 147, 122, 129, 65, 40, 88, 150, 110, 219, 199, 255, 181, 254,
  48, 4, 195, 248, 208, 32, 116, 167, 69, 201, 17, 124, 125, 104, 96, 83, 80, 127, 236, 108, 154,
  126, 204, 15, 20, 135, 112, 158, 13, 1, 188, 164, 210, 237, 222, 98, 212, 77, 253, 42, 170, 202,
  26, 22, 29, 182, 251, 10, 173, 152, 58, 138, 54, 141, 185, 33, 157, 31, 252, 132, 233, 235, 102,
  196, 191, 223, 240, 148, 39, 123, 92, 82, 128, 109, 57, 24, 38, 113, 209, 245, 2, 119, 153, 229,
  189, 214, 230, 174, 232, 63, 52, 205, 86, 140, 66, 175, 111, 171, 246, 133, 238, 193, 99, 60, 74,
  91, 225, 51, 76, 37, 145, 211, 166, 151, 213, 206, 0, 200, 244, 176, 218, 44, 184, 172, 49, 216,
  93, 168, 53, 21, 183, 41, 67, 85, 224, 155, 226, 242, 87, 177, 146, 70, 190, 12, 162, 19, 137,
  114, 25, 165, 163, 192, 23, 59, 9, 94, 179, 107, 35, 7, 142, 131, 239, 203, 149, 136, 61, 249, 14,
  156,
]

const SORT_INDEX = [
  18, 20, 52, 26, 30, 34, 58, 38, 40, 53, 42, 21, 27, 54, 55, 31, 35, 57, 39, 41, 43, 22, 28, 32,
  60, 36, 23, 29, 33, 37, 44, 45, 59, 46, 47, 48, 49, 50, 24, 25, 65, 66, 70, 71,
]

const SORT_INDEX_2 = [
  18, 20, 26, 30, 34, 38, 40, 42, 21, 27, 31, 35, 39, 41, 43, 22, 28, 32, 36, 23, 29, 33, 37, 44,
  45, 46, 47, 48, 49, 50, 24, 25, 52, 53, 54, 55, 57, 58, 59, 60, 65, 66, 70, 71,
]

function jsShiftRight(val: number, n: number): number {
  return (val % 0x100000000) >>> n
}

function toCharArray(s: string): number[] {
  return Array.from(s).map(c => c.charCodeAt(0))
}

function toCharStr(arr: number[]): string {
  return arr.map(n => String.fromCharCode(n)).join('')
}

function generateRandomBytes(length: number = 3): string {
  const result: string[] = []
  for (let i = 0; i < length; i++) {
    const rd = Math.floor(Math.random() * 10000)
    result.push(
      String.fromCharCode((rd & 255 & 170) | 1),
      String.fromCharCode((rd & 255 & 85) | 2),
      String.fromCharCode((jsShiftRight(rd, 8) & 170) | 5),
      String.fromCharCode((jsShiftRight(rd, 8) & 85) | 40)
    )
  }
  return result.join('')
}

function sm3ToArray(input: string | number[]): number[] {
  // sm-crypto 的 sm3 函数支持字符串和数组输入，但类型定义不完整
  // 对于数组：直接作为字节数组处理，与 Python bytes(input_data) 行为一致
  const sm3Func = sm3 as unknown as (data: string | number[]) => string
  let hexResult: string
  if (typeof input === 'string') {
    // 将字符串转为字节数组再传给 sm3，与 Python encode('utf-8') 行为一致
    const bytes = Array.from(new TextEncoder().encode(input))
    hexResult = sm3Func(bytes)
  } else {
    hexResult = sm3Func(input)
  }
  const result: number[] = []
  for (let i = 0; i < hexResult.length; i += 2) {
    result.push(parseInt(hexResult.slice(i, i + 2), 16))
  }
  return result
}

function rc4Encrypt(key: Buffer, plaintext: string): number[] {
  const S = Array.from({ length: 256 }, (_, i) => i)
  let j = 0

  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) % 256
    ;[S[i], S[j]] = [S[j], S[i]]
  }

  let i = 0
  j = 0
  const ciphertext: number[] = []

  for (const char of plaintext) {
    i = (i + 1) % 256
    j = (j + S[i]) % 256
    ;[S[i], S[j]] = [S[j], S[i]]
    const K = S[(S[i] + S[j]) % 256]
    ciphertext.push(char.charCodeAt(0) ^ K)
  }

  return ciphertext
}

function base64Encode(inputString: string, alphabetIndex: number = 0): string {
  const alphabet = CHARACTER_LIST[alphabetIndex]
  let binaryString = ''

  for (const char of inputString) {
    binaryString += char.charCodeAt(0).toString(2).padStart(8, '0')
  }

  const paddingLength = (6 - (binaryString.length % 6)) % 6
  binaryString += '0'.repeat(paddingLength)

  let output = ''
  for (let i = 0; i < binaryString.length; i += 6) {
    const index = parseInt(binaryString.slice(i, i + 6), 2)
    output += alphabet[index]
  }

  output += '='.repeat(Math.floor(paddingLength / 2))
  return output
}

function abogusEncode(abogusBytes: string, alphabetIndex: number): string {
  const alphabet = CHARACTER_LIST[alphabetIndex]
  const result: string[] = []

  for (let i = 0; i < abogusBytes.length; i += 3) {
    let n: number
    if (i + 2 < abogusBytes.length) {
      n =
        (abogusBytes.charCodeAt(i) << 16) |
        (abogusBytes.charCodeAt(i + 1) << 8) |
        abogusBytes.charCodeAt(i + 2)
    } else if (i + 1 < abogusBytes.length) {
      n = (abogusBytes.charCodeAt(i) << 16) | (abogusBytes.charCodeAt(i + 1) << 8)
    } else {
      n = abogusBytes.charCodeAt(i) << 16
    }

    const shifts = [18, 12, 6, 0]
    const masks = [0xfc0000, 0x03f000, 0x0fc0, 0x3f]

    for (let idx = 0; idx < 4; idx++) {
      if (shifts[idx] === 6 && i + 1 >= abogusBytes.length) break
      if (shifts[idx] === 0 && i + 2 >= abogusBytes.length) break
      result.push(alphabet[(n & masks[idx]) >> shifts[idx]])
    }
  }

  const padding = (4 - (result.length % 4)) % 4
  result.push('='.repeat(padding))

  return result.join('')
}

function transformBytes(bytesList: number[], bigArray: number[]): string {
  const bytesStr = toCharStr(bytesList)
  const resultStr: string[] = []
  let indexB = bigArray[1]
  let initialValue = 0
  let valueE = 0

  for (let index = 0; index < bytesStr.length; index++) {
    const char = bytesStr[index]

    if (index === 0) {
      initialValue = bigArray[indexB]
      const sumInitial = indexB + initialValue
      bigArray[1] = initialValue
      bigArray[indexB] = indexB
      const charValue = char.charCodeAt(0)
      const adjustedSum = sumInitial % bigArray.length
      const valueF = bigArray[adjustedSum]
      resultStr.push(String.fromCharCode(charValue ^ valueF))
    } else {
      let sumInitial = initialValue + valueE
      const charValue = char.charCodeAt(0)
      sumInitial = sumInitial % bigArray.length
      const valueF = bigArray[sumInitial]
      resultStr.push(String.fromCharCode(charValue ^ valueF))
    }

    valueE = bigArray[(index + 2) % bigArray.length]
    const sumInitial = (indexB + valueE) % bigArray.length
    initialValue = bigArray[sumInitial]
    bigArray[sumInitial] = bigArray[(index + 2) % bigArray.length]
    bigArray[(index + 2) % bigArray.length] = initialValue
    indexB = sumInitial
  }

  return resultStr.join('')
}

function generateBrowserFingerprint(platform: string = 'Win32'): string {
  const innerWidth = 1024 + Math.floor(Math.random() * 896)
  const innerHeight = 768 + Math.floor(Math.random() * 312)
  const outerWidth = innerWidth + 24 + Math.floor(Math.random() * 8)
  const outerHeight = innerHeight + 75 + Math.floor(Math.random() * 15)
  const screenX = 0
  const screenY = Math.random() > 0.5 ? 0 : 30
  const sizeWidth = 1024 + Math.floor(Math.random() * 896)
  const sizeHeight = 768 + Math.floor(Math.random() * 312)
  const availWidth = 1280 + Math.floor(Math.random() * 640)
  const availHeight = 800 + Math.floor(Math.random() * 280)

  return `${innerWidth}|${innerHeight}|${outerWidth}|${outerHeight}|${screenX}|${screenY}|0|0|${sizeWidth}|${sizeHeight}|${availWidth}|${availHeight}|${innerWidth}|${innerHeight}|24|24|${platform}`
}

export interface ABogusResult {
  params: string
  abogus: string
  userAgent: string
  body: string
}

export interface ABogusOptions {
  userAgent?: string
  fingerprint?: string
  options?: [number, number, number]
}

export function getABogus(
  params: string,
  body: string = '',
  opts: ABogusOptions = {}
): ABogusResult {
  const userAgent =
    opts.userAgent ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
  const browserFp = opts.fingerprint || generateBrowserFingerprint('Win32')
  const requestOptions = opts.options || [0, 1, 14]

  const salt = 'cus'
  const aid = 6383
  const pageId = 0

  const bigArray = [...BIG_ARRAY]

  const addSalt = (param: string) => param + salt

  const paramsToArray = (param: string | number[], shouldAddSalt: boolean = true): number[] => {
    const processed = typeof param === 'string' && shouldAddSalt ? addSalt(param) : param
    return sm3ToArray(processed as string | number[])
  }

  const startEncryption = Date.now()

  const array1 = paramsToArray(paramsToArray(params) as unknown as string)
  const array2 = paramsToArray(paramsToArray(body) as unknown as string)

  const encryptedUa = rc4Encrypt(UA_KEY, userAgent)
  const base64Ua = base64Encode(toCharStr(encryptedUa), 1)
  const array3 = paramsToArray(base64Ua, false)

  const endEncryption = Date.now()

  const abDir: Record<number, number> = {
    8: 3,
    18: 44,
    66: 0,
    69: 0,
    70: 0,
    71: 0,
  }

  abDir[20] = (startEncryption >> 24) & 255
  abDir[21] = (startEncryption >> 16) & 255
  abDir[22] = (startEncryption >> 8) & 255
  abDir[23] = startEncryption & 255
  abDir[24] = Math.floor(startEncryption / 256 / 256 / 256 / 256) >> 0
  abDir[25] = Math.floor(startEncryption / 256 / 256 / 256 / 256 / 256) >> 0

  abDir[26] = (requestOptions[0] >> 24) & 255
  abDir[27] = (requestOptions[0] >> 16) & 255
  abDir[28] = (requestOptions[0] >> 8) & 255
  abDir[29] = requestOptions[0] & 255

  abDir[30] = Math.floor(requestOptions[1] / 256) & 255
  abDir[31] = (requestOptions[1] % 256) & 255
  abDir[32] = (requestOptions[1] >> 24) & 255
  abDir[33] = (requestOptions[1] >> 16) & 255

  abDir[34] = (requestOptions[2] >> 24) & 255
  abDir[35] = (requestOptions[2] >> 16) & 255
  abDir[36] = (requestOptions[2] >> 8) & 255
  abDir[37] = requestOptions[2] & 255

  abDir[38] = array1[21]
  abDir[39] = array1[22]
  abDir[40] = array2[21]
  abDir[41] = array2[22]
  abDir[42] = array3[23]
  abDir[43] = array3[24]

  abDir[44] = (endEncryption >> 24) & 255
  abDir[45] = (endEncryption >> 16) & 255
  abDir[46] = (endEncryption >> 8) & 255
  abDir[47] = endEncryption & 255
  abDir[48] = abDir[8]
  abDir[49] = Math.floor(endEncryption / 256 / 256 / 256 / 256) >> 0
  abDir[50] = Math.floor(endEncryption / 256 / 256 / 256 / 256 / 256) >> 0

  abDir[51] = (pageId >> 24) & 255
  abDir[52] = (pageId >> 16) & 255
  abDir[53] = (pageId >> 8) & 255
  abDir[54] = pageId & 255
  abDir[55] = pageId
  abDir[56] = aid
  abDir[57] = aid & 255
  abDir[58] = (aid >> 8) & 255
  abDir[59] = (aid >> 16) & 255
  abDir[60] = (aid >> 24) & 255

  abDir[64] = browserFp.length
  abDir[65] = browserFp.length

  const sortedValues = SORT_INDEX.map(i => abDir[i] || 0)
  const edgeFpArray = toCharArray(browserFp)

  let abXor = (browserFp.length & 255) >> (8 & 255)
  for (let i = 0; i < SORT_INDEX_2.length - 1; i++) {
    if (i === 0) {
      abXor = abDir[SORT_INDEX_2[i]] || 0
    }
    abXor ^= abDir[SORT_INDEX_2[i + 1]] || 0
  }

  sortedValues.push(...edgeFpArray)
  sortedValues.push(abXor)

  const abogusBytes = generateRandomBytes() + transformBytes(sortedValues, bigArray)
  const abogus = abogusEncode(abogusBytes, 0)

  return {
    params: `${params}&a_bogus=${abogus}`,
    abogus,
    userAgent,
    body,
  }
}

export { generateBrowserFingerprint }

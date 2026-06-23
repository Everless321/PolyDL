import { toBase36 } from './common.js'

const BASE_STR = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function genVerifyFp(): string {
  const t = BASE_STR.length
  const milliseconds = Date.now()
  const r = toBase36(milliseconds)

  const o: string[] = new Array(36).fill('')
  o[8] = o[13] = o[18] = o[23] = '_'
  o[14] = '4'

  for (let i = 0; i < 36; i++) {
    if (!o[i]) {
      const n = Math.floor(Math.random() * t)
      if (i === 19) {
        o[i] = BASE_STR[(n & 3) | 8]
      } else {
        o[i] = BASE_STR[n]
      }
    }
  }

  return 'verify_' + r + '_' + o.join('')
}

export function genSVWebId(): string {
  return genVerifyFp()
}

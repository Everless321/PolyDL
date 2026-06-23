declare module 'sm-crypto' {
  export function sm3(data: string): string

  interface SM2 {
    generateKeyPairHex(): { privateKey: string; publicKey: string }
    doEncrypt(msg: string, publicKey: string, cipherMode?: number): string
    doDecrypt(encryptedData: string, privateKey: string, cipherMode?: number): string
    doSignature(msg: string, privateKey: string, options?: object): string
    doVerifySignature(msg: string, signHex: string, publicKey: string, options?: object): boolean
  }

  interface SM4 {
    encrypt(inArray: number[], key: number[]): number[]
    decrypt(inArray: number[], key: number[]): number[]
  }

  export const sm2: SM2
  export const sm4: SM4
}

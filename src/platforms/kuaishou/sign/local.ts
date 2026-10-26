/**
 * www 语义的本地 __NS_hxfalcon 签名器。
 * 一个实例对应浏览器里的一个引擎：count / guardCount 跨调用递增，空 body 不写入 signInput。
 */

import type { KuaishouSigner, SignRequest } from '../rest.js'
import { HxFalconSigner, buildSignInput, type HxFalconSignerOptions } from './falcon.js'

export class LocalSigner implements KuaishouSigner {
  readonly falcon: HxFalconSigner

  constructor(options: HxFalconSignerOptions = {}) {
    this.falcon = new HxFalconSigner(options)
  }

  async sign(req: SignRequest): Promise<string> {
    const signInput = buildSignInput(
      req.path,
      req.method,
      req.query,
      req.body,
      req.contentType ?? 'application/json',
      null,
      true
    )
    return this.falcon.sign(signInput)
  }
}

import { JSONPath } from 'jsonpath-plus'

export class JSONModel<T = Record<string, unknown>> {
  protected _data: T
  private _cache: Map<string, unknown> = new Map()

  constructor(data: T) {
    this._data = data
  }

  protected _getAttrValue<R = unknown>(jsonpathExpr: string): R | null {
    const cacheKey = `attr:${jsonpathExpr}`
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey) as R | null
    }

    const matches = JSONPath({ path: jsonpathExpr, json: this._data as object })

    if (!matches || matches.length === 0) {
      this._cache.set(cacheKey, null)
      return null
    }

    const result = matches.length === 1 ? matches[0] : matches
    this._cache.set(cacheKey, result)
    return result as R
  }

  protected _getListAttrValue<R = unknown>(jsonpathExpr: string, asJson: boolean = false): R[] | string | null {
    const cacheKey = `list:${jsonpathExpr}:${asJson}`
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey) as R[] | string | null
    }

    let parentExprStr: string
    let childExprStr: string

    if (jsonpathExpr.includes('[*]')) {
      const idx = jsonpathExpr.indexOf('[*]')
      parentExprStr = jsonpathExpr.slice(0, idx + 3)
      childExprStr = jsonpathExpr.slice(idx + 3)
    } else {
      parentExprStr = jsonpathExpr
      childExprStr = ''
    }

    const parentMatches = JSONPath({ path: parentExprStr, json: this._data as object })

    if (!parentMatches || !Array.isArray(parentMatches) || parentMatches.length === 0) {
      this._cache.set(cacheKey, null)
      return null
    }

    const values: R[] = []
    if (childExprStr) {
      const childPath = `$.${childExprStr.replace(/^\./, '')}`
      for (const parentValue of parentMatches) {
        const childMatches = JSONPath({ path: childPath, json: parentValue })
        if (childMatches && childMatches.length > 0) {
          values.push(childMatches[0] as R)
        } else {
          values.push(null as R)
        }
      }
    } else {
      values.push(...(parentMatches as R[]))
    }

    const result = asJson ? JSON.stringify(values) : values
    this._cache.set(cacheKey, result)
    return result
  }

  toRaw(): T {
    return this._data
  }

  toDict(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const proto = Object.getPrototypeOf(this)
    const propertyNames = Object.getOwnPropertyNames(proto)

    for (const name of propertyNames) {
      if (name.startsWith('_') || name === 'constructor') continue
      const descriptor = Object.getOwnPropertyDescriptor(proto, name)
      if (descriptor && typeof descriptor.get === 'function') {
        try {
          result[name] = (this as Record<string, unknown>)[name]
        } catch {
          result[name] = null
        }
      }
    }

    return result
  }
}

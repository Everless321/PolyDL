import { JSONPath } from 'jsonpath-plus'

/**
 * 沿原型链收集实例上所有 getter 属性名（对齐 f2 的 `dir()` 语义）。
 * 从最派生的原型向上遍历至 `Object.prototype`，子类覆写的 getter 优先（首次出现即保留）。
 * 这样继承型 Filter 子类也能取到父类定义的 getter，避免 toDict/filterToList 输出残缺。
 */
export function collectGetterNames(instance: object): string[] {
  const names = new Set<string>()
  let proto = Object.getPrototypeOf(instance)

  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name.startsWith('_') || name === 'constructor' || names.has(name)) continue
      const descriptor = Object.getOwnPropertyDescriptor(proto, name)
      if (descriptor && typeof descriptor.get === 'function') {
        names.add(name)
      }
    }
    proto = Object.getPrototypeOf(proto)
  }

  return [...names]
}

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

  protected _getListAttrValue<R = unknown>(
    jsonpathExpr: string,
    asJson: boolean = false
  ): R[] | string | null {
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

    for (const name of collectGetterNames(this)) {
      try {
        result[name] = (this as Record<string, unknown>)[name]
      } catch {
        result[name] = null
      }
    }

    return result
  }
}

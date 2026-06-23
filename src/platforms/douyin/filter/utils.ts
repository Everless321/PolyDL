import { JSONModel } from './base.js'

const REPLACE_PATTERN = /[^\u4e00-\u9fa5a-zA-Z0-9#]/g

export function replaceT<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(item =>
      typeof item === 'string' ? item.replace(REPLACE_PATTERN, '_') : (item || '')
    ) as T
  }

  if (typeof obj === 'string') {
    return obj.replace(REPLACE_PATTERN, '_') as T
  }

  return obj
}

export function timestamp2Str(
  timestamp: string | number | (string | number)[],
  format: string = 'YYYY-MM-DD HH-mm-ss',
  tzOffsetHours: number = 8
): string | string[] {
  if (timestamp === null || timestamp === undefined || timestamp === 'None') {
    return 'Invalid timestamp'
  }

  if (timestamp === 0 || timestamp === '0') {
    return formatDate(new Date(), format)
  }

  const convert = (ts: string | number): string => {
    if (typeof ts === 'string' && ts.length === 30) {
      const date = new Date(ts)
      return formatDate(date, format)
    }

    let value = typeof ts === 'string' ? parseFloat(ts) : ts
    if (value > 1e10) {
      value = value / 1000
    }

    const date = new Date(value * 1000)
    const tzOffset = tzOffsetHours * 60 * 60 * 1000
    const localDate = new Date(date.getTime() + tzOffset - date.getTimezoneOffset() * 60 * 1000)
    return formatDate(localDate, format)
  }

  if (Array.isArray(timestamp)) {
    return timestamp.map(ts => {
      if (Array.isArray(ts)) {
        return (ts as (string | number)[]).map(t => convert(t)).join(', ')
      }
      return convert(ts)
    })
  }

  return convert(timestamp)
}

function formatDate(date: Date, format: string): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

export interface FilterToListOptions {
  entriesPath: string
  excludeFields: string[]
  extraFields?: string[]
}

export function filterToList<T extends JSONModel>(
  filterInstance: T,
  options: FilterToListOptions
): Record<string, unknown>[] {
  const { entriesPath, excludeFields, extraFields = [] } = options

  const proto = Object.getPrototypeOf(filterInstance)
  const propertyNames = Object.getOwnPropertyNames(proto)

  const keys = propertyNames.filter(name => {
    if (name.startsWith('_') || name === 'constructor') return false
    if (excludeFields.includes(name)) return false
    const descriptor = Object.getOwnPropertyDescriptor(proto, name)
    return descriptor && typeof descriptor.get === 'function'
  })

  const entries = (filterInstance as unknown as { _getAttrValue: (path: string) => unknown[] })
    ._getAttrValue(entriesPath) as unknown[] || []

  const listDicts: Record<string, unknown>[] = []

  for (let index = 0; index < entries.length; index++) {
    const d: Record<string, unknown> = {}

    for (const key of extraFields) {
      try {
        d[key] = (filterInstance as Record<string, unknown>)[key]
      } catch {
        d[key] = null
      }
    }

    for (const key of keys) {
      try {
        const attrValues = (filterInstance as Record<string, unknown>)[key]
        if (Array.isArray(attrValues) && index < attrValues.length) {
          d[key] = attrValues[index]
        } else {
          d[key] = null
        }
      } catch {
        d[key] = null
      }
    }

    listDicts.push(d)
  }

  return listDicts
}

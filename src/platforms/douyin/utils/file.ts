import * as fs from 'fs'
import * as path from 'path'
import { InvalidConfigError } from '../errors/index.js'
import { splitFilename } from './common.js'

const OS_LIMITS: Record<string, number> = {
  win32: 200,
  cygwin: 200,
  darwin: 200,
  linux: 200,
}

export interface FormatFileNameOptions {
  create?: string
  nickname?: string
  awemeId?: string
  desc?: string
  caption?: string
  uid?: string
}

export function formatFileName(
  namingTemplate: string,
  awemeData: FormatFileNameOptions = {},
  customFields: Record<string, string> = {}
): string {
  if (!namingTemplate) {
    throw new InvalidConfigError('naming', namingTemplate)
  }

  const fields: Record<string, string> = {
    create: awemeData.create || '',
    nickname: awemeData.nickname || '',
    aweme_id: awemeData.awemeId || '',
    desc: splitFilename(awemeData.desc || '', OS_LIMITS),
    caption: awemeData.caption || '',
    uid: awemeData.uid || '',
    ...customFields,
  }

  return namingTemplate.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in fields)) {
      throw new Error(`文件名模板字段 ${key} 不存在，请检查`)
    }
    return fields[key]
  })
}

export interface CreateUserFolderOptions {
  path?: string
  mode?: string
}

export function createUserFolder(options: CreateUserFolderOptions, nickname: string | number): string {
  if (typeof options !== 'object') {
    throw new TypeError('options 参数必须是对象')
  }

  const basePath = options.path || 'Download'
  const mode = options.mode || 'PLEASE_SETUP_MODE'
  const userPath = path.join(basePath, 'douyin', mode, String(nickname))
  const resolvedPath = path.resolve(userPath)

  fs.mkdirSync(resolvedPath, { recursive: true })

  return resolvedPath
}

export function renameUserFolder(oldPath: string, newNickname: string): string {
  const parentDir = path.dirname(oldPath)
  const newPath = path.join(parentDir, newNickname)

  fs.renameSync(oldPath, newPath)

  return path.resolve(newPath)
}

export interface LocalUserData {
  nickname?: string
}

export function createOrRenameUserFolder(
  options: CreateUserFolderOptions,
  localUserData: LocalUserData,
  currentNickname: string
): string {
  let userPath = createUserFolder(options, currentNickname)

  if (localUserData && localUserData.nickname !== currentNickname) {
    userPath = renameUserFolder(userPath, currentNickname)
  }

  return userPath
}

export interface LrcItem {
  text: string
  timeId: string | number
}

export function json2Lrc(data: LrcItem[]): string {
  const lrcLines: string[] = []

  for (const item of data) {
    const text = item.text
    const timeSeconds = parseFloat(String(item.timeId))
    const minutes = Math.floor(timeSeconds / 60)
    const seconds = Math.floor(timeSeconds % 60)
    const milliseconds = Math.floor((timeSeconds % 1) * 1000)
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
    lrcLines.push(`[${timeStr}] ${text}`)
  }

  return lrcLines.join('\n')
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function getDownloadPath(basePath: string, filename: string): string {
  ensureDir(basePath)
  return path.join(basePath, filename)
}

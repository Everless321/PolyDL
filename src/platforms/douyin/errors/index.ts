export class DouyinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DouyinError'
  }
}

export class APIConnectionError extends DouyinError {
  constructor(message: string) {
    super(message)
    this.name = 'APIConnectionError'
  }
}

export class APIResponseError extends DouyinError {
  constructor(message: string) {
    super(message)
    this.name = 'APIResponseError'
  }
}

export class APIUnauthorizedError extends DouyinError {
  constructor(message: string) {
    super(message)
    this.name = 'APIUnauthorizedError'
  }
}

export class APINotFoundError extends DouyinError {
  constructor(message: string) {
    super(message)
    this.name = 'APINotFoundError'
  }
}

export class APITimeoutError extends DouyinError {
  constructor(message: string) {
    super(message)
    this.name = 'APITimeoutError'
  }
}

export class InvalidConfigError extends DouyinError {
  constructor(key: string, value: unknown) {
    super(`Invalid config: ${key} = ${value}`)
    this.name = 'InvalidConfigError'
  }
}

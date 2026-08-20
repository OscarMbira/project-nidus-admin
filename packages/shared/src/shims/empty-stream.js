/**
 * Minimal browser stub for Node's `stream` built-in.
 * Vite externalizes `stream` in the client; xlsx-js-style only needs a Readable
 * symbol at module init — browser writeFile does not use real Node streams.
 */
export class Readable {
  constructor() {
    this.readable = true
  }

  pipe() {
    return this
  }

  on() {
    return this
  }

  once() {
    return this
  }

  emit() {
    return false
  }
}

export class Writable {
  write() {
    return true
  }

  end() {
    return this
  }

  on() {
    return this
  }
}

export class PassThrough extends Readable {}

export default {
  Readable,
  Writable,
  PassThrough,
}

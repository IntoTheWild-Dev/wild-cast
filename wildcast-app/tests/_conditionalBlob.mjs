import { createHash } from 'node:crypto'
export function conditionalBlob() {
  const store = new Map()
  const faults = {}
  const etag = path => createHash('sha256').update(store.get(path)).digest('hex')
  const writes = []
  const namedExports = {
    list: async ({ prefix }) => ({ blobs: [...store.keys()].filter(p => p.startsWith(prefix)).map(pathname => ({ pathname, url: `mem://${pathname}` })) }),
    get: async path => {
      if (faults.read) throw faults.read
      return store.has(path) ? { stream: new Response(store.get(path)).body, blob: { etag: etag(path) } } : null
    },
    put: async (path, body, options = {}) => {
      if (faults.write) throw faults.write
      if ((!options.allowOverwrite && store.has(path)) || (options.ifMatch && (!store.has(path) || etag(path) !== options.ifMatch))) {
        throw Object.assign(new Error('Precondition failed: ETag mismatch or blob already exists'), { name: 'BlobPreconditionFailedError' })
      }
      writes.push({ path, options })
      store.set(path, body)
      return { url: `mem://${path}`, etag: etag(path) }
    },
  }
  return { store, writes, faults, namedExports }
}

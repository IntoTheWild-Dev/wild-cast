// Shared in-memory stand-in for Vercel Blob, for the Figma-plugin endpoint tests.
// URLs look like real private-blob URLs so the endpoints' URL checks run for real.
export const HOST = 'https://teststore.private.blob.vercel-storage.com'
export const urlOf = path => `${HOST}/${path}`

export function makeBlobMock() {
  const store = new Map()
  const namedExports = {
    list: async ({ prefix }) => ({
      blobs: [...store.keys()].filter(k => k.startsWith(prefix)).map(k => ({ pathname: k, url: urlOf(k) })),
    }),
    put: async (path, body) => { store.set(path, body); return { pathname: path, url: urlOf(path) } },
  }
  const fetchMock = async url => {
    const key = decodeURIComponent(String(url).replace(HOST + '/', '').split('?')[0])
    return store.has(key)
      ? { ok: true, status: 200, json: async () => JSON.parse(store.get(key)) }
      : { ok: false, status: 404 }
  }
  return { store, namedExports, fetchMock }
}

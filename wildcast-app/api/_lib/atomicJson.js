import { get, put } from '@vercel/blob'

const isConflict = error => error?.name === 'BlobPreconditionFailedError' ||
  /already exists|precondition failed|etag mismatch/i.test(error?.message || '')

// Cross-instance compare-and-swap. Re-read and recompute only on a storage
// conflict; network failures are not retried as if the write never happened.
export async function updateJson(path, update, { token, attempts = 12 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const stored = await get(path, { access: 'private', useCache: false, token })
    const previous = stored ? await new Response(stored.stream).json() : null
    const etag = stored?.blob?.etag ?? stored?.headers?.get?.('etag')
    if (stored && !etag) throw new Error('Storage did not provide a version for a conditional write.')
    const value = update(previous)
    if (value === undefined) return { value: previous, previous, blob: null }
    try {
      const blob = await put(path, JSON.stringify(value), {
        access: 'private', addRandomSuffix: false, contentType: 'application/json', token,
        allowOverwrite: Boolean(stored), ...(stored ? { ifMatch: etag } : {}),
      })
      return { value, previous, blob }
    } catch (error) {
      if (!isConflict(error)) throw error
    }
  }
  const error = new Error('This item is being updated. Please retry.')
  error.status = 409
  throw error
}

export const readJson = async (path, token) => {
  const stored = await get(path, { access: 'private', useCache: false, token })
  return stored ? new Response(stored.stream).json() : null
}

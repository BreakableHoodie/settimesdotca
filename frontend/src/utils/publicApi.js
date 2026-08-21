export async function parsePublicApiResponse(response, fallbackMessage = 'API request failed') {
  const contentType = response.headers.get('content-type') || ''
  let data = null

  if (contentType.includes('application/json')) {
    try {
      data = await response.json()
    } catch (_error) {
      const error = new Error('Server returned invalid response. Please try again.')
      error.status = response.status
      error.isServerError = true
      throw error
    }
  }

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || fallbackMessage)
    error.status = response.status
    error.details = data
    throw error
  }

  if (data === null) {
    const error = new Error('Server returned an unexpected response. Please try again.')
    error.status = response.status
    error.isServerError = true
    throw error
  }

  return data
}

const RETRY_DELAY_MS = 600
const MAX_ATTEMPTS = 2

function isRetryableRequest(options) {
  const method = (options.method || 'GET').toUpperCase()
  return method === 'GET'
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Retries a single time on transient failures (network error or 5xx) for GET
// reads only — never for mutating requests, where a retry could double the
// side effect. This exists to ride out brief upstream blips (e.g. a
// transient D1 5xx) without blanking the page on one bad response.
export async function fetchPublicJson(url, options = {}, fallbackMessage = 'API request failed') {
  const canRetry = isRetryableRequest(options)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isFinalAttempt = attempt === MAX_ATTEMPTS
    let response

    try {
      response = await fetch(url, options)
    } catch (networkError) {
      // An abort is a deliberate cancellation, not a transient failure. Retrying
      // one means a component that unmounted mid-flight waits RETRY_DELAY_MS and
      // fires a second request that can only fail again — measured at 2 calls and
      // ~600ms before this guard. Checked by name AND by the signal, because a
      // signal aborted between attempts produces a plain rejection on some
      // runtimes rather than a named AbortError.
      if (networkError?.name === 'AbortError' || options.signal?.aborted) {
        throw networkError
      }
      if (canRetry && !isFinalAttempt) {
        await delay(RETRY_DELAY_MS)
        continue
      }
      throw networkError
    }

    if (canRetry && !isFinalAttempt && response.status >= 500) {
      await delay(RETRY_DELAY_MS)
      continue
    }

    return parsePublicApiResponse(response, fallbackMessage)
  }

  return undefined
}

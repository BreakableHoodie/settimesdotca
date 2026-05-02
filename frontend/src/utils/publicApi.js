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

export async function fetchPublicJson(url, options = {}, fallbackMessage = 'API request failed') {
  const response = await fetch(url, options)
  return parsePublicApiResponse(response, fallbackMessage)
}
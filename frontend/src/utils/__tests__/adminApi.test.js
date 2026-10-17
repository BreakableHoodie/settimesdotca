import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('authApi.verifySession', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear()
    document.cookie = 'csrf_token=test-csrf-token; path=/'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('returns unauthorized without notifying auth subscribers on 401', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ error: 'Unauthorized', message: 'Valid session required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { authApi, subscribeAdminAuthState } = await import('../adminApi.js')
    const onUnauthorized = vi.fn()
    const unsubscribe = subscribeAdminAuthState({ onUnauthorized })

    const result = await authApi.verifySession()

    expect(result).toEqual({ status: 'unauthorized' })
    expect(onUnauthorized).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('returns a transient failure result and preserves persisted user data on server errors', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response('<!DOCTYPE html><html>cloudflare</html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' },
      })
    )

    window.localStorage.setItem('userEmail', 'admin@test')
    window.localStorage.setItem('userName', 'Admin User')

    const { authApi } = await import('../adminApi.js')
    const result = await authApi.verifySession()

    expect(result.status).toBe('transient')
    expect(result.error).toBeInstanceOf(Error)
    expect(window.localStorage.getItem('userEmail')).toBe('admin@test')
  })
})

describe('eventsApi.setPublishState', () => {
  beforeEach(() => {
    vi.resetModules()
    document.cookie = 'csrf_token=test-csrf-token; path=/'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('omits allowEmptyLineup from the request body when not passed', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true, event: { id: 1, status: 'published' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { eventsApi } = await import('../adminApi.js')
    await eventsApi.setPublishState(1, true)

    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ publish: true })
  })

  it('omits allowEmptyLineup from the request body when explicitly false', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true, event: { id: 1, status: 'draft' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { eventsApi } = await import('../adminApi.js')
    await eventsApi.setPublishState(1, false, { allowEmptyLineup: false })

    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ publish: false })
  })

  it('includes allowEmptyLineup: true in the request body when passed', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true, event: { id: 1, status: 'published' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { eventsApi } = await import('../adminApi.js')
    await eventsApi.setPublishState(1, true, { allowEmptyLineup: true })

    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ publish: true, allowEmptyLineup: true })
  })

  // A truthy non-boolean must not reach the wire as `true`. The server rejects
  // non-booleans, but it never sees this one: coercing here would hand it a
  // literal `true` and open the empty-lineup guard on input written to be
  // refused. Throwing before the request keeps the client from laundering an
  // invalid value into a valid one.
  it.each([['yes'], [1], [{}], [[]]])('rejects a truthy non-boolean allowEmptyLineup (%p)', async value => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { eventsApi } = await import('../adminApi.js')
    await expect(eventsApi.setPublishState(1, true, { allowEmptyLineup: value })).rejects.toThrow(TypeError)

    // The assertion that matters: no request was ever made, so the server had
    // no chance to be handed a laundered `true`.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// Admins and editors must enrol in 2FA (#1253). The server answers every other
// admin route with 403 MFA_SETUP_REQUIRED, and this signal is what raises the
// forced enrolment screen; without it the admin sees a stream of failed loads.
describe('2FA enrolment required', () => {
  const forbidden = code =>
    new globalThis.Response(JSON.stringify({ error: 'Two-factor authentication required', code }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })

  beforeEach(() => {
    vi.resetModules()
    document.cookie = 'csrf_token=test-csrf-token; path=/'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('notifies every subscriber on 403 MFA_SETUP_REQUIRED, even after one throws', async () => {
    global.fetch.mockResolvedValue(forbidden('MFA_SETUP_REQUIRED'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { usersApi, subscribeAdminAuthState } = await import('../adminApi.js')
    const throwing = subscribeAdminAuthState({
      onMfaSetupRequired: () => {
        throw new Error('subscriber bug')
      },
    })
    const onMfaSetupRequired = vi.fn()
    const unsubscribe = subscribeAdminAuthState({ onMfaSetupRequired })

    await expect(usersApi.getAll()).rejects.toThrow()

    expect(onMfaSetupRequired).toHaveBeenCalledTimes(1)
    throwing()
    unsubscribe()
  })

  it('does not raise enrolment for an ordinary 403', async () => {
    global.fetch.mockResolvedValue(forbidden('INSUFFICIENT_PERMISSIONS'))
    const { usersApi, subscribeAdminAuthState } = await import('../adminApi.js')
    const onMfaSetupRequired = vi.fn()
    const unsubscribe = subscribeAdminAuthState({ onMfaSetupRequired })

    await expect(usersApi.getAll()).rejects.toThrow()

    expect(onMfaSetupRequired).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('resetMfa posts to the user-scoped reset route', async () => {
    global.fetch.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { usersApi } = await import('../adminApi.js')

    await expect(usersApi.resetMfa(7)).resolves.toEqual({ success: true })

    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/admin/users/7/reset-mfa')
    expect(init.method).toBe('POST')
  })
})

// Step-up re-authentication (#1324). Identity routes answer 403 STEP_UP_REQUIRED;
// the registered prompter decides whether the request is retried (once).
describe('step-up re-authentication', () => {
  const json = (status, body) =>
    new globalThis.Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const stepUpRequired = () => json(403, { error: 'Forbidden', code: 'STEP_UP_REQUIRED', message: 'Confirm with 2FA.' })

  beforeEach(() => {
    vi.resetModules()
    document.cookie = 'csrf_token=test-csrf-token; path=/'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('retries a PATCH once with the same method and body and a CSRF header after a successful step-up', async () => {
    global.fetch.mockResolvedValueOnce(stepUpRequired()).mockResolvedValueOnce(json(200, { id: 7 }))
    const { usersApi, registerStepUpPrompter } = await import('../adminApi.js')
    const prompter = vi.fn().mockResolvedValue(true)
    registerStepUpPrompter(prompter)

    await expect(usersApi.update(7, { role: 'admin' })).resolves.toEqual({ id: 7 })

    expect(prompter).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [firstUrl, first] = global.fetch.mock.calls[0]
    const [secondUrl, second] = global.fetch.mock.calls[1]
    expect(secondUrl).toBe(firstUrl)
    expect(secondUrl).toBe('/api/admin/users/7')
    expect(second.method).toBe('PATCH')
    expect(second.body).toBe(first.body)
    expect(JSON.parse(second.body)).toEqual({ role: 'admin' })
    expect(second.headers['X-CSRF-Token']).toBe('test-csrf-token')
  })

  it('does not retry a second time if the retry is refused again', async () => {
    global.fetch.mockResolvedValue(stepUpRequired())
    const { usersApi, registerStepUpPrompter } = await import('../adminApi.js')
    const prompter = vi.fn().mockResolvedValue(true)
    registerStepUpPrompter(prompter)

    await expect(usersApi.resetMfa(7)).rejects.toMatchObject({ status: 403 })

    expect(prompter).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('throws STEP_UP_CANCELLED without retrying when the user cancels', async () => {
    global.fetch.mockResolvedValue(stepUpRequired())
    const { usersApi, registerStepUpPrompter } = await import('../adminApi.js')
    registerStepUpPrompter(vi.fn().mockResolvedValue(false))

    await expect(usersApi.resetMfa(7)).rejects.toMatchObject({
      status: 403,
      code: 'STEP_UP_CANCELLED',
      message: 'Cancelled \u2014 nothing was changed.',
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('rethrows when no prompter is registered, as before', async () => {
    global.fetch.mockResolvedValue(stepUpRequired())
    const { usersApi } = await import('../adminApi.js')

    await expect(usersApi.resetMfa(7)).rejects.toMatchObject({ status: 403 })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('treats a throwing prompter as a cancel', async () => {
    global.fetch.mockResolvedValue(stepUpRequired())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { usersApi, registerStepUpPrompter } = await import('../adminApi.js')
    registerStepUpPrompter(() => {
      throw new Error('modal bug')
    })

    await expect(usersApi.resetMfa(7)).rejects.toMatchObject({ status: 403 })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('shares one prompt between concurrent 403s and retries both', async () => {
    let call = 0
    global.fetch.mockImplementation(async () => {
      call += 1
      return call <= 2 ? stepUpRequired() : json(200, { success: true })
    })
    const { usersApi, registerStepUpPrompter } = await import('../adminApi.js')
    let release
    const prompter = vi.fn(
      () =>
        new Promise(resolve => {
          release = resolve
        })
    )
    registerStepUpPrompter(prompter)

    const first = usersApi.resetMfa(7)
    const second = usersApi.resetMfa(8)
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(prompter).toHaveBeenCalledTimes(1))
    release(true)

    await expect(Promise.all([first, second])).resolves.toEqual([{ success: true }, { success: true }])
    expect(prompter).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(4)
  })

  it('an ordinary 403 never raises the prompt', async () => {
    global.fetch.mockResolvedValue(json(403, { error: 'Forbidden', message: 'Insufficient permissions' }))
    const { usersApi, registerStepUpPrompter } = await import('../adminApi.js')
    const prompter = vi.fn().mockResolvedValue(true)
    registerStepUpPrompter(prompter)

    await expect(usersApi.resetMfa(7)).rejects.toMatchObject({ status: 403 })
    expect(prompter).not.toHaveBeenCalled()
  })

  it('mfaApi.stepUp posts the code to the step-up route', async () => {
    global.fetch.mockResolvedValue(json(200, { success: true }))
    const { mfaApi } = await import('../adminApi.js')

    await mfaApi.stepUp('123456')

    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/admin/mfa/step-up')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ code: '123456' })
  })

  // A wrong code is a 400, never a 401: handleResponse signs the user out on
  // every 401. These go through the REAL response path, unlike the modal test
  // that mocks mfaApi.stepUp with a rejection (#1324).
  it.each([
    ['stepUp', api => api.mfaApi.stepUp('000000')],
    ['disable', api => api.mfaApi.disable('000000')],
    ['regenerateBackupCodes', api => api.mfaApi.regenerateBackupCodes('000000')],
    ['enable', api => api.mfaApi.enable('000000')],
  ])('mfaApi.%s: a 400 INVALID_MFA_CODE rejects with the message and never signs the user out', async (_name, call) => {
    global.fetch.mockResolvedValue(
      json(400, { error: 'Authentication failed', code: 'INVALID_MFA_CODE', message: 'Invalid authentication code' })
    )
    const api = await import('../adminApi.js')
    const onUnauthorized = vi.fn()
    const unsubscribe = api.subscribeAdminAuthState({ onUnauthorized })

    await expect(call(api)).rejects.toMatchObject({ status: 400, message: 'Invalid authentication code' })

    expect(onUnauthorized).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('a 401 (no valid session) still signs the user out, so the 400 above is the only thing keeping a typo from doing so', async () => {
    global.fetch.mockResolvedValue(json(401, { error: 'Unauthorized', message: 'Valid session required' }))
    const api = await import('../adminApi.js')
    const onUnauthorized = vi.fn()
    const unsubscribe = api.subscribeAdminAuthState({ onUnauthorized })

    await expect(api.mfaApi.stepUp('000000')).rejects.toMatchObject({ status: 401 })

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

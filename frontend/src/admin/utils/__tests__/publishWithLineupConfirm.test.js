import { describe, expect, it, vi } from 'vitest'
import { publishWithLineupConfirm } from '../publishWithLineupConfirm'

/**
 * #821. The helper exists so the Events-list toggle and the edit form's save
 * path prompt identically for a draft -> published transition. Before it, the
 * toggle asked and the form did not (PATCH writes `status` with no lineup
 * check), so the same transition behaved differently depending on which control
 * the user reached for.
 */

const emptyLineupError = () => {
  const err = new Error('Cannot publish event with no bands. Add at least one band first.')
  err.details = { error: 'Validation error', code: 'EMPTY_LINEUP' }
  return err
}

const makeApi = behaviour => ({
  setPublishState: vi.fn(behaviour),
})

describe('publishWithLineupConfirm — #821', () => {
  it('publishes without prompting when the event has a lineup', async () => {
    const eventsApi = makeApi(async () => ({ ok: true }))
    const confirm = vi.fn(() => true)

    const result = await publishWithLineupConfirm(eventsApi, { id: 7, name: 'Vol. 18' }, { confirm })

    expect(result).toEqual({ published: true })
    expect(confirm).not.toHaveBeenCalled()
    // Exactly one call, and crucially WITHOUT the override -- passing
    // allowEmptyLineup on the happy path would defeat the guard entirely.
    expect(eventsApi.setPublishState).toHaveBeenCalledTimes(1)
    expect(eventsApi.setPublishState).toHaveBeenCalledWith(7, true)
  })

  it('prompts on EMPTY_LINEUP and retries with the override when confirmed', async () => {
    const eventsApi = makeApi(async (_id, _publish, opts) => {
      if (!opts?.allowEmptyLineup) throw emptyLineupError()
      return { ok: true }
    })
    const confirm = vi.fn(() => true)

    const result = await publishWithLineupConfirm(eventsApi, { id: 7, name: 'Vol. 18' }, { confirm })

    expect(result).toEqual({ published: true, emptyLineup: true })
    expect(confirm).toHaveBeenCalledTimes(1)
    // The prompt must name the event -- a generic "are you sure?" is what makes
    // people click through without reading.
    expect(confirm.mock.calls[0][0]).toContain('Vol. 18')
    expect(eventsApi.setPublishState).toHaveBeenLastCalledWith(7, true, { allowEmptyLineup: true })
  })

  it('does NOT publish when the user declines, and reports cancelled rather than throwing', async () => {
    const eventsApi = makeApi(async (_id, _publish, opts) => {
      if (!opts?.allowEmptyLineup) throw emptyLineupError()
      return { ok: true }
    })
    const confirm = vi.fn(() => false)

    const result = await publishWithLineupConfirm(eventsApi, { id: 7, name: 'Vol. 18' }, { confirm })

    expect(result).toEqual({ published: false, cancelled: true })
    // The assertion that matters: the override retry never happened.
    expect(eventsApi.setPublishState).toHaveBeenCalledTimes(1)
    expect(eventsApi.setPublishState).not.toHaveBeenCalledWith(7, true, { allowEmptyLineup: true })
  })

  it('rethrows any other failure instead of prompting', async () => {
    const boom = new Error('Network down')
    const eventsApi = makeApi(async () => {
      throw boom
    })
    const confirm = vi.fn(() => true)

    await expect(publishWithLineupConfirm(eventsApi, { id: 7, name: 'Vol. 18' }, { confirm })).rejects.toThrow(
      'Network down'
    )
    expect(confirm).not.toHaveBeenCalled()
  })

  it('detects the rejection by code, not by message text', async () => {
    // Same EMPTY_LINEUP code, completely different copy. Matching on
    // err.message would break the moment the server reworded its response.
    const eventsApi = makeApi(async (_id, _publish, opts) => {
      if (!opts?.allowEmptyLineup) {
        const err = new Error('totally different wording')
        err.details = { code: 'EMPTY_LINEUP' }
        throw err
      }
      return { ok: true }
    })
    const confirm = vi.fn(() => true)

    const result = await publishWithLineupConfirm(eventsApi, { id: 7, name: 'Vol. 18' }, { confirm })

    expect(result).toEqual({ published: true, emptyLineup: true })
  })
})

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import useRetryFocus from '../useRetryFocus'
import RetryRegion from '../../components/RetryRegion'

// #1420: Retry removes the focused button, so focus fell to <body> and nothing
// announced the load or its result. The harness is a minimal "list that can
// fail": `outcomes` is consumed one per load, true = succeeds.
function Harness({ outcomes }) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const retry = useRetryFocus({ what: 'venues', error })
  const load = async () => {
    setBusy(true)
    const ok = outcomes.shift()
    await Promise.resolve()
    setError(!ok)
    setLoaded(ok)
    setBusy(false)
  }
  return (
    <RetryRegion retry={retry} label="Venues">
      <button type="button" onClick={() => load()}>
        First load
      </button>
      {busy ? (
        <p>Spinner</p>
      ) : error ? (
        <button type="button" onClick={() => retry.startRetry(load)}>
          Retry
        </button>
      ) : loaded ? (
        <p>List</p>
      ) : null}
    </RetryRegion>
  )
}

const region = () => screen.getByRole('group', { name: 'Venues' })
const status = () => within(region()).getByRole('status')

describe('useRetryFocus', () => {
  it('does not move focus or announce on a first load', async () => {
    render(<Harness outcomes={[true]} />)
    const first = screen.getByRole('button', { name: 'First load' })
    first.focus()
    fireEvent.click(first)
    expect(await screen.findByText('List')).toBeInTheDocument()
    expect(document.activeElement).toBe(first)
    expect(status()).toHaveTextContent('')
  })

  it('keeps the status region mounted and empty before any retry', () => {
    render(<Harness outcomes={[]} />)
    expect(status()).toBeEmptyDOMElement()
  })

  it('announces loading, then "loaded", and focuses the region after a retry that succeeds', async () => {
    render(<Harness outcomes={[false, true]} />)
    fireEvent.click(screen.getByRole('button', { name: 'First load' }))
    const retryButton = await screen.findByRole('button', { name: 'Retry' })
    retryButton.focus()
    expect(document.activeElement).toBe(retryButton)

    fireEvent.click(retryButton)
    expect(status()).toHaveTextContent('Loading venues…')
    // Focus is in the region while the load is still pending, not on <body>.
    expect(screen.getByText('Spinner')).toBeInTheDocument()
    expect(document.activeElement).toBe(region())

    await screen.findByText('List')
    await waitFor(() => expect(status()).toHaveTextContent('Venues loaded.'))
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(region())
  })

  it('announces the failure and keeps focus in the region when the retry fails again', async () => {
    render(<Harness outcomes={[false, false]} />)
    fireEvent.click(screen.getByRole('button', { name: 'First load' }))
    const retryButton = await screen.findByRole('button', { name: 'Retry' })
    retryButton.focus()
    fireEvent.click(retryButton)

    await waitFor(() => expect(status()).toHaveTextContent("Couldn't load venues."))
    expect(document.activeElement).toBe(region())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('treats a loader that throws as a failed load', async () => {
    function Throwing() {
      const retry = useRetryFocus({ what: 'venues', error: false })
      return (
        <RetryRegion retry={retry} label="Venues">
          <button
            type="button"
            onClick={() =>
              retry.startRetry(async () => {
                throw new Error('boom')
              })
            }
          >
            Retry
          </button>
        </RetryRegion>
      )
    }
    render(<Throwing />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })
    expect(status()).toHaveTextContent("Couldn't load venues.")
    expect(document.activeElement).toBe(region())
  })
  it('ignores a second Retry while one is still running', async () => {
    let calls = 0
    let finish
    function Pending() {
      const retry = useRetryFocus({ what: 'venues', error: false })
      const load = () => {
        calls += 1
        return new Promise(resolve => {
          finish = resolve
        })
      }
      return (
        <RetryRegion retry={retry} label="Venues">
          <button type="button" onClick={() => retry.startRetry(load)}>
            Retry
          </button>
        </RetryRegion>
      )
    }
    render(<Pending />)
    const button = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(calls).toBe(1)
    await act(async () => finish())
    await waitFor(() => expect(status()).toHaveTextContent('Venues loaded.'))
    fireEvent.click(button)
    expect(calls).toBe(2)
  })

  it('clears "retried" after a success, so a later failure is announced as an alert again', async () => {
    function Flag({ outcomes }) {
      const [error, setError] = useState(true)
      const retry = useRetryFocus({ what: 'venues', error })
      const load = async () => {
        await Promise.resolve()
        setError(!outcomes.shift())
      }
      return (
        <RetryRegion retry={retry} label="Venues">
          <p data-testid="retried">{String(retry.retried)}</p>
          <button type="button" onClick={() => retry.startRetry(load)}>
            Retry
          </button>
        </RetryRegion>
      )
    }
    render(<Flag outcomes={[false, true]} />)
    const button = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(button)
    await waitFor(() => expect(status()).toHaveTextContent("Couldn't load venues."))
    expect(screen.getByTestId('retried')).toHaveTextContent('true')
    fireEvent.click(button)
    await waitFor(() => expect(status()).toHaveTextContent('Venues loaded.'))
    expect(screen.getByTestId('retried')).toHaveTextContent('false')
  })
})

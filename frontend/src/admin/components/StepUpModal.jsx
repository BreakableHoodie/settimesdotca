import { useCallback, useEffect, useRef, useState } from 'react'
import { mfaApi, registerStepUpPrompter } from '../../utils/adminApi'
import { Modal, Button, Alert } from '../../components/ui'

// Step-up re-authentication prompt (#1324). Identity-changing admin routes
// answer 403 STEP_UP_REQUIRED until the user re-proves their second factor;
// adminApi then asks this modal and retries the original request once if it
// resolves true. Mount it once, inside the admin panel.
export default function StepUpModal() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const settleRef = useRef(null)

  const settle = useCallback(result => {
    const resolve = settleRef.current
    settleRef.current = null
    setOpen(false)
    setCode('')
    setError(null)
    setSubmitting(false)
    resolve?.(result)
  }, [])

  useEffect(() => {
    const unregister = registerStepUpPrompter(
      () =>
        new Promise(resolve => {
          settleRef.current = resolve
          setOpen(true)
        })
    )
    return () => {
      unregister()
      // Never leave a request waiting on a prompt that no longer exists.
      const resolve = settleRef.current
      settleRef.current = null
      resolve?.(false)
    }
  }, [])

  const handleSubmit = async event => {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await mfaApi.stepUp(trimmed)
      settle(true)
    } catch (err) {
      setError(err.message || 'Could not confirm your code. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => settle(false)}
      title="Confirm it's you"
      size="sm"
      showCloseButton={false}
      closeOnBackdropClick={false}
    >
      <form onSubmit={handleSubmit} aria-label="Confirm with your 2FA code">
        <p className="text-text-secondary mb-4">
          This change needs a fresh check. Enter the 6-digit code from your authenticator app, or one of your backup
          codes.
        </p>
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}
        <label htmlFor="step-up-code" className="block text-sm text-text-secondary mb-1">
          Authentication code
        </label>
        <input
          id="step-up-code"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          value={code}
          onChange={e => setCode(e.target.value)}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-hidden focus:ring-2 focus:ring-accent-500/20 transition-all mb-4"
          placeholder="123456"
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => settle(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={submitting || !code.trim()}>
            Confirm
          </Button>
        </div>
      </form>
    </Modal>
  )
}

import { useState, useEffect } from 'react'
import { authApi } from '../utils/adminApi'

export default function AdminLogin({ onLoginSuccess }) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [step, setStep] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lockoutInfo, setLockoutInfo] = useState(null)
  const [idleMessage, setIdleMessage] = useState(null)
  const [mfaToken, setMfaToken] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaUser, setMfaUser] = useState(null)
  const [activationInfo, setActivationInfo] = useState(null)
  const [resendStatus, setResendStatus] = useState({ loading: false, message: '' })

  useEffect(() => {
    const idleLogout = window.sessionStorage.getItem('idleLogout')
    if (idleLogout) {
      window.sessionStorage.removeItem('idleLogout')
      setIdleMessage('You were signed out due to inactivity. Please sign in again.')
    }
  }, [])

  const handleChange = e => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const handleError = err => {
    const details = err?.details || {}
    if (details.requiresActivation) {
      setActivationInfo({
        message: details.message || err.message || 'Please activate your account before logging in.',
      })
      setResendStatus({ loading: false, message: '' })
      setError(null)
      return
    }
    if (details.locked) {
      setLockoutInfo({
        locked: true,
        minutesRemaining: details.minutesRemaining,
      })
      setError(null)
      return
    }
    setError(details.message || err.message)
  }

  const handleLogin = async e => {
    e.preventDefault()
    setError(null)
    setLockoutInfo(null)
    setActivationInfo(null)
    setLoading(true)

    try {
      const result = await authApi.login(formData.email, formData.password)

      if (result.mfaRequired) {
        setStep('mfa')
        setMfaToken(result.mfaToken)
        setMfaUser(result.user || null)
        setMfaCode('')
        return
      }

      if (result.success) {
        onLoginSuccess()
      }
    } catch (err) {
      handleError(err)
    } finally {
      setLoading(false)
    }
  }

  const handleMfaVerify = async e => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await authApi.verifyMfa(mfaToken, mfaCode)
      if (result.success) {
        onLoginSuccess()
      }
    } catch (err) {
      handleError(err)
    } finally {
      setLoading(false)
    }
  }

  const resetMfa = () => {
    setStep('login')
    setMfaToken(null)
    setMfaUser(null)
    setMfaCode('')
    setError(null)
  }

  const handleResend = async () => {
    setResendStatus({ loading: true, message: '' })
    try {
      const response = await authApi.resendActivation(formData.email)
      setResendStatus({
        loading: false,
        message: response.message || 'Activation email sent.',
      })
    } catch (err) {
      setResendStatus({
        loading: false,
        message: err.message || 'Failed to resend activation email.',
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-dark flex items-center justify-center p-4">
      <div className="bg-gradient-card backdrop-blur-sm p-8 rounded-xl shadow-xl max-w-md w-full border border-white/10">
        <h1 className="text-2xl font-bold font-display mb-6 text-center">
          <span className="text-accent-500">Set</span>
          <span className="text-white">Times</span>
          <span className="block text-text-tertiary text-base font-normal mt-1">Admin Login</span>
        </h1>

        {step === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label htmlFor="email" className="block text-white mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all"
                required
                disabled={loading}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="block text-white mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all"
                required
                disabled={loading}
              />
            </div>

            {idleMessage && (
              <div className="bg-blue-900/50 border border-blue-600 text-blue-200 p-3 rounded mb-4">{idleMessage}</div>
            )}

            {activationInfo && (
              <div className="bg-blue-900/50 border border-blue-600 text-blue-200 p-3 rounded mb-4">
                <p className="font-semibold mb-1">Activate your account</p>
                <p className="text-sm">{activationInfo.message}</p>
                {resendStatus.message && <p className="text-sm mt-2">{resendStatus.message}</p>}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendStatus.loading || !formData.email}
                  className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {resendStatus.loading ? 'Sending...' : 'Resend activation email'}
                </button>
              </div>
            )}

            {error && <div className="bg-red-900/50 border border-red-600 text-red-200 p-3 rounded mb-4">{error}</div>}

            {lockoutInfo && lockoutInfo.locked && (
              <div className="bg-yellow-900/50 border border-yellow-600 text-yellow-200 p-3 rounded mb-4">
                <p className="font-bold mb-1">Account Locked</p>
                <p className="text-sm">
                  Too many failed login attempts. Please try again in {lockoutInfo.minutesRemaining} minutes.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (lockoutInfo && lockoutInfo.locked)}
              className="w-full bg-gradient-accent text-white py-3 rounded-lg font-semibold hover:brightness-110 disabled:opacity-50 mb-4 transition-all active:scale-[0.98] shadow-md"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaVerify}>
            <div className="mb-4">
              <p className="text-text-tertiary text-sm mb-2">
                Enter the 6-digit code from your authenticator app or a backup code.
              </p>
              {mfaUser?.email && <p className="text-text-secondary text-sm mb-4">Signing in as {mfaUser.email}</p>}
              <label htmlFor="mfa-code" className="block text-white mb-2">
                Authentication Code
              </label>
              <input
                id="mfa-code"
                name="mfa-code"
                type="text"
                inputMode="numeric"
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all"
                required
                disabled={loading}
                autoComplete="one-time-code"
              />
            </div>

            {error && <div className="bg-red-900/50 border border-red-600 text-red-200 p-3 rounded mb-4">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-accent text-white py-3 rounded-lg font-semibold hover:brightness-110 disabled:opacity-50 mb-3 transition-all active:scale-[0.98] shadow-md"
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              type="button"
              onClick={resetMfa}
              className="w-full text-text-tertiary hover:text-white py-2 text-sm transition-colors"
            >
              Back to login
            </button>
          </form>
        )}

        <p className="text-text-tertiary text-sm text-center">Need access? Contact an administrator.</p>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { authApi } from '../utils/adminApi'
import PasswordStrength from '../components/PasswordStrength'
import { FIELD_LIMITS, validatePasswordStrength } from '../utils/validation'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    inviteCode: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordMismatch, setPasswordMismatch] = useState('')
  const [activationInfo, setActivationInfo] = useState(null)
  const [resendStatus, setResendStatus] = useState({ loading: false, message: '' })

  useEffect(() => {
    const inviteCode = searchParams.get('code') || ''
    const email = searchParams.get('email') || ''
    const name = searchParams.get('name') || ''
    const first = searchParams.get('first') || ''
    const last = searchParams.get('last') || ''
    if (inviteCode || email || name || first || last) {
      const nameParts = name.trim().split(/\s+/).filter(Boolean)
      setFormData(prev => ({
        ...prev,
        inviteCode: inviteCode || prev.inviteCode,
        email: email || prev.email,
        firstName: first || prev.firstName || nameParts[0] || '',
        lastName: last || prev.lastName || nameParts.slice(1).join(' ') || '',
      }))
    }
  }, [searchParams])

  useEffect(() => {
    if (!formData.confirmPassword && !formData.password) {
      setPasswordMismatch('')
      return
    }
    if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
      setPasswordMismatch('Passwords do not match')
      return
    }
    setPasswordMismatch('')
  }, [formData.password, formData.confirmPassword])

  const handleChange = e => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')

    // Validation
    if (!formData.inviteCode) {
      setError('Missing invite code. Please use the link from your invite email.')
      return
    }

    if (passwordMismatch) {
      setError(passwordMismatch)
      return
    }

    const passwordError = validatePasswordStrength(formData.password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setLoading(true)

    try {
      const result = await authApi.signup(
        formData.email,
        formData.password,
        formData.firstName,
        formData.lastName,
        formData.inviteCode
      )
      if (result.requiresActivation) {
        setActivationInfo({
          message: result.message || 'Check your email to activate your account.',
          activationUrl: result.activationUrl || null,
        })
        setResendStatus({ loading: false, message: '' })
        return
      }
      // Redirect to admin panel on success
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResendStatus({ loading: true, message: '' })
    try {
      const response = await authApi.resendActivation(formData.email)
      setResendStatus({ loading: false, message: response.message || 'Activation email sent.' })
    } catch (err) {
      setResendStatus({
        loading: false,
        message: err.message || 'Failed to resend activation email.',
      })
    }
  }

  return (
    <div className="min-h-screen bg-bg-navy flex items-center justify-center p-4">
      <div className="bg-bg-purple rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
        <p className="text-gray-400 mb-6">Create your SetTimes account</p>

        {activationInfo ? (
          <div className="bg-white/10 border border-white/20 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
            <p className="text-gray-300 text-sm mb-4">{activationInfo.message}</p>
            {activationInfo.activationUrl && (
              <div className="mb-4 text-sm text-gray-300 break-all">
                Activation link:{' '}
                <a href={activationInfo.activationUrl} className="text-accent-400 hover:underline">
                  {activationInfo.activationUrl}
                </a>
              </div>
            )}
            {resendStatus.message && <div className="text-sm text-gray-300 mb-3">{resendStatus.message}</div>}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendStatus.loading}
              className="w-full min-h-[44px] px-4 py-3 bg-accent-500 text-white rounded hover:bg-accent-600 disabled:opacity-50 transition-colors font-semibold"
            >
              {resendStatus.loading ? 'Sending...' : 'Resend activation email'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/login')}
              className="w-full min-h-[44px] px-4 py-3 mt-3 border border-white/20 text-white rounded hover:border-white/40 transition-colors font-semibold"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-900/30 border border-red-600 rounded p-3 mb-4">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="signup-email" className="block text-white mb-2 text-sm">
                  Email *
                </label>
                <input
                  id="signup-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-none"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="signup-password" className="block text-white mb-2 text-sm">
                  Password *
                </label>
                <input
                  id="signup-password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  minLength={FIELD_LIMITS.password.min}
                  maxLength={FIELD_LIMITS.password.max}
                  className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-none"
                  placeholder={`${FIELD_LIMITS.password.min}+ characters with upper/lower/number/symbol`}
                  required
                />
                <PasswordStrength password={formData.password} />
              </div>

              <div>
                <label htmlFor="signup-confirm-password" className="block text-white mb-2 text-sm">
                  Confirm Password *
                </label>
                <input
                  id="signup-confirm-password"
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  minLength={FIELD_LIMITS.password.min}
                  maxLength={FIELD_LIMITS.password.max}
                  className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-none"
                  required
                />
                {passwordMismatch && <p className="mt-2 text-sm text-red-300">{passwordMismatch}</p>}
              </div>

              <div>
                <label htmlFor="signup-first-name" className="block text-white mb-2 text-sm">
                  First Name *
                </label>
                <input
                  id="signup-first-name"
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-none"
                  placeholder="First"
                  required
                />
              </div>

              <div>
                <label htmlFor="signup-last-name" className="block text-white mb-2 text-sm">
                  Last Name *
                </label>
                <input
                  id="signup-last-name"
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-none"
                  placeholder="Last"
                  required
                />
              </div>

              {!formData.inviteCode && (
                <div className="bg-red-900/30 border border-red-600 rounded p-3 text-red-200 text-sm">
                  Missing invite code. Please use the link from your invite email.
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !formData.inviteCode || Boolean(passwordMismatch)}
                className="w-full min-h-[44px] px-4 py-3 bg-accent-500 text-white rounded hover:bg-accent-600 disabled:opacity-50 transition-colors font-semibold"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          </>
        )}

        <p className="text-gray-400 text-sm mt-4 text-center">
          Already have an account?{' '}
          <a href="/admin/login" className="text-accent-400 hover:underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading') // loading, ready, submitting, success, error
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setStatus('error')
        setMessage('Invalid reset link. Please request a new password reset.')
      }, 0)
      return
    }

    // Verify reset token
    fetch(`/api/auth/reset-password?token=${token}`)
      .then(response => response.json())
      .then(data => {
        if (data.valid) {
          setUser(data.user)
          setStatus('ready')
        } else {
          setStatus('error')
          setMessage(data.error || 'Invalid or expired reset token')
        }
      })
      .catch(error => {
        setStatus('error')
        setMessage('Failed to verify reset token')
      })
  }, [token])

  const handleSubmit = async e => {
    e.preventDefault()

    if (formData.newPassword !== formData.confirmPassword) {
      setMessage('Passwords do not match')
      return
    }

    if (formData.newPassword.length < 8) {
      setMessage('Password must be at least 8 characters long')
      return
    }

    setStatus('submitting')

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          newPassword: formData.newPassword,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage('Password reset successfully! Redirecting to login...')
        setTimeout(() => {
          navigate('/admin/login')
        }, 3000)
      } else {
        setStatus('error')
        setMessage(data.error || 'Failed to reset password')
      }
    } catch (error) {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-band-navy to-band-purple flex items-center justify-center">
        <div className="text-white text-xl">Verifying reset token...</div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-band-navy to-band-purple flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Reset Failed</h1>
          <p className="text-gray-300 mb-6">{message}</p>
          <button
            onClick={() => navigate('/admin/login')}
            className="bg-band-orange hover:bg-band-orange/90 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-band-navy to-band-purple flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">✓ Password Reset</h1>
          <p className="text-gray-300 mb-6">{message}</p>
          <button
            onClick={() => navigate('/admin/login')}
            className="bg-band-orange hover:bg-band-orange/90 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-band-navy to-band-purple flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
          <p className="text-gray-300">
            Set a new password for <span className="font-medium">{user?.email}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="newPassword" className="block text-white font-medium mb-2">
              New Password
            </label>
            <input
              type="password"
              id="newPassword"
              required
              minLength={8}
              value={formData.newPassword}
              onChange={e => setFormData({ ...formData, newPassword: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-band-orange focus:outline-none placeholder-gray-400"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-white font-medium mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              required
              minLength={8}
              value={formData.confirmPassword}
              onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-band-orange focus:outline-none placeholder-gray-400"
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full bg-band-orange hover:bg-band-orange/90 text-white font-bold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'submitting' ? 'Resetting Password...' : 'Reset Password'}
          </button>

          {message && (
            <div
              className={`p-4 rounded-lg ${
                status === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-green-500/20 text-green-200'
              }`}
            >
              {message}
            </div>
          )}
        </form>

        <div className="mt-6 pt-6 border-t border-white/10">
          <p className="text-sm text-gray-400 text-center">Password must be at least 8 characters long</p>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function ActivatePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Invalid activation link. Please request a new one.')
      return
    }

    const activateAccount = async () => {
      try {
        const response = await fetch('/api/auth/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await response.json().catch(() => ({}))

        if (response.ok) {
          setStatus('success')
          setMessage(data.message || 'Account activated successfully! Redirecting to login...')
          setTimeout(() => navigate('/admin/login'), 3000)
          return
        }

        setStatus('error')
        setMessage(data.message || data.error || 'Failed to activate account.')
      } catch (_error) {
        setStatus('error')
        setMessage('Network error. Please try again.')
      }
    }

    activateAccount()
  }, [token, navigate])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bg-navy to-bg-purple flex items-center justify-center">
        <div className="text-white text-xl">Activating your account...</div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bg-navy to-bg-purple flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Activation Failed</h1>
          <p className="text-gray-300 mb-6">{message}</p>
          <button
            onClick={() => navigate('/admin/login')}
            className="bg-accent-500 hover:bg-accent-600 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-navy to-bg-purple flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Account Activated</h1>
        <p className="text-gray-300 mb-6">{message}</p>
        <button
          onClick={() => navigate('/admin/login')}
          className="bg-accent-500 hover:bg-accent-600 text-white font-bold py-3 px-6 rounded-lg transition"
        >
          Go to Login
        </button>
      </div>
    </div>
  )
}

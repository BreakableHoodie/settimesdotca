import { useState } from 'react'
import { authApi } from '../utils/adminApi'
import { useNavigate } from 'react-router-dom'

export default function AdminLogin({ onLoginSuccess }) {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lockoutInfo, setLockoutInfo] = useState(null)

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLockoutInfo(null)
    setLoading(true)

    try {
      const result = await authApi.login(formData.email, formData.password)

      if (result.success) {
        onLoginSuccess()
      }
    } catch (err) {
      // Parse error for lockout info
      try {
        const errorData = JSON.parse(err.message)
        if (errorData.locked) {
          setLockoutInfo({
            locked: true,
            minutesRemaining: errorData.minutesRemaining
          })
        } else if (errorData.remainingAttempts !== undefined) {
          setError(`${errorData.message}`)
        } else {
          setError(err.message)
        }
      } catch {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen bg-band-navy flex items-center justify-center p-4'>
      <div className='bg-band-purple p-8 rounded-lg shadow-xl max-w-md w-full'>
        <h1 className='text-2xl font-bold text-band-orange mb-6'>Admin Login</h1>

        <form onSubmit={handleLogin}>
          <div className='mb-4'>
            <label htmlFor='email' className='block text-white mb-2'>Email</label>
            <input
              id='email'
              name='email'
              type='email'
              value={formData.email}
              onChange={handleChange}
              className='w-full px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
              required
              disabled={loading}
            />
          </div>

          <div className='mb-4'>
            <label htmlFor='password' className='block text-white mb-2'>Password</label>
            <input
              id='password'
              name='password'
              type='password'
              value={formData.password}
              onChange={handleChange}
              className='w-full px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className='bg-red-900/50 border border-red-600 text-red-200 p-3 rounded mb-4'>
              {error}
            </div>
          )}

          {lockoutInfo && lockoutInfo.locked && (
            <div className='bg-yellow-900/50 border border-yellow-600 text-yellow-200 p-3 rounded mb-4'>
              <p className='font-bold mb-1'>Account Locked</p>
              <p className='text-sm'>
                Too many failed login attempts. Please try again in {lockoutInfo.minutesRemaining} minutes.
              </p>
            </div>
          )}

          <button
            type='submit'
            disabled={loading || (lockoutInfo && lockoutInfo.locked)}
            className='w-full bg-band-orange text-white py-2 rounded hover:bg-orange-600 disabled:opacity-50 mb-4'
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className='text-gray-400 text-sm text-center'>
          Don&apos;t have an account?{' '}
          <button
            type='button'
            onClick={() => navigate('/admin/signup')}
            className='text-band-orange hover:text-orange-300 underline'
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  )
}

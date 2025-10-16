import { useState } from 'react'
import { authApi } from '../utils/adminApi'

export default function AdminLogin({ onLoginSuccess }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [masterPassword, setMasterPassword] = useState('')
  const [showMasterInput, setShowMasterInput] = useState(false)
  const [retrievedPassword, setRetrievedPassword] = useState(null)
  const [lockoutInfo, setLockoutInfo] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLockoutInfo(null)
    setLoading(true)

    try {
      const result = await authApi.login(password)

      if (result.success) {
        // Store password in sessionStorage
        window.sessionStorage.setItem('adminPassword', password)
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

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await authApi.resetPassword(masterPassword)

      if (result.success) {
        setRetrievedPassword(result.adminPassword)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text) => {
    window.navigator.clipboard.writeText(text).then(() => {
      // Using native alert is acceptable for admin panel
       
      window.alert('Password copied to clipboard')
    })
  }

  if (showForgotPassword) {
    return (
      <div className='min-h-screen bg-band-navy flex items-center justify-center p-4'>
        <div className='bg-band-purple p-8 rounded-lg shadow-xl max-w-md w-full'>
          <h1 className='text-2xl font-bold text-band-orange mb-6'>Forgot Password</h1>

          {!retrievedPassword ? (
            <>
              <div className='bg-yellow-900/30 border border-yellow-600 rounded p-4 mb-6'>
                <p className='text-yellow-200 text-sm mb-2'>
                  <strong>Need help?</strong>
                </p>
                <p className='text-yellow-200 text-sm mb-3'>Contact the developer:</p>
                <p className='text-yellow-200 font-mono text-lg'>
                  [YOUR_PHONE_HERE]
                </p>
              </div>

              {!showMasterInput && (
                <button
                  type='button'
                  onClick={() => setShowMasterInput(true)}
                  className='text-band-orange hover:text-orange-300 text-sm mb-4 underline'
                >
                  Use master password instead
                </button>
              )}

              {showMasterInput && (
                <form onSubmit={handleResetPassword}>
                  <div className='bg-red-900/30 border border-red-600 rounded p-4 mb-4'>
                    <p className='text-red-200 text-sm'>
                      <strong>Warning:</strong> Master password is for emergencies only.
                      Please contact the developer first.
                    </p>
                  </div>

                  <div className='mb-4'>
                    <label htmlFor='master-password' className='block text-white mb-2'>Master Password</label>
                    <input
                      id='master-password'
                      type='password'
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      className='w-full px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                      required
                    />
                  </div>

                  {error && (
                    <div className='bg-red-900/50 border border-red-600 text-red-200 p-3 rounded mb-4'>
                      {error}
                    </div>
                  )}

                  <div className='flex gap-3'>
                    <button
                      type='submit'
                      disabled={loading}
                      className='flex-1 bg-band-orange text-white py-2 rounded hover:bg-orange-600 disabled:opacity-50'
                    >
                      {loading ? 'Retrieving...' : 'Retrieve Password'}
                    </button>
                    <button
                      type='button'
                      onClick={() => setShowForgotPassword(false)}
                      className='flex-1 bg-gray-600 text-white py-2 rounded hover:bg-gray-700'
                    >
                      Back to Login
                    </button>
                  </div>
                </form>
              )}

              {!showMasterInput && (
                <button
                  type='button'
                  onClick={() => setShowForgotPassword(false)}
                  className='w-full bg-gray-600 text-white py-2 rounded hover:bg-gray-700'
                >
                  Back to Login
                </button>
              )}
            </>
          ) : (
            <div>
              <div className='bg-green-900/30 border border-green-600 rounded p-4 mb-4'>
                <p className='text-green-200 text-sm mb-3'>
                  Admin password retrieved successfully:
                </p>
                <div className='flex items-center gap-2'>
                  <input
                    type='text'
                    value={retrievedPassword}
                    readOnly
                    className='flex-1 px-4 py-2 rounded bg-band-navy text-white border border-gray-600 font-mono'
                  />
                  <button
                    onClick={() => copyToClipboard(retrievedPassword)}
                    className='px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600'
                  >
                    Copy
                  </button>
                </div>
              </div>

              <button
                type='button'
                onClick={() => {
                  setShowForgotPassword(false)
                  setRetrievedPassword(null)
                  setMasterPassword('')
                  setShowMasterInput(false)
                }}
                className='w-full bg-band-orange text-white py-2 rounded hover:bg-orange-600'
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-band-navy flex items-center justify-center p-4'>
      <div className='bg-band-purple p-8 rounded-lg shadow-xl max-w-md w-full'>
        <h1 className='text-2xl font-bold text-band-orange mb-6'>Admin Login</h1>

        <form onSubmit={handleLogin}>
          <div className='mb-4'>
            <label htmlFor='admin-password' className='block text-white mb-2'>Password</label>
            <input
              id='admin-password'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

        <button
          type='button'
          onClick={() => setShowForgotPassword(true)}
          className='text-band-orange hover:text-orange-300 text-sm underline'
        >
          Forgot password?
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { authApi } from '../utils/adminApi'
import { useNavigate } from 'react-router-dom'

export default function SignupPage() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      await authApi.signup(formData.email, formData.password, formData.name)
      // Redirect to admin panel on success
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-band-navy flex items-center justify-center p-4">
      <div className="bg-band-purple rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
        <p className="text-gray-400 mb-6">Pink Lemonade Records - Waterloo Region</p>

        {error && (
          <div className="bg-red-900/30 border border-red-600 rounded p-3 mb-4">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signup-email" className="block text-white mb-2 text-sm">Email *</label>
            <input
              id="signup-email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-white mb-2 text-sm">Password *</label>
            <input
              id="signup-password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              placeholder="Min. 8 characters"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-confirm-password" className="block text-white mb-2 text-sm">Confirm Password *</label>
            <input
              id="signup-confirm-password"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-name" className="block text-white mb-2 text-sm">Display Name (Optional)</label>
            <input
              id="signup-name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              placeholder="Your Name"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors font-semibold"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-gray-400 text-sm mt-4 text-center">
          Already have an account?{' '}
          <a href="/admin/login" className="text-band-orange hover:underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  )
}

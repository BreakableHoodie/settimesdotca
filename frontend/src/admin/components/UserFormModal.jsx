// User form modal for creating and editing users
// Props:
// - isOpen: boolean
// - onClose: function
// - user: User object (null for create mode)
// - onSave: function(userData)
// - loading: boolean

import { useState, useEffect } from 'react'

export default function UserFormModal({ isOpen, onClose, user, onSave, loading }) {
  const isEditMode = Boolean(user)

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'editor',
    isActive: true,
  })

  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (user) {
      // Use setTimeout to avoid synchronous setState warning
      setTimeout(() => {
        setFormData({
          email: user.email || '',
          password: '', // Don't populate password for edit
          name: user.name || '',
          role: user.role || 'editor',
          isActive: user.isActive !== undefined ? user.isActive : true,
        })
        setErrors({})
      }, 0)
    } else {
      setTimeout(() => {
        setFormData({
          email: '',
          password: '',
          name: '',
          role: 'editor',
          isActive: true,
        })
        setErrors({})
      }, 0)
    }
  }, [user, isOpen])

  const validate = () => {
    const newErrors = {}

    // Email validation
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    // Password validation (only for create mode)
    if (!isEditMode && !formData.password) {
      newErrors.password = 'Password is required'
    } else if (!isEditMode && formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    // Name validation
    if (!formData.name) {
      newErrors.name = 'Display name is required'
    } else if (formData.name.length < 2) {
      newErrors.name = 'Display name must be at least 2 characters'
    }

    // Role validation
    if (!['admin', 'editor', 'viewer'].includes(formData.role)) {
      newErrors.role = 'Invalid role selected'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = e => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    onSave(formData)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white/10 backdrop-blur-lg rounded-lg border border-white/20 p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-white mb-4">{isEditMode ? 'Edit User' : 'Create New User'}</h3>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div className="mb-4">
            <label htmlFor="email" className="block text-white font-medium mb-2">
              Email *
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              disabled={isEditMode} // Can't change email in edit mode
              className={`w-full px-3 py-2 rounded-lg bg-white/10 text-white border ${
                errors.email ? 'border-red-500' : 'border-white/20'
              } focus:border-band-orange focus:outline-none placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed`}
              placeholder="user@example.com"
            />
            {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
          </div>

          {/* Password (only in create mode or if explicitly changing) */}
          {!isEditMode && (
            <div className="mb-4">
              <label htmlFor="password" className="block text-white font-medium mb-2">
                Password *
              </label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg bg-white/10 text-white border ${
                  errors.password ? 'border-red-500' : 'border-white/20'
                } focus:border-band-orange focus:outline-none placeholder-gray-400`}
                placeholder="Minimum 8 characters"
              />
              {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password}</p>}
            </div>
          )}

          {/* Display Name */}
          <div className="mb-4">
            <label htmlFor="name" className="block text-white font-medium mb-2">
              Display Name *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg bg-white/10 text-white border ${
                errors.name ? 'border-red-500' : 'border-white/20'
              } focus:border-band-orange focus:outline-none placeholder-gray-400`}
              placeholder="John Doe"
            />
            {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
          </div>

          {/* Role */}
          <div className="mb-4">
            <label htmlFor="role" className="block text-white font-medium mb-2">
              Role *
            </label>
            <select
              id="role"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg bg-white/10 text-white border ${
                errors.role ? 'border-red-500' : 'border-white/20'
              } focus:border-band-orange focus:outline-none`}
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            {errors.role && <p className="mt-1 text-sm text-red-400">{errors.role}</p>}
            <p className="mt-1 text-xs text-gray-400">
              Admin: Full access | Editor: Create/edit content | Viewer: Read-only access
            </p>
          </div>

          {/* Active Status */}
          {isEditMode && (
            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-white font-medium">Active</span>
              </label>
              <p className="mt-1 text-xs text-gray-400">Inactive users cannot log in</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-band-orange hover:bg-band-orange/90 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditMode ? 'Update User' : 'Create User'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

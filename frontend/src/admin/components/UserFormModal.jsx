// User form modal for creating and editing users
// Props:
// - isOpen: boolean
// - onClose: function
// - user: User object (null for create mode)
// - onSave: function(userData)
// - loading: boolean
// - inviteUrl: string|null — when set, switches to invite-link copy view (email delivery failed)

import { useState, useEffect } from 'react'
import { FIELD_LIMITS } from '../../utils/validation'
import Modal from '../../components/ui/Modal'
import { copyToClipboard } from '../../utils/clipboard'

export default function UserFormModal({ isOpen, onClose, user, onSave, loading, inviteUrl }) {
  const isEditMode = Boolean(user)

  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'editor',
    isActive: true,
  })

  const [errors, setErrors] = useState({})
  const [inviteCopy, setInviteCopy] = useState('idle')

  // This link is the only way the new user can activate their account, so a copy
  // that quietly fails costs an onboarding round trip nobody knows to make. The
  // result must reach the admin either way.
  const handleCopyInvite = async () => {
    // copyToClipboard is written to report false rather than reject, but a
    // handler whose only failure path depends on that promise is one refactor
    // away from silently doing nothing. Treat a throw as a failed copy.
    try {
      setInviteCopy((await copyToClipboard(inviteUrl)) ? 'copied' : 'error')
    } catch {
      setInviteCopy('error')
    }
  }

  useEffect(() => {
    if (user) {
      // Use setTimeout to avoid synchronous setState warning
      setTimeout(() => {
        const fallbackName = user.name || ''
        const parts = fallbackName.trim().split(/\s+/).filter(Boolean)
        const resolvedFirst = user.firstName || parts[0] || ''
        const resolvedLast = user.lastName || parts.slice(1).join(' ') || ''
        setFormData({
          email: user.email || '',
          firstName: resolvedFirst,
          lastName: resolvedLast,
          role: user.role || 'editor',
          isActive: user.isActive !== undefined ? user.isActive : true,
        })
        setErrors({})
      }, 0)
    } else {
      setTimeout(() => {
        setFormData({
          email: '',
          firstName: '',
          lastName: '',
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
    } else if (formData.email.length > FIELD_LIMITS.email.max) {
      newErrors.email = `Email must be no more than ${FIELD_LIMITS.email.max} characters`
    }

    // Name validation
    if (!formData.firstName) {
      newErrors.firstName = 'First name is required'
    } else if (formData.firstName.length < FIELD_LIMITS.userFirstName.min) {
      newErrors.firstName = `First name must be at least ${FIELD_LIMITS.userFirstName.min} characters`
    } else if (formData.firstName.length > FIELD_LIMITS.userFirstName.max) {
      newErrors.firstName = `First name must be no more than ${FIELD_LIMITS.userFirstName.max} characters`
    }

    if (!formData.lastName) {
      newErrors.lastName = 'Last name is required'
    } else if (formData.lastName.length < FIELD_LIMITS.userLastName.min) {
      newErrors.lastName = `Last name must be at least ${FIELD_LIMITS.userLastName.min} characters`
    } else if (formData.lastName.length > FIELD_LIMITS.userLastName.max) {
      newErrors.lastName = `Last name must be no more than ${FIELD_LIMITS.userLastName.max} characters`
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

  if (inviteUrl) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Invite Created" size="sm" showCloseButton={false}>
        <p className="text-sm text-yellow-300 mb-4">Email delivery failed. Copy this link and share it manually:</p>
        <input
          type="text"
          readOnly
          value={inviteUrl}
          onFocus={e => e.target.select()}
          aria-label="Invite URL"
          className="w-full min-h-[44px] px-3 py-2 mb-4 rounded-lg bg-black/30 text-white border border-white/20 text-xs font-mono break-all"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="flex-1 min-h-[44px] bg-accent-500 hover:bg-accent-600 text-bg-navy font-bold py-2 px-4 rounded-lg transition"
          >
            Copy Link
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition"
          >
            Close
          </button>
        </div>
        <p aria-live="polite" className="mt-2 text-sm min-h-[1.25rem]">
          {inviteCopy === 'copied' && <span className="text-green-300">Invite link copied.</span>}
          {inviteCopy === 'error' && (
            <span className="text-red-300">Could not copy the invite link — select it above and copy manually.</span>
          )}
        </p>
      </Modal>
    )
  }

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
              maxLength={FIELD_LIMITS.email.max}
              className={`w-full min-h-[44px] px-3 py-2 rounded-lg bg-white/10 text-white border ${
                errors.email ? 'border-red-500' : 'border-white/20'
              } focus:border-accent-500 focus:outline-hidden placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed`}
              placeholder="user@example.com"
            />
            {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
            <p className="mt-1 text-xs text-gray-400">
              {formData.email.length}/{FIELD_LIMITS.email.max}
            </p>
          </div>

          {!isEditMode && (
            <div className="mb-4">
              <p className="text-sm text-gray-300">
                An invite email will be sent so the user can set their own password.
              </p>
            </div>
          )}

          {/* First Name */}
          <div className="mb-4">
            <label htmlFor="firstName" className="block text-white font-medium mb-2">
              First Name *
            </label>
            <input
              type="text"
              id="firstName"
              value={formData.firstName}
              onChange={e => setFormData({ ...formData, firstName: e.target.value })}
              minLength={FIELD_LIMITS.userFirstName.min}
              maxLength={FIELD_LIMITS.userFirstName.max}
              className={`w-full min-h-[44px] px-3 py-2 rounded-lg bg-white/10 text-white border ${
                errors.firstName ? 'border-red-500' : 'border-white/20'
              } focus:border-accent-500 focus:outline-hidden placeholder-gray-400`}
              placeholder="First"
            />
            {errors.firstName && <p className="mt-1 text-sm text-red-400">{errors.firstName}</p>}
            <p className="mt-1 text-xs text-gray-400">
              {formData.firstName.length}/{FIELD_LIMITS.userFirstName.max}
            </p>
          </div>

          {/* Last Name */}
          <div className="mb-4">
            <label htmlFor="lastName" className="block text-white font-medium mb-2">
              Last Name *
            </label>
            <input
              type="text"
              id="lastName"
              value={formData.lastName}
              onChange={e => setFormData({ ...formData, lastName: e.target.value })}
              minLength={FIELD_LIMITS.userLastName.min}
              maxLength={FIELD_LIMITS.userLastName.max}
              className={`w-full min-h-[44px] px-3 py-2 rounded-lg bg-white/10 text-white border ${
                errors.lastName ? 'border-red-500' : 'border-white/20'
              } focus:border-accent-500 focus:outline-hidden placeholder-gray-400`}
              placeholder="Last"
            />
            {errors.lastName && <p className="mt-1 text-sm text-red-400">{errors.lastName}</p>}
            <p className="mt-1 text-xs text-gray-400">
              {formData.lastName.length}/{FIELD_LIMITS.userLastName.max}
            </p>
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
              className={`w-full min-h-[44px] px-3 py-2 rounded-lg bg-white/10 text-white border ${
                errors.role ? 'border-red-500' : 'border-white/20'
              } focus:border-accent-500 focus:outline-hidden`}
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
                  className="h-5 w-5 mr-2"
                />
                <span className="text-white font-medium">Active</span>
              </label>
              <p className="mt-1 text-xs text-gray-400">Inactive users cannot log in</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] flex-1 bg-accent-500 hover:bg-accent-600 text-bg-navy font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditMode ? 'Update User' : 'Send Invite'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="min-h-[44px] flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

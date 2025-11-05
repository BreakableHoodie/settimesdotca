import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faKey, faUserSlash, faUserCheck } from '@fortawesome/free-solid-svg-icons'

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetReason, setResetReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem('sessionToken')}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('sessionToken')}`,
        },
        body: JSON.stringify({ reason: resetReason }),
      })

      const data = await response.json()

      if (response.ok) {
        alert(`Password reset initiated for ${selectedUser.email}.\nReset URL: ${data.resetUrl}`)
        setShowResetModal(false)
        setResetReason('')
        setSelectedUser(null)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to initiate password reset')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleUserStatus = async user => {
    if (!confirm(`Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} ${user.email}?`)) {
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/toggle-status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem('sessionToken')}`,
        },
      })

      if (response.ok) {
        fetchUsers() // Refresh the list
      } else {
        const data = await response.json()
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to update user status')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-white">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">User Management</h2>
        <p className="text-gray-300">Manage user accounts, roles, and permissions</p>
      </div>

      <div className="bg-white/10 backdrop-blur-lg rounded-lg border border-white/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-white">{user.name}</div>
                      <div className="text-sm text-gray-300">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user)
                          setShowResetModal(true)
                        }}
                        className="text-band-orange hover:text-band-orange/80 transition"
                        title="Reset Password"
                      >
                        <FontAwesomeIcon icon={faKey} />
                      </button>
                      <button
                        onClick={() => handleToggleUserStatus(user)}
                        className={`transition ${
                          user.is_active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'
                        }`}
                        title={user.is_active ? 'Deactivate User' : 'Activate User'}
                        disabled={actionLoading}
                      >
                        <FontAwesomeIcon icon={user.is_active ? faUserSlash : faUserCheck} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white/10 backdrop-blur-lg rounded-lg border border-white/20 p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-white mb-4">Reset Password</h3>
            <p className="text-gray-300 mb-4">
              This will send a password reset link to <strong>{selectedUser?.email}</strong>. The user will need to
              complete the reset process themselves.
            </p>

            <div className="mb-4">
              <label htmlFor="resetReason" className="block text-white font-medium mb-2">
                Reason (Optional)
              </label>
              <textarea
                id="resetReason"
                value={resetReason}
                onChange={e => setResetReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 focus:border-band-orange focus:outline-none placeholder-gray-400"
                placeholder="Reason for password reset..."
                rows={3}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleResetPassword}
                disabled={actionLoading}
                className="flex-1 bg-band-orange hover:bg-band-orange/90 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
              >
                {actionLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button
                onClick={() => {
                  setShowResetModal(false)
                  setSelectedUser(null)
                  setResetReason('')
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

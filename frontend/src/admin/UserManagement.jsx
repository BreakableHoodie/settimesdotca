import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faKey, faUserSlash, faUserCheck, faPlus, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons'
import RoleBadge from './components/RoleBadge'
import UserFormModal from './components/UserFormModal'
import { usersApi } from '../utils/adminApi'

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [resetReason, setResetReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const data = await usersApi.getAll()
      setUsers(data.users)
    } catch (error) {
      console.error('Failed to fetch users:', error)
      alert('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async userData => {
    setActionLoading(true)
    try {
      await usersApi.create(userData)
      alert(`User ${userData.email} created successfully`)
      setShowUserModal(false)
      setEditingUser(null)
      fetchUsers() // Refresh list
    } catch (error) {
      console.error('Failed to create user:', error)
      alert('Failed to create user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateUser = async userData => {
    if (!editingUser) return

    setActionLoading(true)
    try {
      await usersApi.update(editingUser.id, {
        role: userData.role,
        name: userData.name,
        isActive: userData.isActive,
      })
      alert(`User ${userData.email} updated successfully`)
      setShowUserModal(false)
      setEditingUser(null)
      fetchUsers() // Refresh list
    } catch (error) {
      console.error('Failed to update user:', error)
      alert('Failed to update user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteUser = async user => {
    if (!confirm(`Are you sure you want to delete ${user.email}? This action cannot be undone.`)) {
      return
    }

    setActionLoading(true)
    try {
      await usersApi.remove(user.id)
      alert(`User ${user.email} deleted successfully`)
      fetchUsers() // Refresh list
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert('Failed to delete user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      const data = await usersApi.resetPassword(selectedUser.id, { reason: resetReason })

      if (data?.resetUrl) {
        alert(`Password reset initiated for ${selectedUser.email}.\nReset URL: ${data.resetUrl}`)
        setShowResetModal(false)
        setResetReason('')
        setSelectedUser(null)
      }
    } catch {
      alert('Failed to initiate password reset')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleUserStatus = async user => {
    if (!confirm(`Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} ${user.email}?`)) {
      return
    }

    setActionLoading(true)
    try {
      await usersApi.update(user.id, { isActive: !user.isActive })
      fetchUsers() // Refresh the list
    } catch {
      alert('Failed to update user status')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveUser = userData => {
    if (editingUser) {
      handleUpdateUser(userData)
    } else {
      handleCreateUser(userData)
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
    <div className="space-y-6">
      <div className="flex flex-col items-start sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">User Management</h2>
          <p className="text-sm text-white/70 mt-1">Manage user accounts, roles, and permissions.</p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null)
            setShowUserModal(true)
          }}
          className="bg-band-orange hover:bg-band-orange/90 text-white font-bold py-2 px-4 min-h-[44px] rounded-lg transition flex items-center gap-2"
        >
          <FontAwesomeIcon icon={faPlus} />
          Add User
        </button>
      </div>

      <div className="bg-white/10 backdrop-blur-lg rounded-lg border border-white/20 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
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
              {users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-300">
                    No users found. Click &ldquo;Add User&rdquo; to create one.
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-white/5">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-white">{user.name}</div>
                        <div className="text-sm text-gray-300">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setEditingUser(user)
                            setShowUserModal(true)
                          }}
                          className="text-blue-400 hover:text-blue-300 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Edit User"
                          disabled={actionLoading}
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user)
                            setShowResetModal(true)
                          }}
                          className="text-band-orange hover:text-band-orange/80 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Reset Password"
                          disabled={actionLoading}
                        >
                          <FontAwesomeIcon icon={faKey} />
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(user)}
                          className={`transition ${
                            user.isActive
                              ? 'text-yellow-400 hover:text-yellow-300'
                              : 'text-green-400 hover:text-green-300'
                          } min-h-[44px] min-w-[44px] flex items-center justify-center`}
                          title={user.isActive ? 'Deactivate User' : 'Activate User'}
                          disabled={actionLoading}
                        >
                          <FontAwesomeIcon icon={user.isActive ? faUserSlash : faUserCheck} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="text-red-400 hover:text-red-300 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Delete User"
                          disabled={actionLoading}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-white/10">
          {users.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-300">No users found. Tap “Add User” to create one.</div>
          ) : (
            users.map(user => (
              <div key={user.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{user.name}</div>
                    <div className="text-sm text-gray-300">{user.email}</div>
                  </div>
                  <RoleBadge role={user.role} />
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-gray-300">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-white/10 text-white">
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span>Last Login: {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setEditingUser(user)
                      setShowUserModal(true)
                    }}
                    className="px-4 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                    disabled={actionLoading}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setSelectedUser(user)
                      setShowResetModal(true)
                    }}
                    className="px-4 py-2 min-h-[44px] bg-band-orange/80 hover:bg-band-orange text-white rounded text-sm"
                    disabled={actionLoading}
                  >
                    Reset Password
                  </button>
                  <button
                    onClick={() => handleToggleUserStatus(user)}
                    className={`px-4 py-2 min-h-[44px] rounded text-sm ${
                      user.isActive
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                    disabled={actionLoading}
                  >
                    {user.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user)}
                    className="px-4 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                    disabled={actionLoading}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* User Form Modal */}
      <UserFormModal
        isOpen={showUserModal}
        onClose={() => {
          setShowUserModal(false)
          setEditingUser(null)
        }}
        user={editingUser}
        onSave={handleSaveUser}
        loading={actionLoading}
      />

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
                className="w-full px-3 py-2 min-h-[44px] rounded-lg bg-white/10 text-white border border-white/20 focus:border-band-orange focus:outline-none placeholder-gray-400"
                placeholder="Reason for password reset..."
                rows={3}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleResetPassword}
                disabled={actionLoading}
                className="flex-1 min-h-[44px] bg-band-orange hover:bg-band-orange/90 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
              >
                {actionLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button
                onClick={() => {
                  setShowResetModal(false)
                  setSelectedUser(null)
                  setResetReason('')
                }}
                disabled={actionLoading}
                className="flex-1 min-h-[44px] bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
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

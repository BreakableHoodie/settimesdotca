import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Button, Card } from '../components/ui'
import RoleBadge from './components/RoleBadge'

/**
 * Returns a short human-readable label for a user-agent string.
 * Falls back to the raw UA (truncated) if parsing fails.
 */
function summariseUserAgent(ua) {
  if (!ua) return 'Unknown device'
  if (ua.includes('Mobile') || ua.includes('Android')) return 'Mobile browser'
  if (ua.includes('iPad') || ua.includes('Tablet')) return 'Tablet browser'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Edge')) return 'Edge'
  return ua.slice(0, 40) + (ua.length > 40 ? '…' : '')
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export default function UserSettings({ user, onOpenMfa }) {
  const [devices, setDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [devicesError, setDevicesError] = useState(null)
  const [revoking, setRevoking] = useState(null) // device ID currently being revoked

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true)
    setDevicesError(null)
    try {
      const res = await fetch('/api/admin/trusted-devices', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load trusted devices')
      const data = await res.json()
      setDevices(data.devices || [])
    } catch (err) {
      setDevicesError(err.message)
    } finally {
      setDevicesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  const handleRevoke = async (deviceId) => {
    setRevoking(deviceId)
    try {
      const res = await fetch('/api/admin/trusted-devices', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      if (!res.ok) throw new Error('Failed to revoke device')
      setDevices(prev => prev.filter(d => d.id !== deviceId))
    } catch (err) {
      setDevicesError(err.message)
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-sm text-white/70 mt-1">Manage your account details and security preferences.</p>
      </div>
      <Card variant="elevated" className="p-6">
        <h3 className="text-xl font-semibold text-text-primary mb-2">My Account</h3>
        <p className="text-text-secondary mb-4">Manage your profile details and security settings.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-tertiary mb-1">Name</p>
            <p className="text-lg text-text-primary">{user?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-tertiary mb-1">Email</p>
            <p className="text-lg text-text-primary">{user?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-tertiary mb-1">Role</p>
            {user?.role ? <RoleBadge role={user.role} /> : <p className="text-lg text-text-primary">—</p>}
          </div>
        </div>
      </Card>

      <Card variant="elevated" className="p-6">
        <h3 className="text-xl font-semibold text-text-primary mb-2">Security</h3>
        <p className="text-text-secondary mb-4">Keep your account protected with multi-factor authentication.</p>
        <Button onClick={onOpenMfa} variant="primary" size="md">
          Manage MFA
        </Button>
      </Card>

      <Card variant="elevated" className="p-6">
        <h3 className="text-xl font-semibold text-text-primary mb-2">Trusted Devices</h3>
        <p className="text-text-secondary mb-4">
          Devices you marked as trusted skip the MFA step for 30 days. Revoke any device
          you no longer recognise.
        </p>

        {devicesError && (
          <p className="text-red-400 text-sm mb-4">{devicesError}</p>
        )}

        {devicesLoading ? (
          <p className="text-text-tertiary text-sm">Loading devices…</p>
        ) : devices.length === 0 ? (
          <p className="text-text-tertiary text-sm">No trusted devices.</p>
        ) : (
          <ul className="space-y-3">
            {devices.map(device => (
              <li
                key={device.id}
                className="flex items-center justify-between gap-4 rounded-lg bg-white/5 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {summariseUserAgent(device.user_agent)}
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    Last used: {formatDate(device.last_used_at || device.created_at)}
                    {device.ip_address ? ` · ${device.ip_address}` : ''}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleRevoke(device.id)}
                  disabled={revoking === device.id}
                >
                  {revoking === device.id ? 'Revoking…' : 'Revoke'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

UserSettings.propTypes = {
  user: PropTypes.shape({
    name: PropTypes.string,
    email: PropTypes.string,
    role: PropTypes.string,
  }),
  onOpenMfa: PropTypes.func.isRequired,
}

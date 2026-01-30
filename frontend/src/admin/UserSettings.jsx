import PropTypes from 'prop-types'
import { Button, Card } from '../components/ui'
import RoleBadge from './components/RoleBadge'

export default function UserSettings({ user, onOpenMfa }) {
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

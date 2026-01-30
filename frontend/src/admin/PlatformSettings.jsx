import PropTypes from 'prop-types'
import { Card } from '../components/ui'

export default function PlatformSettings({ isAdmin }) {
  if (!isAdmin) {
    return (
      <Card variant="elevated" className="p-6">
        <h2 className="text-2xl font-bold text-text-primary mb-2">Platform Settings</h2>
        <p className="text-text-secondary">You don’t have permission to view platform settings.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Platform Settings</h2>
        <p className="text-sm text-white/70 mt-1">Configure platform-wide behavior and integrations.</p>
      </div>
      <Card variant="elevated" className="p-6">
        <h3 className="text-xl font-semibold text-text-primary mb-2">Configuration Overview</h3>
        <p className="text-text-secondary mb-4">
          Platform-wide configuration is managed via environment variables and infrastructure.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-text-secondary">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-tertiary mb-1">Public Data Publishing</p>
            <p>Controlled by PUBLIC_DATA_PUBLISH_ENABLED</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-tertiary mb-1">Email Provider</p>
            <p>Configured via EMAIL_PROVIDER + EMAIL_FROM</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-tertiary mb-1">Security Policies</p>
            <p>CSP and HSTS configured in middleware</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-tertiary mb-1">Branding & Domains</p>
            <p>Managed in Cloudflare Pages settings</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

PlatformSettings.propTypes = {
  isAdmin: PropTypes.bool.isRequired,
}

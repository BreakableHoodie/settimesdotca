import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { mfaApi } from '../../utils/adminApi'
import { Modal, Button, Alert } from '../../components/ui'

export default function MfaSettingsModal({ isOpen, onClose }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [setupData, setSetupData] = useState(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [backupCodes, setBackupCodes] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setSetupData(null)
    setBackupCodes(null)
    setVerificationCode('')
    setCopied(false)

    const loadStatus = async () => {
      try {
        setLoading(true)
        const data = await mfaApi.status()
        setStatus(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadStatus()
  }, [isOpen])

  const handleSetup = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await mfaApi.setup()
      setSetupData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEnable = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await mfaApi.enable(verificationCode)
      setBackupCodes(data.backupCodes || [])
      const updatedStatus = await mfaApi.status()
      setStatus(updatedStatus)
      setVerificationCode('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    try {
      setLoading(true)
      setError(null)
      await mfaApi.disable(verificationCode)
      const updatedStatus = await mfaApi.status()
      setStatus(updatedStatus)
      setSetupData(null)
      setBackupCodes(null)
      setVerificationCode('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await mfaApi.regenerateBackupCodes(verificationCode)
      setBackupCodes(data.backupCodes || [])
      setVerificationCode('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!backupCodes?.length) return
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setError('Failed to copy backup codes.')
    }
  }

  const totpEnabled = status?.totpEnabled

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Multi-Factor Authentication" size="lg">
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && !status ? (
        <div className="text-text-secondary">Loading MFA status...</div>
      ) : (
        <>
          <div className="mb-6">
            <p className="text-text-secondary">
              Add an authenticator app to secure your account. You will use a 6-digit code each time you sign in.
            </p>
          </div>

          {!totpEnabled && (
            <div className="space-y-5">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Setup MFA</h3>
                <p className="text-text-secondary text-sm mb-4">
                  Start setup to generate a secret for your authenticator app. Save your backup codes after enabling.
                </p>

                {setupData ? (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <div className="bg-white p-3 rounded-lg">
                        <QRCodeSVG value={setupData.otpauthUrl} size={180} level="M" includeMargin={false} />
                      </div>
                    </div>
                    <p className="text-center text-text-secondary text-sm">
                      Scan this QR code with your authenticator app
                    </p>
                    <details className="bg-bg-navy/60 border border-white/10 rounded-md">
                      <summary className="px-3 py-2 text-xs text-text-tertiary cursor-pointer hover:text-text-secondary">
                        Can&apos;t scan? Enter code manually
                      </summary>
                      <div className="px-3 pb-3">
                        <p className="font-mono text-sm text-text-primary break-all select-all">{setupData.secret}</p>
                      </div>
                    </details>
                  </div>
                ) : (
                  <Button onClick={handleSetup} variant="primary" size="sm" disabled={loading}>
                    Start Setup
                  </Button>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Enable MFA</h3>
                <p className="text-text-secondary text-sm mb-3">
                  Enter the 6-digit code from your authenticator app to finish setup.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={verificationCode}
                  onChange={e => setVerificationCode(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all mb-3"
                  placeholder="123456"
                  disabled={loading}
                />
                <Button
                  onClick={handleEnable}
                  variant="success"
                  size="sm"
                  disabled={loading || !verificationCode || !setupData}
                >
                  Enable MFA
                </Button>
              </div>
            </div>
          )}

          {totpEnabled && (
            <div className="space-y-5">
              <div className="bg-emerald-900/20 border border-emerald-500/40 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-emerald-200 mb-1">MFA is enabled</h3>
                <p className="text-emerald-100/80 text-sm">Your account requires an authenticator code at sign in.</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Manage Backup Codes</h3>
                <p className="text-text-secondary text-sm mb-3">
                  Regenerating backup codes will invalidate the previous set.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={verificationCode}
                  onChange={e => setVerificationCode(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all mb-3"
                  placeholder="Authenticator code"
                  disabled={loading}
                />
                <Button onClick={handleRegenerate} variant="primary" size="sm" disabled={loading || !verificationCode}>
                  Regenerate Backup Codes
                </Button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Disable MFA</h3>
                <p className="text-text-secondary text-sm mb-3">
                  Disabling MFA removes the extra sign-in step for this account.
                </p>
                <Button onClick={handleDisable} variant="danger" size="sm" disabled={loading || !verificationCode}>
                  Disable MFA
                </Button>
              </div>
            </div>
          )}

          {backupCodes && backupCodes.length > 0 && (
            <div className="mt-6 bg-bg-navy/60 border border-white/10 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-text-primary">Backup Codes</h3>
                <Button onClick={handleCopy} variant="secondary" size="sm">
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-text-secondary text-sm mb-3">
                Save these codes in a secure place. Each code can be used once.
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm text-text-primary">
                {backupCodes.map(code => (
                  <div key={code} className="bg-bg-navy/80 border border-white/10 rounded-md px-3 py-2 text-center">
                    {code}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

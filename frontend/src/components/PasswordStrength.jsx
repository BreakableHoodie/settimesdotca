import PropTypes from 'prop-types'
import { FIELD_LIMITS } from '../utils/validation'

const buildChecks = password => {
  const lengthOk = password.length >= FIELD_LIMITS.password.min
  return [
    { label: `At least ${FIELD_LIMITS.password.min} characters`, ok: lengthOk },
    { label: 'One uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'One number', ok: /\d/.test(password) },
    { label: 'One special character', ok: /[^A-Za-z0-9]/.test(password) },
  ]
}

const getStrength = checks => {
  const score = checks.filter(check => check.ok).length
  if (score <= 2) return { label: 'Weak', color: 'bg-red-500', score }
  if (score <= 4) return { label: 'Medium', color: 'bg-yellow-500', score }
  return { label: 'Strong', color: 'bg-green-500', score }
}

export default function PasswordStrength({ password }) {
  if (!password) {
    return null
  }

  const checks = buildChecks(password)
  const { label, color, score } = getStrength(checks)
  const percent = Math.round((score / checks.length) * 100)

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>
          Strength: <span className="text-white">{label}</span>
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="grid gap-1 text-xs text-white/70 sm:grid-cols-2">
        {checks.map(check => (
          <div key={check.label} className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${check.ok ? 'bg-green-400' : 'bg-white/20'}`} />
            <span className={check.ok ? 'text-white' : ''}>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

PasswordStrength.propTypes = {
  password: PropTypes.string.isRequired,
}

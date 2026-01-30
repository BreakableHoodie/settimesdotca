const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ||
  process.env.ADMIN_EMAIL ||
  'admin@settimes.ca'

const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD

if (!ADMIN_PASSWORD) {
  throw new Error('E2E_ADMIN_PASSWORD (or ADMIN_PASSWORD) must be set')
}

export { ADMIN_EMAIL, ADMIN_PASSWORD }

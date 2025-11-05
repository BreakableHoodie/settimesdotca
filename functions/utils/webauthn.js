// WebAuthn/Passkey utilities using @simplewebauthn/server
// Industry standard library for FIDO2/WebAuthn implementation

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'

// WebAuthn configuration
const RP_ID = 'localhost' // Change to your domain in production
const RP_NAME = 'Concert Manager'
const ORIGIN = 'http://localhost:5173' // Change to your origin in production

/**
 * Generate WebAuthn registration options for a new passkey
 * @param {string} userEmail - User's email
 * @param {string} userName - User's display name
 * @param {Array} existingCredentials - Array of existing credential IDs
 * @returns {Object} Registration options for the client
 */
export function generateWebAuthnRegistrationOptions(userEmail, userName, existingCredentials = []) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: userEmail,
    userName: userName,
    userDisplayName: userName,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Prefer platform authenticators (Touch ID, Windows Hello)
      userVerification: 'preferred',
      residentKey: 'preferred'
    },
    excludeCredentials: existingCredentials.map(cred => ({
      id: Buffer.from(cred.credential_id, 'base64'),
      type: 'public-key',
      transports: cred.transports || ['internal']
    })),
    supportedAlgorithmIDs: [-7, -257] // ES256 and RS256
  })
}

/**
 * Verify WebAuthn registration response
 * @param {Object} response - Registration response from client
 * @param {Object} expectedChallenge - Expected challenge from registration options
 * @returns {Object} Verification result with credential info
 */
export function verifyWebAuthnRegistration(response, expectedChallenge) {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: false
  })
}

/**
 * Generate WebAuthn authentication options
 * @param {Array} allowedCredentials - Array of allowed credential IDs
 * @returns {Object} Authentication options for the client
 */
export function generateWebAuthnAuthenticationOptions(allowedCredentials = []) {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: allowedCredentials.map(cred => ({
      id: Buffer.from(cred.credential_id, 'base64'),
      type: 'public-key',
      transports: cred.transports || ['internal']
    })),
    userVerification: 'preferred'
  })
}

/**
 * Verify WebAuthn authentication response
 * @param {Object} response - Authentication response from client
 * @param {Object} expectedChallenge - Expected challenge from auth options
 * @param {Object} credential - Stored credential from database
 * @returns {Object} Verification result
 */
export function verifyWebAuthnAuthentication(response, expectedChallenge, credential) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    authenticator: {
      credentialID: Buffer.from(credential.credential_id, 'base64'),
      credentialPublicKey: Buffer.from(credential.public_key, 'base64'),
      counter: credential.counter,
      transports: credential.transports || ['internal']
    },
    requireUserVerification: false
  })
}

/**
 * Generate a random challenge for WebAuthn
 * @returns {string} Base64 encoded challenge
 */
export function generateWebAuthnChallenge() {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(challenge).toString('base64')
}

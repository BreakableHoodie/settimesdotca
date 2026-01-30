import crypto from 'crypto';

const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      
      const saltBase64 = salt.toString('base64');
      const hashBase64 = derivedKey.toString('base64');
      resolve(`${saltBase64}:${hashBase64}`);
    });
  });
}

hashPassword('tyqqeG-3niqke-kafxyt').then(console.log);

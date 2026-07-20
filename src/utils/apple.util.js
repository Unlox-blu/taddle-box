const jwt = require('jsonwebtoken');
const fs = require('fs');
const axios = require('axios');

/**
 * Generates the Apple Client Secret JWT required to communicate with Apple's API.
 * Requires APPLE_TEAM_ID, APPLE_SERVICE_ID, APPLE_KEY_ID, and APPLE_P8_PATH (or APPLE_P8_KEY) in .env.
 */
const generateAppleClientSecret = () => {
  const teamId = process.env.APPLE_TEAM_ID;
  const clientId = process.env.APPLE_SERVICE_ID; // The Service ID
  const keyId = process.env.APPLE_KEY_ID;
  const p8Path = process.env.APPLE_P8_PATH;
  
  if (!teamId || !clientId || !keyId) {
    return null;
  }

  let privateKey = process.env.APPLE_P8_KEY;
  if (!privateKey && p8Path && fs.existsSync(p8Path)) {
    privateKey = fs.readFileSync(p8Path, 'utf8');
  }

  if (!privateKey) {
    return null;
  }

  const payload = {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 180, // max 180 days
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  const secret = jwt.sign(payload, privateKey, {
    algorithm: 'ES256',
    keyid: keyId,
  });

  return secret;
};

/**
 * Revokes an Apple token (access_token or refresh_token).
 * @param {string} token - The Apple token to revoke.
 */
const revokeAppleToken = async (token) => {
  try {
    const clientSecret = generateAppleClientSecret();
    const clientId = process.env.APPLE_SERVICE_ID;

    if (!clientSecret || !clientId) {
      console.warn('[Apple Util] Missing Apple credentials in .env. Skipping token revocation.');
      return false; // Graceful skip
    }

    const data = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: token,
      token_type_hint: 'refresh_token', // usually refresh_token
    });

    const response = await axios.post('https://appleid.apple.com/auth/revoke', data.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.status === 200) {
      console.log('[Apple Util] Successfully revoked Apple token.');
      return true;
    } else {
      console.error(`[Apple Util] Failed to revoke Apple token: Status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('[Apple Util] Error revoking Apple token:', error.response?.data || error.message);
    return false;
  }
};

module.exports = {
  generateAppleClientSecret,
  revokeAppleToken,
};

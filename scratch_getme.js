const axios = require('axios');
require('dotenv').config({ path: 'd:/Workspace/Unlox/code/taddle/taddle-box/.env' });

async function run() {
  try {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: '362ebbd2-748d-48a6-a46c-9cda81499c2c' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });

    const res = await axios.get('http://localhost:8080/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Response:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

run();

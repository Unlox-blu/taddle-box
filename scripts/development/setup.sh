#!/bin/bash
echo "🚀 Setting up TADDLEBOX..."

# Remove any broken node_modules
rm -rf node_modules package-lock.json

# Use npx expo install — this resolves ALL compatible versions automatically
npx expo install

echo ""
echo "✅ Done! Now run one of:"
echo "   npx expo start          → Expo Go QR code (scan with phone)"
echo "   npx expo start --android → Android emulator"  
echo "   npx expo start --ios     → iOS simulator (Mac only)"

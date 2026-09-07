const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('lottie');

// expo-secure-store has no web implementation (its web stub exports `{}`).
// On web only, route the import to src/infrastructure/storage/secure-store.web.ts
// (a localStorage-backed twin). Native builds keep the real Keychain/Keystore
// module untouched.
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-secure-store') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(
        __dirname,
        'src/infrastructure/storage/secureStore.web.ts',
      ),
    };
  }
  // Delegate with the original platform arg so normal resolution (including
  // platform-extension lookup, e.g. TabsHost.web.js) is unaffected.
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

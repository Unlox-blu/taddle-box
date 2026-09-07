module.exports = function (api) {
  const isProd = api.env('production');
  // The APK self-updater is opt-in at build time (eas.json direct/dev profiles
  // set APP_UPDATER_ENABLED=1). When it's off (store builds), the gate plugin
  // erases the updater host import so Metro never bundles app-updater/* —
  // store builds contain zero updater code. Registering the plugin only here
  // also changes the plugin list, busting Babel/Metro caches across profiles.
  const updaterEnabled =
    process.env.APP_UPDATER_ENABLED === '1' ||
    process.env.EXPO_PUBLIC_IS_DIRECT === 'true';

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      // Strip all console.* calls in production builds to reduce bundle size
      // and prevent sensitive data from leaking to device logs.
      ...(isProd ? ['transform-remove-console'] : []),
      ...(updaterEnabled ? [] : ['./scripts/babel/babel-plugin-updater-gate']),
    ],
  };
};

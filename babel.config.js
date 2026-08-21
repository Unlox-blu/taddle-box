module.exports = function (api) {
  const isProd = api.env('production');
  
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      // Strip all console.* calls in production builds to reduce bundle size
      // and prevent sensitive data from leaking to device logs.
      ...(isProd ? ['transform-remove-console'] : []),
    ],
  };
};

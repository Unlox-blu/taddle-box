/**
 * babel-plugin-updater-gate.js
 *
 * Build-time gate that keeps the APK self-updater out of store bundles.
 *
 * When this plugin is active (updater disabled — store builds), the import of
 * the updater host inside src/app/_layout.tsx is replaced with a null
 * component. The layout stays valid, but app-updater/* becomes unreachable, so
 * Metro excludes it from the bundle — the store build contains ZERO updater
 * code, the same guarantee the old entry-level split (entry.store.js vs
 * entry.direct.js) provided.
 *
 * babel.config.js only registers this plugin when APP_UPDATER_ENABLED is unset,
 * which also changes the plugin list and therefore busts Babel/Metro caches
 * when switching between store and direct profiles.
 */
const t = require('@babel/types');

const HOST_SPECIFIER = /app-updater\/(App)?UpdaterHost$/;

module.exports = function updaterGate() {
  return {
    name: 'updater-gate',
    visitor: {
      ImportDeclaration(path) {
        if (!HOST_SPECIFIER.test(path.node.source.value)) return;
        const id = path.node.specifiers[0]?.local;
        if (!id) return;
        path.replaceWith(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              id,
              t.arrowFunctionExpression([], t.nullLiteral()),
            ),
          ]),
        );
      },
    },
  };
};
'use strict';

/**
 * Registry for generic game engine plugins.
 * Maintains metadata and per-game resource limits.
 */
class GameRegistry {
  static plugins = new Map();

  /**
   * Register a new game plugin.
   * @param {string} slug
   * @param {class} PluginClass
   * @param {Object} meta optional metadata (supportsDifficulty, turnBased, etc.)
   */
  static register(slug, PluginClass, meta = {}) {
    this.plugins.set(slug, { PluginClass, meta });
  }

  /**
   * Get a registered plugin by slug.
   * @param {string} slug
   * @returns {{ PluginClass: class, meta: Object }}
   */
  static get(slug) {
    return this.plugins.get(slug);
  }

  /**
   * Get the plugin class for a slug.
   * @param {string} slug
   * @returns {class}
   */
  static getClass(slug) {
    const entry = this.get(slug);
    return entry ? entry.PluginClass : null;
  }

  /**
   * Instantiate a plugin for a given match.
   * @param {string} slug
   * @param {Object} matchData
   * @returns {GamePlugin}
   */
  static createInstance(slug, matchData) {
    const PluginClass = this.getClass(slug);
    if (!PluginClass) {
      throw new Error(`Game plugin for slug "${slug}" not found.`);
    }
    return new PluginClass(matchData);
  }

  /**
   * Check if a game slug is registered.
   * @param {string} slug
   * @returns {boolean}
   */
  static has(slug) {
    return this.plugins.has(slug);
  }

  /**
   * Get all registered slugs.
   * @returns {string[]}
   */
  static slugs() {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get metadata for a slug.
   * @param {string} slug
   * @returns {Object}
   */
  static getMeta(slug) {
    const entry = this.get(slug);
    return entry ? entry.meta : {};
  }
}

module.exports = GameRegistry;

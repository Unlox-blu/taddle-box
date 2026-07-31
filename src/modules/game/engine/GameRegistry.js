'use strict';

/**
 * Registry for generic game engine plugins.
 */
class GameRegistry {
  static plugins = new Map();

  /**
   * Register a new game plugin.
   * @param {string} slug 
   * @param {class} PluginClass 
   */
  static register(slug, PluginClass) {
    this.plugins.set(slug, PluginClass);
  }

  /**
   * Get a registered plugin by slug.
   * @param {string} slug 
   * @returns {class}
   */
  static get(slug) {
    return this.plugins.get(slug);
  }

  /**
   * Instantiate a plugin for a given match.
   * @param {string} slug 
   * @param {Object} matchData 
   */
  static createInstance(slug, matchData) {
    const PluginClass = this.get(slug);
    if (!PluginClass) {
      throw new Error(`Game plugin for slug "${slug}" not found.`);
    }
    return new PluginClass(matchData);
  }
}

module.exports = GameRegistry;

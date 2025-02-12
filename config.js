/**
 * Configuration options for the JSON key checker
 * @typedef {Object} Config
 * @property {string} srcDir - Directory to scan for source files
 * @property {string[]} jsonPaths - Paths to JSON files to check
 * @property {string[]} searchPaths - Paths to search for key usage
 * @property {string[]} fileExtensions - File extensions to scan
 * @property {boolean} recursive - Whether to scan directories recursively
 * @property {string[]} translationFunctions - Translation function names to check
 */

/**
 * Default configuration
 * @type {Config}
 */
const defaultConfig = {
  srcDir: "src",
  jsonPaths: ["src/**/*.json"],
  searchPaths: ["src/**/*.{js,jsx,ts,tsx}"],
  fileExtensions: [".js", ".jsx", ".ts", ".tsx"],
  recursive: true,
  translationFunctions: ["t", "i18n", "translate"],
};

/**
 * Reads and merges configuration from file
 * @param {string} [configPath="./sumit.config.json"] - Path to config file
 * @returns {Promise<Config>} Merged configuration
 */
async function readConfig(configPath = "./sumit.config.json") {
  try {
    const fs = require("fs").promises;
    const content = await fs.readFile(configPath, "utf8");
    const userConfig = JSON.parse(content);
    return { ...defaultConfig, ...userConfig };
  } catch (error) {
    // If config file doesn't exist, return default config
    if (error.code === "ENOENT") {
      return defaultConfig;
    }
    throw error;
  }
}

module.exports = {
  readConfig,
  defaultConfig,
};

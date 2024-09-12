#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
  functionName: "t",
  languageCode: "en",
};

function readConfig() {
  const configPath = path.join(process.cwd(), "sumit.config.json");

  try {
    let configData = fs.readFileSync(configPath, "utf8");
    configData = JSON.parse(configData);
    if (configData) {
      configData = { DEFAULT_CONFIG, ...configData };
    }
    return configData;
  } catch (err) {
    console.error("Error reading config file:", err.message);
    console.log("Using default config.");
    return DEFAULT_CONFIG;
  }
}

module.exports = { readConfig };

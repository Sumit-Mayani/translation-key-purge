#!/usr/bin/env node
const fs = require("fs");
const glob = require("glob");
const readline = require("readline");
const { readConfig } = require("./config");

// Function to search for a key in a file
const searchKeyInFile = (key, filePath) => {
  const config = readConfig();
  const fileContent = fs.readFileSync(filePath, "utf8");
  const regex = new RegExp(
    `\\b${config.functionName}\\(["'\`]${key}["'\`]\\)`,
    "g"
  );
  return regex.test(fileContent);
};

// Function to find the JSON file with the language code
const findJsonFile = (languageCode, directory) => {
  const files = glob.sync(`${directory}/${languageCode}.json`, {
    absolute: true,
  });
  if (files.length === 0) {
    throw new Error(`No JSON file found for language code: ${languageCode}`);
  }
  return files[0]; // Return the first match
};

// Function to find unused keys
const findUnusedKeys = () => {
  const config = readConfig();
  const allFiles = glob.sync(`**/*.{js,jsx,ts,tsx}`, {
    absolute: true,
    ignore: "**/node_modules/**",
  });
  const enJsonPath = findJsonFile(config.languageCode, config.searchPath);
  console.log(`Found JSON file at: ${enJsonPath}`);
  const enJson = JSON.parse(fs.readFileSync(enJsonPath, "utf8"));
  const translationKeys = Object.keys(enJson);
  const unusedKeys = [];

  translationKeys.forEach((key) => {
    const isUsed = allFiles.some((filePath) => searchKeyInFile(key, filePath));
    if (!isUsed) {
      unusedKeys.push(key);
    }
  });

  return unusedKeys;
};

// Function to remove unused keys from the JSON file
const removeUnusedKeys = (unusedKeys) => {
  const config = readConfig();
  const enJsonPath = findJsonFile(config.languageCode, config.searchPath);
  const enJson = JSON.parse(fs.readFileSync(enJsonPath, "utf8"));

  unusedKeys.forEach((key) => {
    delete enJson[key];
  });

  fs.writeFileSync(enJsonPath, JSON.stringify(enJson, null, 2), "utf8");
  console.log(`Unused keys removed from ${config.languageCode}.json`);
};

const unusedKeys = findUnusedKeys();
console.log("Unused Translation Keys:", unusedKeys);

if (unusedKeys.length > 0) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const config = readConfig();

  rl.question(
    `Enter the keys you want to exclude from removal (comma-separated): `,
    (excludeKeysInput) => {
      const excludeKeys = excludeKeysInput.split(',').map(key => key.trim());
      const keysToRemove = unusedKeys.filter(key => !excludeKeys.includes(key));

      console.log("Keys to be removed:", keysToRemove);

      rl.question(
        `Do you want to remove the unused keys from ${config.languageCode}.json? (yes/no): `,
        (answer) => {
          if (answer.toLowerCase() === "yes" || answer.toLowerCase() === "y") {
            removeUnusedKeys(keysToRemove);
          } else {
            console.log(`No changes made to ${config.languageCode}.json`);
          }
          rl.close();
        }
      );
    }
  );
} else {
  console.log("No unused keys found.");
}

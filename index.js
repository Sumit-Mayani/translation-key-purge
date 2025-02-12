#!/usr/bin/env node
const fs = require("fs").promises;
const { glob } = require("glob");
const path = require("path");
const readline = require("readline");
const { readConfig } = require("./config");

// Add DEBUG constant at the top
const DEBUG = false; // Set to true for detailed logging

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify readline question
const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

/**
 * Stores found JSON keys and their usage information
 * @typedef {Object} KeyUsageMap
 * @property {string} key - The JSON key
 * @property {string[]} definedIn - Files where the key is defined
 * @property {string[]} usedIn - Files where the key is used
 */

/**
 * Main class to handle JSON key usage checking
 */
class JsonKeyChecker {
  constructor(config) {
    this.config = config;
    this.jsonKeys = new Map(); // Stores key usage information
    this.jsonValues = new Set(); // Stores all text values from JSON
    this.unmatchedText = new Map(); // Stores text not found in JSON
    this.translationFunctions = new Set(config.translationFunctions);
  }

  /**
   * Scans JSON files and builds key/value maps
   * @param {string} dir - Directory to scan
   */
  async scanJsonFiles(dir) {
    const files = await glob(this.config.jsonPaths, {
      ignore: "node_modules/**",
      recursive: this.config.recursive,
    });

    if (DEBUG) console.log("Found JSON files:", files);

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");
      const jsonData = JSON.parse(content);

      if (DEBUG) console.log(`Scanning JSON file: ${filePath}`);

      // Extract both keys and values
      this.extractJsonData(jsonData, "", filePath);
    }

    if (DEBUG) {
      console.log("\nCollected JSON keys:", Array.from(this.jsonKeys.keys()));
      console.log("\nCollected JSON values:", Array.from(this.jsonValues));
    }
  }

  /**
   * Extracts all keys and values from a JSON object recursively
   * @param {Object} obj - JSON object to extract from
   * @param {string} prefix - Key prefix for nested objects
   * @param {string} filePath - Path of the JSON file
   */
  extractJsonData(obj, prefix = "", filePath) {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      // Store the key
      if (!this.jsonKeys.has(fullKey)) {
        this.jsonKeys.set(fullKey, {
          definedIn: [filePath],
          usedIn: [],
        });
      } else {
        this.jsonKeys.get(fullKey).definedIn.push(filePath);
      }

      // Store the value if it's a string
      if (typeof value === "string") {
        this.jsonValues.add(value.toLowerCase().trim());
      }

      // Recurse for nested objects
      if (value && typeof value === "object" && !Array.isArray(value)) {
        this.extractJsonData(value, fullKey, filePath);
      }
    }
  }

  /**
   * Extracts text content from JSX/TSX elements
   * @param {string} content - File content
   * @param {string} searchType - Type of search (1 for keys only, 2 for values)
   * @returns {string[]} Array of text content
   */
  extractTextContent(content, searchType) {
    const texts = new Set();

    try {
      if (searchType === "1") {
        // Search for translation keys only
        for (const funcName of this.translationFunctions) {
          const translationRegex = new RegExp(
            `${funcName}\\s*\\(\\s*["']([^"']+)["']\\s*\\)`,
            "g"
          );
          let match;
          while ((match = translationRegex.exec(content)) !== null) {
            const key = match[1].trim();
            if (key) {
              if (DEBUG) console.log(`Found translation key: "${key}"`);
              texts.add(`__KEY__:${key}`);
            }
          }
        }
      } else if (searchType === "2") {
        // Search for text values in arrays, objects, and template literals
        // 1. Match array strings
        const arrayStringRegex =
          /\[\s*(["'][^"']*["']\s*(?:,\s*["'][^"']*["']\s*)*)\]/g;
        let match;
        while ((match = arrayStringRegex.exec(content)) !== null) {
          const arrayContent = match[1];
          const stringMatches = arrayContent.match(/["']([^"']+)["']/g) || [];
          stringMatches.forEach((str) => {
            const cleanStr = str.replace(/^["']|["']$/g, "").trim();
            if (cleanStr) texts.add(cleanStr);
          });
        }

        // 2. Match object string values
        const objectValueRegex = /:\s*["']([^"']+)["']/g;
        while ((match = objectValueRegex.exec(content)) !== null) {
          const text = match[1].trim();
          if (text) texts.add(text);
        }

        // 3. Match template literals
        const templateLiteralRegex = /`([^`]+)`/g;
        while ((match = templateLiteralRegex.exec(content)) !== null) {
          const text = match[1].trim();
          if (text) texts.add(text);
        }
      }

      if (DEBUG) {
        console.log(
          `\nExtracted ${searchType === "1" ? "keys" : "values"} from file:`
        );
        texts.forEach((text) => console.log(`- "${text}"`));
      }

      return Array.from(texts);
    } catch (error) {
      console.error("Error extracting text content:", error);
      return Array.from(texts);
    }
  }

  /**
   * Scans source files for text content
   * @param {string} dir - Directory to scan
   * @param {string} searchType - Type of search (1 for keys only, 2 for values)
   */
  async scanSourceFiles(dir, searchType) {
    const files = await glob(this.config.searchPaths, {
      ignore: "node_modules/**",
      recursive: this.config.recursive,
    });

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");
      const textContent = this.extractTextContent(content, searchType);
      this.checkUntranslatedText(textContent, filePath, searchType);
    }
  }

  /**
   * Checks if text content exists in JSON values or keys
   * @param {string[]} texts - Array of text content
   * @param {string} filePath - Source file path
   * @param {string} searchType - Type of search (1 for keys only, 2 for values)
   */
  checkUntranslatedText(texts, filePath, searchType) {
    texts.forEach((text) => {
      if (searchType === "1") {
        // Check translation keys only
        if (text.startsWith("__KEY__:")) {
          const key = text.replace("__KEY__:", "");
          if (DEBUG) console.log(`Checking translation key: "${key}"`);

          const keyExists = Array.from(this.jsonKeys.keys()).some(
            (jsonKey) => jsonKey === key
          );

          if (DEBUG) console.log(`Key exists in JSON: ${keyExists}`);

          if (!keyExists) {
            if (!this.unmatchedText.has(key)) {
              this.unmatchedText.set(key, new Set());
            }
            this.unmatchedText.get(key).add(filePath);
          }
        }
      } else if (searchType === "2") {
        // Check text values
        const normalizedText = text.toLowerCase().trim();

        if (
          !normalizedText ||
          normalizedText.length <= 1 ||
          /^\d+$/.test(normalizedText)
        ) {
          return;
        }

        const existsInJson = Array.from(this.jsonValues).some(
          (jsonValue) => jsonValue.toLowerCase().trim() === normalizedText
        );

        if (!existsInJson) {
          if (!this.unmatchedText.has(text)) {
            this.unmatchedText.set(text, new Set());
          }
          this.unmatchedText.get(text).add(filePath);
        }
      }
    });
  }

  /**
   * Checks content for key usage
   * @param {string} content - File content
   * @param {string} filePath - Path of the file being checked
   */
  checkKeyUsage(content, filePath) {
    for (const [key, usage] of this.jsonKeys) {
      if (content.includes(key)) {
        usage.usedIn.push(filePath);
      }
    }
  }

  /**
   * Generates comprehensive report
   * @returns {Object} Report of unused keys and untranslated text
   */
  generateReport() {
    const report = {
      unusedKeys: [],
      usedKeys: [],
      untranslatedText: {
        hardcoded: [],
        missingTranslations: [],
      },
      summary: {},
    };

    // Process keys
    for (const [key, usage] of this.jsonKeys) {
      if (usage.usedIn.length === 0) {
        report.unusedKeys.push({
          key,
          definedIn: usage.definedIn,
        });
      } else {
        report.usedKeys.push({
          key,
          definedIn: usage.definedIn,
          usedIn: usage.usedIn,
        });
      }
    }

    // Process untranslated text
    for (const [text, files] of this.unmatchedText) {
      const isTranslationKey = Array.from(this.translationFunctions).some(
        (func) =>
          Array.from(files).some(
            (file) =>
              file.includes(`${func}("${text}")`) ||
              file.includes(`${func}('${text}')`)
          )
      );

      const target = isTranslationKey
        ? report.untranslatedText.missingTranslations
        : report.untranslatedText.hardcoded;

      target.push({
        text,
        foundIn: Array.from(files),
      });
    }

    report.summary = {
      totalKeys: this.jsonKeys.size,
      unusedKeys: report.unusedKeys.length,
      usedKeys: report.usedKeys.length,
      untranslatedText: {
        hardcoded: report.untranslatedText.hardcoded.length,
        missingTranslations: report.untranslatedText.missingTranslations.length,
      },
    };

    return report;
  }
}

/**
 * Handles JSON cleanup option
 * @param {JsonKeyChecker} checker - Instance of JsonKeyChecker
 */
async function handleJsonCleanup(checker) {
  console.log("\nScanning JSON files for unused keys...");
  await checker.scanJsonFiles(checker.config.srcDir);
  await checker.scanSourceFiles(checker.config.srcDir, "1");

  const report = checker.generateReport();

  if (report.unusedKeys.length === 0) {
    console.log("\nNo unused keys found in JSON files.");
    return;
  }

  console.log(`\nFound ${report.unusedKeys.length} unused keys:`);
  for (const { key, definedIn } of report.unusedKeys) {
    console.log(`\nKey: "${key}"`);
    console.log(`Defined in: ${definedIn.join(", ")}`);

    const answer = await question("Delete this key? (y/n): ");
    if (answer.toLowerCase() === "y") {
      for (const filePath of definedIn) {
        try {
          const content = await fs.readFile(filePath, "utf8");
          const json = JSON.parse(content);

          // Remove the key (handling nested keys)
          const keyParts = key.split(".");
          let current = json;
          for (let i = 0; i < keyParts.length - 1; i++) {
            current = current[keyParts[i]];
          }
          delete current[keyParts[keyParts.length - 1]];

          // Write back to file
          await fs.writeFile(filePath, JSON.stringify(json, null, 2));
          console.log(`Deleted key from ${filePath}`);
        } catch (error) {
          console.error(`Error updating ${filePath}:`, error.message);
        }
      }
    }
  }
}

/**
 * Handles untranslated text check option
 * @param {JsonKeyChecker} checker - Instance of JsonKeyChecker
 */
async function handleUntranslatedCheck(checker) {
  console.log("\nScanning files for untranslated text...");
  await checker.scanJsonFiles(checker.config.srcDir);
  await checker.scanSourceFiles(checker.config.srcDir, "1");

  const report = checker.generateReport();

  const { hardcoded, missingTranslations } = report.untranslatedText;

  if (hardcoded.length === 0 && missingTranslations.length === 0) {
    console.log("\nNo untranslated text found.");
    return;
  }

  if (hardcoded.length > 0) {
    console.log("\nHardcoded Text Found:");
    console.log("====================");
    hardcoded.forEach(({ text, foundIn }) => {
      console.log(`Text: "${text}"`);
      console.log(`Found in: ${foundIn.join(", ")}`);
      console.log("---");
    });
  }

  if (missingTranslations.length > 0) {
    console.log("\nMissing Translations:");
    console.log("===================");
    missingTranslations.forEach(({ text, foundIn }) => {
      console.log(`Key: "${text}"`);
      console.log(`Used in: ${foundIn.join(", ")}`);
      console.log("---");
    });
  }
}

/**
 * Shows menu and handles user selection
 */
async function showMenu() {
  console.log("\nJSON Key Checker Menu:");
  console.log("1. Check and clean unused JSON keys");
  console.log("2. Check for untranslated text in files");
  console.log("3. Check and add missing translations to JSON");
  console.log("4. Exit");

  const answer = await question("\nSelect an option (1-4): ");
  return answer.trim();
}

/**
 * Handles adding translations to JSON files
 * @param {JsonKeyChecker} checker - Instance of JsonKeyChecker
 */
async function handleAddTranslations(checker) {
  console.log("\nSelect search type:");
  console.log("1. Search by translation keys only (e.g., t('key'))");
  console.log("2. Search by text values (arrays, objects, template literals)");

  const searchType = await question("\nSelect an option (1-2): ");

  if (searchType !== "1" && searchType !== "2") {
    console.log("Invalid option selected.");
    return;
  }

  console.log("\nScanning files...");

  // Clear previous scans
  checker.jsonKeys.clear();
  checker.jsonValues.clear();
  checker.unmatchedText.clear();

  await checker.scanJsonFiles(checker.config.srcDir);
  await checker.scanSourceFiles(checker.config.srcDir, searchType);

  const report = checker.generateReport();
  const { hardcoded, missingTranslations } = report.untranslatedText;

  if (hardcoded.length === 0 && missingTranslations.length === 0) {
    console.log("\nNo untranslated text found.");
    return;
  }

  // Get available JSON files
  const jsonFiles = await glob(checker.config.jsonPaths, {
    ignore: "node_modules/**",
    recursive: checker.config.recursive,
  });

  if (jsonFiles.length === 0) {
    console.log("\nNo JSON files found. Creating a new one...");
    const createNew = await question(
      "Create new translations.json file? (y/n): "
    );
    if (createNew.toLowerCase() === "y") {
      const newFile = path.join(checker.config.srcDir, "translations.json");
      await fs.writeFile(newFile, "{}");
      jsonFiles.push(newFile);
      console.log(`Created ${newFile}`);
    } else {
      return;
    }
  }

  console.log("\nAvailable JSON files:");
  jsonFiles.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });

  // Process hardcoded text
  if (hardcoded.length > 0) {
    console.log("\nHardcoded Text Found:");
    console.log("====================");

    for (const { text, foundIn } of hardcoded) {
      console.log(`\nText: "${text}"`);
      console.log(`Found in: ${foundIn.join(", ")}`);

      const addTranslation = await question(
        "Add this text to translations? (y/n): "
      );
      if (addTranslation.toLowerCase() === "y") {
        const fileIndex = await question(
          `Select JSON file number (1-${jsonFiles.length}): `
        );
        const selectedFile = jsonFiles[parseInt(fileIndex) - 1];

        if (selectedFile) {
          const keyName = await question(
            "Enter key name for this translation: "
          );
          try {
            let json = {};
            try {
              const content = await fs.readFile(selectedFile, "utf8");
              json = JSON.parse(content);
            } catch (error) {
              // If file doesn't exist or is empty, start with empty object
              json = {};
            }

            // Handle nested keys (e.g., "common.button.submit")
            const keyParts = keyName.split(".");
            let current = json;

            // Create nested structure if needed
            for (let i = 0; i < keyParts.length - 1; i++) {
              const part = keyParts[i];
              if (!current[part]) {
                current[part] = {};
              }
              current = current[part];
            }

            // Add the translation
            current[keyParts[keyParts.length - 1]] = text;

            // Write back to file with proper formatting
            await fs.writeFile(
              selectedFile,
              JSON.stringify(json, null, 2) + "\n"
            );
            console.log(`Added translation to ${selectedFile}`);
          } catch (error) {
            console.error(`Error updating ${selectedFile}:`, error.message);
          }
        } else {
          console.log("Invalid file number selected.");
        }
      }
    }
  }

  // Process missing translations
  if (missingTranslations.length > 0) {
    console.log("\nMissing Translations:");
    console.log("===================");

    for (const { text, foundIn } of missingTranslations) {
      console.log(`\nKey: "${text}"`);
      console.log(`Used in: ${foundIn.join(", ")}`);

      const addTranslation = await question(
        "Add this translation key? (y/n): "
      );
      if (addTranslation.toLowerCase() === "y") {
        const fileIndex = await question(
          `Select JSON file number (1-${jsonFiles.length}): `
        );
        const selectedFile = jsonFiles[parseInt(fileIndex) - 1];

        if (selectedFile) {
          const translationText = await question("Enter translation text: ");
          try {
            const content = await fs.readFile(selectedFile, "utf8");
            const json = JSON.parse(content);

            // Handle nested keys
            const keyParts = text.split(".");
            let current = json;

            // Create nested structure if needed
            for (let i = 0; i < keyParts.length - 1; i++) {
              const part = keyParts[i];
              if (!current[part]) {
                current[part] = {};
              }
              current = current[part];
            }

            // Add the translation
            current[keyParts[keyParts.length - 1]] = translationText;

            // Write back to file
            await fs.writeFile(selectedFile, JSON.stringify(json, null, 2));
            console.log(`Added translation to ${selectedFile}`);
          } catch (error) {
            console.error(`Error updating ${selectedFile}:`, error.message);
          }
        } else {
          console.log("Invalid file number selected.");
        }
      }
    }
  }
}

/**
 * Main function to run the key checker
 */
async function main() {
  try {
    const config = await readConfig();
    const checker = new JsonKeyChecker(config);

    while (true) {
      const choice = await showMenu();

      switch (choice) {
        case "1":
          await handleJsonCleanup(checker);
          break;

        case "2":
          await handleUntranslatedCheck(checker);
          break;

        case "3":
          await handleAddTranslations(checker);
          break;

        case "4":
          console.log("Goodbye!");
          rl.close();
          return;

        default:
          console.log("Invalid option. Please try again.");
      }

      console.log("\nPress Enter to continue...");
      await question("");
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    rl.close();
  }
}

// Run the checker
main();

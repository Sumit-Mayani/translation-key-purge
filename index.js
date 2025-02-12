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

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");
      const jsonData = JSON.parse(content);

      // Extract both keys and values
      this.extractJsonData(jsonData, "", filePath);
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
   * @returns {string[]} Array of text content
   */
  extractTextContent(content) {
    const texts = [];

    try {
      // 1. Match array strings - improved regex
      const arrayStringRegex =
        /\[\s*(["'][^"']*["']\s*(?:,\s*["'][^"']*["']\s*)*)\]/g;
      let match;
      while ((match = arrayStringRegex.exec(content)) !== null) {
        const arrayContent = match[1];
        const stringMatches = arrayContent.match(/["']([^"']+)["']/g) || [];
        stringMatches.forEach((str) => {
          // Remove quotes and trim
          const cleanStr = str.replace(/^["']|["']$/g, "").trim();
          if (cleanStr) texts.push(cleanStr);
        });
      }

      // 2. Match object string values - improved regex
      const objectValueRegex = /:\s*["']([^"']+)["']/g;
      while ((match = objectValueRegex.exec(content)) !== null) {
        const text = match[1].trim();
        if (text) texts.push(text);
      }

      // 3. Match template literals - improved regex
      const templateLiteralRegex = /`([^`]+)`/g;
      while ((match = templateLiteralRegex.exec(content)) !== null) {
        const text = match[1].trim();
        if (text) texts.push(text);
      }

      // 4. Match JSX text content
      const jsxTextRegex = />([^<>{}]+)</g;
      while ((match = jsxTextRegex.exec(content)) !== null) {
        const text = match[1].trim();
        if (text && !text.startsWith("{") && !text.endsWith("}")) {
          texts.push(text);
        }
      }

      // 5. Match translation function calls
      for (const funcName of this.translationFunctions) {
        const translationRegex = new RegExp(
          `${funcName}\\s*\\(\\s*["']([^"']+)["']\\s*\\)`,
          "g"
        );
        while ((match = translationRegex.exec(content)) !== null) {
          const text = match[1].trim();
          if (text) texts.push(text);
        }
      }

      // Debug logging
      if (texts.length > 0) {
        console.log("\nExtracted texts from file:");
        texts.forEach((text) => console.log(`- "${text}"`));
      }

      return [...new Set(texts)]; // Remove duplicates
    } catch (error) {
      console.error("Error extracting text content:", error);
      return texts;
    }
  }

  /**
   * Scans source files for text content
   * @param {string} dir - Directory to scan
   */
  async scanSourceFiles(dir) {
    const files = await glob(this.config.searchPaths, {
      ignore: "node_modules/**",
      recursive: this.config.recursive,
    });

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");

      // Check for key usage
      this.checkKeyUsage(content, filePath);

      // Check for untranslated text
      const textContent = this.extractTextContent(content);
      this.checkUntranslatedText(textContent, filePath);
    }
  }

  /**
   * Checks if text content exists in JSON values
   * @param {string[]} texts - Array of text content
   * @param {string} filePath - Source file path
   */
  checkUntranslatedText(texts, filePath) {
    texts.forEach((text) => {
      const normalizedText = text.toLowerCase().trim();

      // Skip if text is empty, single character, or just numbers
      if (
        !normalizedText ||
        normalizedText.length <= 1 ||
        /^\d+$/.test(normalizedText)
      ) {
        return;
      }

      // Check if text exists as a value in JSON files
      const existsInJson = Array.from(this.jsonValues).some(
        (jsonValue) => jsonValue.toLowerCase().trim() === normalizedText
      );

      // Only add to unmatchedText if it doesn't exist in JSON
      if (!existsInJson) {
        if (!this.unmatchedText.has(text)) {
          this.unmatchedText.set(text, new Set());
        }
        this.unmatchedText.get(text).add(filePath);
      }

      if (DEBUG) {
        console.log(`Checking text: "${text}"`);
        console.log(`Exists in JSON: ${existsInJson}`);
        console.log(`JSON values:`, Array.from(this.jsonValues));
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
  await checker.scanSourceFiles(checker.config.srcDir);

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
  await checker.scanSourceFiles(checker.config.srcDir);

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
  console.log("\nScanning files for untranslated text...");

  // Clear previous scans
  checker.jsonKeys.clear();
  checker.jsonValues.clear();
  checker.unmatchedText.clear();

  await checker.scanJsonFiles(checker.config.srcDir);
  await checker.scanSourceFiles(checker.config.srcDir);

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

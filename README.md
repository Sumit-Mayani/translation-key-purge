# Translation Key Purge

A tool to automatically detect and remove unused translation keys from i18n files across multiple projects, helping maintain clean and efficient localization in React.js and Next.js.

## Features

- Detect unused translation keys in your project
- Remove unused translation keys from JSON files
- Find untranslated text in your source files
- Support for:
  - Array strings
  - Object values
  - Template literals (backtick strings)
  - JSX text content
  - Translation function calls
- Supports React.js and Next.js projects
- Interactive CLI interface

## Installation

You can install the package using [npm](https://docs.npmjs.com/cli/v8/commands/npm-install):

```bash
npm install translation-key-purge
```

Or using yarn:

```bash
yarn add translation-key-purge
```

## Configuration

Create a `translation-key-purge.config.json` file in your project root:

```json
{
  "srcDir": "src",
  "jsonPaths": ["src/**/*.json"],
  "searchPaths": ["src/**/*.{js,jsx,ts,tsx}"],
  "fileExtensions": [".js", ".jsx", ".ts", ".tsx"],
  "recursive": true,
  "translationFunctions": ["t", "i18n", "translate"]
}
```

### Configuration Options

- `srcDir`: Base directory for scanning (default: "src")
- `jsonPaths`: Glob patterns for JSON files to check
- `searchPaths`: Glob patterns for source files to scan
- `fileExtensions`: File extensions to process
- `recursive`: Whether to scan subdirectories
- `translationFunctions`: Translation function names to detect

## Usage

1. Add the script to your `package.json`:

```json
{
  "scripts": {
    "check-translations": "translation-key-purge"
  }
}
```

2. Run the tool:

```bash
npm run check-translations
```

3. Choose from the available options:
   - Check and clean unused JSON keys
   - Check for untranslated text in files
   - Check and add missing translations to JSON
   - Exit

### Features in Detail

#### 1. Clean Unused Keys

- Scans JSON files for unused translation keys
- Interactive prompts to delete unused keys
- Safe deletion with confirmation

#### 2. Find Untranslated Text

- Detects hardcoded text in:
  - JSX content
  - Array strings
  - Object values
  - Template literals
- Shows file locations for each instance

#### 3. Add Missing Translations

- Interactive workflow to add translations
- Supports nested JSON structures
- Multiple JSON file support

## Examples

### Detecting Untranslated Text

The tool will detect text in various formats:

```jsx
const Component = () => {
  const array = ["Text 1", "Text 2"]; // ✓ Detected
  const obj = { key: "Text 3" }; // ✓ Detected
  const text = `Text 4`; // ✓ Detected

  return (
    <div>
      Hardcoded text {/* ✓ Detected */}
      {t("translated.key")} {/* ✓ Checked against JSON */}
    </div>
  );
};
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Author

Sumit Mayani

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

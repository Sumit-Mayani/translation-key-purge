# Translation Key Purge

A tool to automatically detect and remove unused translation keys from i18n files across multiple projects, helping maintain clean and efficient localization in React.js and Next.js.

## Features

- Detect unused translation keys in your project.
- Remove unused translation keys from JSON files.
- Supports React.js and Next.js projects.

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

Create a `sumit.config.json` file in the root of your project to customize the behavior of the package.

```json
{
  "functionName": "t",
  "languageCode": "en"
}
```

- `functionName`: The function name used for translation keys in your code `(default: t)`.

- `languageCode`: The language code for the JSON file to check `(default: en)`.

## Usage

1. Create a `sumit.config.json` file in the root of your project with the desired configuration.

2. Add the following script to your `package.json`:

```json
"scripts": {
  "check-keys": "translation-key-purge start"
}
```

3. Run the script in your `terminal`:

```bash
npm run check-keys
```

4. Follow the prompts to remove unused translation keys.

## License

This project is licensed under the ISC License. See the LICENSE file for details.

## Author

Sumit Mayani

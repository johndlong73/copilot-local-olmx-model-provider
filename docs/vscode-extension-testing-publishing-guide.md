# VS Code Extension: Testing, Publishing, Bundling & CI

A tutorial and implementation plan for the oMLX (copilot-local-model-provider) extension, based on the official VS Code Extension API documentation.

**Source documentation:**
- [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)

---

## Table of Contents

1. [Publisher Identity](#1-publisher-identity)
2. [Packaging (VSIX)](#2-packaging-vsix)
3. [Bundling](#3-bundling)
4. [Testing](#4-testing)
5. [Publishing to the Marketplace](#5-publishing-to-the-marketplace)
6. [Continuous Integration](#6-continuous-integration)
7. [Project Checklist](#7-project-checklist)

---

## 1. Publisher Identity

**Important:** The publisher identifies *you* (the extension author), not the technology your extension connects to. For this project, the publisher should be your identity, not oMLX—oMLX is the server technology hosting the models; you own this extension.

### Create a publisher

1. Go to the [Visual Studio Marketplace publisher management page](https://marketplace.visualstudio.com/manage).
2. Log in with a Microsoft account.
3. Click **Create publisher**.
4. Set:
   - **ID**: Unique identifier (e.g., your GitHub username, `jlo`, or a custom ID). **Cannot be changed once created.**
   - **Name**: Display name shown in the Marketplace (e.g., your name or brand).

### Update this project

In `package.json`, replace `"publisher": "your-publisher-id"` with your actual publisher ID:

```json
"publisher": "YOUR_ACTUAL_PUBLISHER_ID"
```

---

## 2. Packaging (VSIX)

VSIX is the installable format for VS Code extensions. You can share a `.vsix` file without publishing to the Marketplace.

### How to package

```bash
npm run vsix
```

This runs `vsce package`, which:

1. Invokes `vscode:prepublish` (runs `npm run package`)
2. Bundles with webpack in production mode
3. Creates `copilot-local-model-provider-0.0.1.vsix` in the project root

### How others install a VSIX

**From VS Code:**
1. Open Extensions view (⇧⌘X)
2. Click **Views and More Actions** (⋯)
3. Choose **Install from VSIX...**
4. Select the `.vsix` file

**From the command line:**
```bash
code --install-extension copilot-local-model-provider-0.0.1.vsix
```

---

## 3. Bundling

Bundling combines many source files into a single output file. Benefits:

- Faster load times for the extension
- Required for VS Code for Web (github.dev, vscode.dev)
- Smaller published package (no `node_modules` shipped)

### This project: webpack

The project already uses **webpack** with `ts-loader`:

| Script | Purpose |
|--------|---------|
| `npm run compile` | Development build (with source maps) |
| `npm run watch` | Watch mode for development |
| `npm run package` | Production build (minified, hidden source maps) |

`vscode:prepublish` runs `package` before `vsce package` or `vsce publish`.

### .vscodeignore

Excludes files from the packaged extension. The current `.vscodeignore` excludes:

- Source files (`src/`, `**/*.ts`)
- Build config (`webpack.config.js`, `tsconfig.json`)
- Dev output (`out/`, `node_modules/`)
- IDE and test config (`.vscode/`, `.vscode-test/`)

Only `dist/extension.js` and manifest/assets are included. This is correct for a bundled extension.

### Alternative: esbuild

The docs also describe **esbuild** as a faster, simpler option. Migration is optional; webpack is fine for this project.

---

## 4. Testing

VS Code extension tests run inside an **Extension Development Host** instance with full API access (integration tests).

### Quick setup: test CLI

The project already has:

- `@vscode/test-cli` and `@vscode/test-electron`
- `"test": "vscode-test"` in `package.json`
- `pretest`: compile-tests, compile, lint

### Configuration: .vscode-test.js

`vscode-test` looks for `.vscode-test.js`, `.vscode-test.mjs`, or `.vscode-test.cjs` in the project root. Example:

```javascript
// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  files: 'out/test/**/*.test.js',
  version: 'stable',
  workspaceFolder: './sampleWorkspace',  // optional
  mocha: {
    ui: 'tdd',
    timeout: 20000
  }
});
```

**Note:** The project uses webpack and outputs to `dist/`. Tests are compiled separately to `out/` via `compile-tests`. Ensure `files` points to where tests end up (e.g., `out/test/**/*.test.js`).

### Run tests

```bash
npm test
```

Or use **Test: Run All Tests** in VS Code (requires the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner) extension).

### Debug tests

Add to `.vscode/launch.json`:

```json
{
  "name": "Extension Tests",
  "type": "extensionHost",
  "request": "launch",
  "runtimeExecutable": "${execPath}",
  "args": [
    "--extensionDevelopmentPath=${workspaceFolder}",
    "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
  ],
  "outFiles": ["${workspaceFolder}/out/test/**/*.js"],
  "preLaunchTask": "npm: compile-tests"
}
```

To avoid loading other extensions:

```json
"args": [
  "--disable-extensions",
  "--extensionDevelopmentPath=${workspaceFolder}",
  "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
]
```

### Tips

1. **CLI limitation:** Running `npm test` from the terminal requires no other VS Code instance using the same version. Use VS Code Insiders for development and Stable for CLI tests, or run tests from the debugger instead.
2. **Linux CI:** Headless Linux needs `xvfb` to run VS Code. See [Continuous Integration](#6-continuous-integration).

---

## 5. Publishing to the Marketplace

### Prerequisites

1. **Publisher:** Created at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage).
2. **Personal Access Token (PAT):**
   - [Azure DevOps portal](https://go.microsoft.com/fwlink/?LinkId=307137) → User settings → Personal access tokens
   - Create token with **Marketplace** → **Manage** scope
   - Organization: **All accessible organizations**

### Login

```bash
vsce login YOUR_PUBLISHER_ID
```

Enter the PAT when prompted.

### Publish

```bash
vsce publish
```

Or with version bump:

```bash
vsce publish minor    # 0.0.1 → 0.1.0
vsce publish 1.0.0    # Set explicit version
```

In a git repo, `vsce publish` can create a version commit and tag via `npm-version`.

### Marketplace presentation

Improve how the extension appears on the Marketplace:

| Item | Location |
|------|----------|
| `README.md` | Extension page content |
| `LICENSE` | License text |
| `CHANGELOG.md` | Version history |
| `repository` in package.json | GitHub link (enables relative link resolution) |
| `icon` | PNG, 128×128px minimum |
| `galleryBanner.color` | Hex color for Marketplace banner |
| `pricing` | `"Free"` or `"Trial"` |
| `sponsor.url` | e.g. `https://github.com/sponsors/username` |

### Packaging vs publishing

- **Packaging** (`vsce package`): Creates a `.vsix` for local/private sharing.
- **Publishing** (`vsce publish`): Publishes to the public Marketplace.

### vsce constraints

- Icon in `package.json` cannot be SVG.
- `README.md` and `CHANGELOG.md` images must use HTTPS.
- User-provided SVGs are not allowed.

---

## 6. Continuous Integration

Run tests and optionally publish from CI (GitHub Actions, Azure Pipelines, GitLab CI).

### GitHub Actions (recommended for GitHub repos)

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run compile
      - run: npm test
        env:
          DISPLAY: ':99.0'  # Linux headless
        # On Linux, wrap with: xvfb-run -a npm test
```

**Linux:** Use `xvfb-run -a npm test` on Ubuntu runners.

### Automated publishing (GitHub Actions)

1. Add `VSCE_PAT` as a [GitHub Actions secret](https://docs.github.com/actions/security-guides/encrypted-secrets).
2. Add `"deploy": "vsce publish"` to `package.json` scripts (use `--no-dependencies` if needed).
3. Trigger on release or tags:

```yaml
on:
  release:
    types: [published]
# or
  push:
    tags: ['v*']
```

4. Publish step:

```yaml
- name: Publish
  if: success()
  run: npm run deploy
  env:
    VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

---

## 7. Project Checklist

Use this checklist for the oMLX extension before sharing or publishing.

### Before first share (VSIX)

- [ ] Replace `"publisher": "your-publisher-id"` in `package.json` with your publisher ID
- [ ] Run `npm run vsix` and verify `copilot-local-model-provider-0.0.1.vsix` is created
- [ ] Install the VSIX in a separate VS Code profile and smoke-test
- [ ] (Optional) Add `LICENSE` file
- [ ] (Optional) Add `repository` to `package.json` if you have a public repo

### Before Marketplace publish

- [ ] Create publisher at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
- [ ] Create PAT with Marketplace → Manage scope
- [ ] Run `vsce login YOUR_PUBLISHER_ID`
- [ ] Ensure `README.md` is present and accurate
- [ ] Add `CHANGELOG.md` with version history
- [ ] Add `LICENSE` file
- [ ] Add `repository` in `package.json` (if public)
- [ ] Resolve vsce warnings (e.g. `--allow-missing-repository` if not using a repo)
- [ ] Run `vsce publish` (or `vsce publish patch` for a version bump)

### Testing

- [ ] Create `.vscode-test.js` if not present (see [Testing](#4-testing))
- [ ] Add/update test files under `src/test/` or equivalent
- [ ] Run `npm test` (close other VS Code instances first, or use debugger)
- [ ] Add Extension Tests launch config to `.vscode/launch.json` for debugging

### Bundling

- [ ] Confirm `npm run package` produces `dist/extension.js`
- [ ] Confirm `.vscodeignore` excludes source and dev files
- [ ] Verify packaged VSIX contains only needed files

### CI (optional)

- [ ] Add GitHub Actions (or other CI) workflow
- [ ] Run tests on push/PR
- [ ] (Optional) Add automated publish on release

---

## Quick Reference

| Task | Command |
|------|---------|
| Build (dev) | `npm run compile` |
| Build (prod) | `npm run package` |
| Create VSIX | `npm run vsix` |
| Run tests | `npm test` |
| Login to Marketplace | `vsce login YOUR_PUBLISHER_ID` |
| Publish | `vsce publish` |
| Publish with version bump | `vsce publish minor` |

---

*Last updated: March 2025. Based on VS Code Extension API docs as of that date.*

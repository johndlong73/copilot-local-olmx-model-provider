# oMLX Copilot Chat Extension

Bring local oMLX models into VS Code Copilot Chat. This extension integrates oMLX (a local MLX inference server) with VS Code's Copilot Chat, allowing you to use locally hosted models for chat interactions.

## Features

- **Local Model Integration**: Use locally hosted oMLX models in Copilot Chat
- **Model Discovery**: Lists oMLX models in the Copilot Chat picker (browse and download via oMLX admin dashboard at `/admin`)
- **Model Selection**: Choose from available oMLX models in chat; load/unload and configure settings via oMLX admin dashboard
- **OpenAI-Compatible API**: Uses oMLX's OpenAI-compatible chat completions API
- **Streaming Support**: Real-time response streaming from local models

## Requirements

- [oMLX](https://github.com/jundot/omlx) server running locally
- VS Code 1.110 or higher
- Python 3.10+ (for oMLX)
- Apple Silicon (M1/M2/M3/M4) - oMLX requires macOS

### Installing oMLX

#### Option 1: macOS App (Recommended)

Download the `.dmg` from [oMLX Releases](https://github.com/jundot/omlx/releases), drag to Applications, and launch. The app includes auto-update and runs oMLX automatically.

#### Option 2: Homebrew

```bash
brew tap jundot/omlx https://github.com/jundot/omlx
brew install omlx

# Start as a background service (auto-restarts on crash)
brew services start omlx
```

#### Option 3: From Source

```bash
git clone https://github.com/jundot/omlx.git
cd omlx
pip install -e ".[dev]"   # With development dependencies
```

### Starting oMLX Server

The oMLX server discovers models from your model directory and serves them via an OpenAI-compatible API on port 8000.

**macOS App**: Launch oMLX from your Applications folder. The Welcome screen guides you through model directory setup.

**Homebrew Service**:
```bash
brew services start omlx
```

**CLI**:
```bash
# Default: models from ~/.omlx/models, port 8000
omlx serve

# Custom model directory
omlx serve --model-dir ~/models

# With API key authentication
omlx serve --model-dir <model-dir> --api-key your-secret-key
```

**From Source**:
```bash
cd omlx
source .venv/bin/activate  # If using venv
omlx serve --model-dir <model-dir>
```

The server runs on `http://localhost:8000` by default. The admin dashboard is available at `http://localhost:8000/admin`.

## Extension Settings

This extension contributes the following settings:

| Setting | Description | Default |
|---------|-------------|---------|
| `omlx.serverUrl` | URL of the oMLX server | `http://localhost:8000` |
| `omlx.apiKey` | API key for oMLX (if configured) | (empty) |

## Commands

| Command | Description |
|---------|-------------|
| `oMLX: Manage Models` | Open Copilot Chat (model picker) |
| `oMLX: Check Server Health` | Check if oMLX server is running |

## Using oMLX Models in Copilot Chat

### Step 1: Install and Start oMLX

Before using this extension, you must have oMLX installed and running:

1. **Install oMLX** using one of the methods above
2. **Start oMLX**:
   - **macOS App**: Launch from Applications folder
   - **Homebrew**: `brew services start omlx`
   - **CLI**: `omlx serve --model-dir ~/models`

3. **Verify oMLX is running** by opening `http://localhost:8000` in your browser

### Step 2: Install the oMLX Copilot Chat Extension

1. Open VS Code
2. Go to Extensions (`Cmd+Shift+X`)
3. Search for "oMLX" or install from VS Code Marketplace
4. Reload VS Code if prompted

### Step 3: Configure the Extension (Optional)

If oMLX is running on a custom port or has API key authentication:

1. Open VS Code Settings (`Cmd+,`)
2. Search for "oMLX"
3. Configure:
   - **Server URL**: e.g., `http://localhost:8000`
   - **API Key**: If configured in oMLX

### Step 4: Browse and Download Models

Models are managed through oMLX's admin dashboard:

1. **Open oMLX Admin Dashboard**: `http://localhost:8000/admin`
2. **Browse Models**: Click "Model Downloader" in the sidebar
3. **Search HuggingFace**: Type model name (e.g., `Qwen3`, `DeepSeek`)
4. **Download Model**: Click download on a model
5. **Model Location**: Models are saved to `~/.omlx/models/` or your configured directory

### Step 5: Load Models into Memory

Models load on-demand when you select one in Copilot Chat and send a message. You can also pre-load in the oMLX admin dashboard:

1. **View Loaded Models**: Models appear in the main dashboard
2. **Load a Model**: Click the model card to load it (or rely on on-demand loading when you chat)
3. **Model Status**: Green badge = loaded, Gray = not loaded

### Step 6: Use Models in Copilot Chat

1. **Open Copilot Chat**: Press `Cmd+Shift+P` → "Copilot Chat"
2. **Select Model**: Click the model dropdown in the chat header
3. **Choose oMLX Model**: Select from your loaded models
4. **Start Chatting**: Type your message and press Enter

### Step 7: Configure Model Settings (Optional)

Per-model settings are configured in oMLX admin dashboard:

1. **Open Model Settings**: Click the gear icon on a model card
2. **Configure**:
   - **Context Length**: Max tokens for context
   - **Temperature**: Sampling temperature (0.0 - 1.0)
   - **Top P**: Nucleus sampling
   - **Model Alias**: Custom name for the model

## Development

```bash
# Install dependencies
npm install

# Build extension
npm run compile

# Package for distribution
npm run package

# Run tests
npm test
```

## Known Issues

- Requires oMLX server to be running before use
- Model list uses oMLX admin API when available (with fallback to `/v1/models`); per-model context size is only available when admin API is accessible

## Release Notes

### 1.0.0

Initial release of oMLX Copilot Chat Extension.

- Local oMLX model integration
- Model discovery (lists oMLX models in Copilot Chat picker)
- OpenAI-compatible API support
- Streaming response support

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  VS Code        │     │  oMLX Server     │     │  MLX Models  │
│  Copilot Chat   │────▶│  (port 8000)     │────▶│  (local)     │
│  (this ext)     │     │  OpenAI API      │     │              │
└─────────────────┘     └──────────────────┘     └──────────────┘
```

The extension implements VS Code's `LanguageModelChatProvider` API and connects to oMLX's OpenAI-compatible API.

## For more information

* [oMLX GitHub](https://github.com/jundot/omlx)
* [VS Code Language Model Chat Provider API](https://code.visualstudio.com/api/references/vscode-api#LanguageModelChatProvider)

**Enjoy using oMLX with Copilot Chat!**
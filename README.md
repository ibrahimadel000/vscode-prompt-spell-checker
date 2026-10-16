# AI Chat Spell Assistant — VS Code Extension 🧩

**The missing spell-checker for AI coding assistant chats, now as a native VS Code extension.**

## ✨ Features

- **Real-time spell checking** — Typos get squiggly underlines as you type
- **💡 Quick Fix suggestions** — Click the lightbulb to see corrections
- **Smart code filtering** — Automatically skips URLs, camelCase, code blocks, file paths, ALL_CAPS
- **Contraction detection** — Flags `dont` → suggests `don't`
- **Custom dictionary** — Right-click to add words you use often
- **Targeted** — Only checks markdown, plaintext, git commits (configurable)
- **Fast & private** — Uses Hunspell dictionary locally, nothing sent to the cloud

## 🚀 Getting Started

### Install from source

```bash
# Clone the repo
git clone <repo-url>
cd ai-chat-spell-vscode

# Install dependencies
npm install

# Compile
npm run compile
```

### Run in development mode

1. Open the project in VS Code
2. Press `F5` (or Run → Start Debugging)
3. A new VS Code window opens with the extension loaded
4. Open any `.md` or `.txt` file and start typing — typos get underlined!

### Package as .vsix

```bash
npm run package
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Q` | **Quick Fix Typos at Cursor** (Instant suggestion popup to replace the word directly in editor) |
| `Alt+W` | **Auto-Fix & Copy** (Zero-UI fast auto-fix with best suggestion and copy to clipboard) |
| `Ctrl+Alt+S` or `Shift+Alt+Q` | **Open Prompt Spell Checker** (Interactive side-by-side text box) |

## ⚙️ Settings

Open VS Code Settings and search for "Spell Assistant":

| Setting | Default | Description |
|---------|---------|-------------|
| `spellAssistant.enabled` | `true` | Enable/disable spell checking |
| `spellAssistant.checkOnType` | `true` | Real-time checking as you type |
| `spellAssistant.debounceMs` | `500` | Delay before checking (ms) |
| `spellAssistant.extraKnownWords` | `[]` | Additional words to accept |
| `spellAssistant.targetLanguages` | `["markdown", "plaintext", ...]` | Languages to check |
| `spellAssistant.ignoreCamelCase` | `true` | Skip camelCase identifiers |
| `spellAssistant.ignoreCodeBlocks` | `true` | Skip fenced/inline code |
| `spellAssistant.ignoreUrls` | `true` | Skip URLs and emails |
| `spellAssistant.ignoreFilePaths` | `true` | Skip file paths |
| `spellAssistant.ignoreAllCaps` | `true` | Skip ALL_CAPS constants |

## 📦 Project Structure

```
src/
├── extension.ts          # Entry point — activation, commands
├── spellEngine.ts        # Core spell-checking (Hunspell via nspell)
├── codeFilters.ts        # Skip patterns (URLs, code, camelCase, etc.)
├── diagnosticsProvider.ts # Squiggly underlines via VS Code Diagnostics API
├── codeActionProvider.ts  # 💡 Quick Fix suggestions
├── userDictionary.ts     # Persistent user dictionary
├── statusBar.ts          # Status bar toggle
└── types.ts              # Shared TypeScript types
```
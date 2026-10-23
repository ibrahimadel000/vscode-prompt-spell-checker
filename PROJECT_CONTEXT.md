# 🧩 AI Chat Spell Assistant — Project Context & Roadmap

## 🎯 Project Goal
Build and publish a **VS Code Extension** to solve the missing spell-checker problem for AI coding assistant prompts (GitHub Copilot Chat, Codex, Antigravity, Cursor, etc.).

Since VS Code extensions cannot directly inject squiggly lines into sidebar chat webviews (due to VS Code's security sandbox), this extension solves the problem with a fast, seamless **Interactive Prompt Spell Checker**:
1. **Instant Cursor Fix (`Alt+Q`):** Place cursor on or select any text in AI Chat to open the interactive prompt spell checker with the selection preloaded.
2. **⚡ Auto-Fix & Auto-Paste (`Alt+W`):** Zero-UI direct auto-replace! Select misspelled text in the Antigravity chat box and press `Alt+W` — it grabs the selection, auto-fixes all typos, and automatically simulates `Ctrl+V` (via `copy_selection.exe --paste`) to replace the text in-place with zero manual pasting needed!
3. **⚡ "Fix & Paste to Chat" (`Ctrl+Shift+Enter` or Button in Alt+Q Webview):** Review prompt, suggestions, and chips in the webview, then click "⚡ Fix & Paste to Chat" to auto-fix and paste clean text directly back into the AI Chat box.
4. **One-Click Direct Copy (`Ctrl+Enter`):** Click **"📋 Copy Clean Prompt"** — copies the clean, typo-free prompt to clipboard.
5. **Native Editor Squigglies:** Also supports real-time diagnostics and lightbulb quick-fixes on `.md`, `.txt`, and unsaved `untitled` scratch tabs.

---

## 🏗️ Architecture & Key Files

| File | Purpose |
|---|---|
| `src/extension.ts` | Extension activation, smart cursor/selection detection, commands, status bar, and keybindings. |
| `src/spellEngine.ts` | Hunspell engine powered by `nspell`, loading dictionary files directly with contraction priority. |
| `src/codeFilters.ts` | Code-aware filters skipping URLs, code blocks, file paths, and camelCase identifiers. |
| `src/promptCheckerWebview.ts` | Webview panel for the interactive prompt text box with live suggestions, copy, and direct "Fix & Paste to Chat". |
| `src/diagnosticsProvider.ts` | Squiggly underline diagnostics for editor and untitled scratch tabs. |
| `src/codeActionProvider.ts` | Lightbulb quick-fix menu for standard editor tabs. |
| `src/userDictionary.ts` | Persistent user dictionary using VS Code `globalState`. |
| `src/types.ts` | Interfaces and `DEFAULT_DEV_WORDS` list. |
| `src/selectionCapture.ts` | Native Windows OS-level selection capture & paste (simulates Ctrl+C and Ctrl+V using lightweight helper to grab/paste text in AI chat inputs/webviews). |
| `bin/copy_selection.exe` | Compiled C# Windows Subsystem helper that releases modifier keys (including Alt, Ctrl, Shift, Q, W) and sends Ctrl+C or Ctrl+V (`--paste`) without stealing focus. |

---

## 📦 Current Release
* Current version: **`0.5.4`**
* Package file: **`ai-chat-spell-assistant-0.5.4.vsix`**
* Test command: `antigravity-ide --install-extension ai-chat-spell-assistant-0.5.4.vsix --force`

---

## 🏛️ Architecture: Pure AI Prompt Proofreader & Local Instant Squiggly Engine (v0.4.0)

### 1. Pure AI Fixing Engine (100% of all Fix Actions)
- **`vscode.lm` Native Language Model:** Zero API keys needed; taps into VS Code / Antigravity IDE's native AI models.
- **LanguageTool REST API:** Seamless grammar, subject-verb agreement (`it retun` → `it returns`), homophones, and punctuation checking via `https://api.languagetool.org/v2/check` or self-hosted server.
- **Custom LLM Endpoint:** Optional support for Groq (`llama-3.3-70b-versatile`), OpenAI, or local Ollama (`localhost:11434`).
- **Silent Offline Fallback:** Gracefully fails over to the local engine if the machine is offline.

### 2. Local Instant 0ms Engine (Squigglies & Offline Safety Net)
- **Hunspell (`nspell`) + Metaphone Phonetic Index:** Sound-alike matching (`pley tannes` → `play tennis`).
- **Google Web N-Gram Frequency Table:** Prioritizes real-world high-frequency verbs and nouns.
- **Code Immunity Shield:** Automatically ignores `camelCase`, `snake_case`, URLs, endpoints, file paths, Markdown code fences, and developer terms.
- **Role:** Exclusively handles 0ms keystroke red underlines as you type, and acts as silent offline failover.

---

## ⌨️ Workflow Shortcuts & Actions

| Shortcut | Action | Description |
|---|---|---|
| `Alt+W` | ✨ **AI Fix & Paste Prompt** | The one universal shortcut: fixes grammar, intent, and typos, then pastes directly into AI Chat. |
| `Alt+Q` | 🔍 **Open Spell Checker Window** | Opens Google Speller text box with live squigglies, suggestions, and token metrics. |
| `Ctrl+Shift+Enter` | ✨ **Fix & Paste to Chat** | From the webview: AI-fixes and pastes prompt directly back into AI Chat. |
| `Ctrl+Enter` | 📋 **Copy Clean Prompt** | Copies clean text to clipboard without closing window. |
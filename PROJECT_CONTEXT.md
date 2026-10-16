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
* Current version: **`0.2.5`**
* Package file: **`ai-chat-spell-assistant-0.2.5.vsix`**
* Test command: `code --install-extension ai-chat-spell-assistant-0.2.5.vsix --force`
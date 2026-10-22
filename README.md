# AI Chat Spell Assistant 🧩

<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="AI Chat Spell Assistant Icon" />
</p>

<p align="center">
  <strong>The Google-grade spell and prompt corrector for AI coding assistant chats in VS Code.</strong><br>
  <em>Never let a typo confuse Copilot, Codex, Antigravity, ChatGPT, or Claude again.</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ibrahimadel.ai-chat-spell-assistant"><img src="https://img.shields.io/badge/VS%20Code-v1.85+-blue.svg?style=flat-square&logo=visual-studio-code" alt="VS Code Compatibility"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Version-v0.4.7-purple.svg?style=flat-square" alt="Version 0.4.7">
  <img src="https://img.shields.io/badge/Offline-100%25%20Private-success.svg?style=flat-square" alt="100% Private Offline">
</p>

---

## ⚡ The Problem & The Solution

When typing prompts into AI chat inputs (Copilot, Codex, ChatGPT, Antigravity), **misspellings and accidental typos degrade LLM reasoning**. Worse, traditional spell checkers only work inside open code editor tabs—they **cannot interact with AI chat input boxes** and fail on contextual malapropisms (`plea tanned` vs `play tennis`).

**AI Chat Spell Assistant** brings desktop-grade, Google Speller-level intelligence directly to your prompts and editors:
- **`Alt+W` Zero-UI Auto-Fix**: Press `Alt+W` anywhere—even directly inside AI Chat boxes—and your prompt is automatically captured, corrected with Google frequency scoring, and pasted back clean.
- **`Alt+Q` Interactive Prompt Checker**: Open a side-by-side interactive panel featuring Google Docs-style red squiggly underlines, live right-click context menus, and one-click fixes.
- **Contextual Collocations**: Catches real-word malapropisms that traditional spell checkers miss (`can't plea tanned` $\rightarrow$ `can't play tennis`, `peace of paper` $\rightarrow$ `piece of paper`).
- **Phonetic Metaphone Matching**: Sound-alike mapping (`tannes` $\rightarrow$ `tennis`, `spller` $\rightarrow$ `speller`, `fone` $\rightarrow$ `phone`).
- **Developer Code Shield**: Preserves `camelCase`, `snake_case`, URLs, markdown code fences, and dev terms (`async`, `await`, `json`, `oauth`, `regex`, etc.).

---

## 🆚 Why AI Chat Spell Assistant?

| Feature | Traditional Linters (Code Spell Checker, etc.) | AI Chat Spell Assistant 🧩 |
| :--- | :---: | :---: |
| **Works Inside AI Chat Boxes** | ❌ No | ✅ **Yes (`Alt+W` instant capture & paste)** |
| **Contextual Collocations** (`can't plea tanned`) | ❌ Fails (both are "valid" words) | ✅ **Corrects to `can't play tennis`** |
| **Phonetic Metaphone Indexing** | ⚠️ Weak / Partial | ✅ **Full-Dictionary Double Metaphone** |
| **Google Web 1T Bayesian Frequency** | ❌ Flat dictionary | ✅ **Ranks common words highest** |
| **Interactive Prompt Checker Webview** | ❌ None | ✅ **Live Red Squiggly Lines & 1-Click Fix** |
| **Developer Code Immunity** | ⚠️ False positives | ✅ **Protects syntax, identifiers & dev keywords** |
| **Privacy & Offline** | 🔒 Local | 🔒 **100% Local (Zero network requests)** |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt+W`** | **Quick Fix & Paste** | Instant zero-UI fix. Auto-captures prompt from AI chat box or editor, corrects typos, and pastes back clean text. |
| **`Alt+Q`** | **Prompt Checker / Quick Fix** | Opens the interactive Prompt Checker panel with highlighted text, or shows suggestion menu at cursor. |
| **`Ctrl+Alt+S`** or<br>**`Shift+Alt+Q`** | **Open Prompt Checker** | Launches the interactive side-by-side prompt review panel. |

---

## 🚀 How to Use

### 1. In AI Chat Boxes (Copilot, Codex, Antigravity, ChatGPT)
1. Type your prompt into the chat box (e.g., `"i dant pley tannes infront of teh club"`).
2. Press **`Alt+W`**.
3. *Boom!* Your prompt is instantly replaced with `"i don't play tennis in front of the club"`.

### 2. In the Interactive Prompt Checker Webview
1. Press **`Alt+Q`** (or `Shift+Alt+Q`).
2. Type or review your prompt in the dedicated panel.
3. Misspelled words are marked with Google-style red wavy underlines.
4. Left-click or right-click any flagged word to select a suggestion, or click **Auto Fix All** to correct everything in one click.
5. Click **Fix & Paste to Chat** (`Ctrl+Shift+Enter`) to close the panel and send the clean prompt straight to your AI assistant.

### 3. In Editor Documents
- Real-time squiggly underlines appear as you type in Markdown, plain text, and git commit files.
- Hover or press `Alt+Q` to accept suggestions directly.

---

## ⚙️ Configuration

Customize the extension in VS Code Settings (`Ctrl+,` $\rightarrow$ search `Spell Assistant`):

```json
{
  "spellAssistant.enabled": true,
  "spellAssistant.checkOnType": true,
  "spellAssistant.debounceMs": 300,
  "spellAssistant.targetLanguages": ["markdown", "plaintext", "git-commit", "scminput"],
  "spellAssistant.ignoreCamelCase": true,
  "spellAssistant.ignoreCodeBlocks": true,
  "spellAssistant.ignoreUrls": true,
  "spellAssistant.ignoreFilePaths": true,
  "spellAssistant.ignoreAllCaps": true,
  "spellAssistant.maxSuggestions": 5,
  "spellAssistant.extraKnownWords": ["myCustomService", "authProvider"]
}
```

---

## 🔒 Privacy & Security

- **100% Local Execution**: All spell-checking, phonetic Metaphone matching, and Google frequency scoring are performed offline using an in-memory dictionary.
- **Zero Cloud Calls**: No text, prompts, or telemetry are ever sent over the network.
- **No Keystroke Logging**: The OS capture helper only runs when you explicitly invoke `Alt+W` or `Alt+Q`.

---

## 📄 License

MIT © [Ibrahim Adel](https://github.com/ibrahimadel000)
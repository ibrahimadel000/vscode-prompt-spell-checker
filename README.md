# AI Chat Spell Assistant 🧩

**The intelligent prompt corrector for AI coding assistant chats in VS Code.**  
*Fix typos, grammar, and contextual slips before they confuse Copilot, Claude, ChatGPT, or Antigravity.*

---

## ⚡ Quick Start: 2 Ways to Fix Prompts

| Workflow | Shortcut | What It Does |
| :--- | :---: | :--- |
| **Instant Auto-Fix & Paste** | <kbd>Alt</kbd> + <kbd>W</kbd> | **Zero UI.** Automatically captures your prompt from the chat box, fixes all misspellings and grammar slips, and pastes back clean text. |
| **Interactive Spell Inspector** | <kbd>Alt</kbd> + <kbd>Q</kbd> | Opens a side-by-side review panel with Google Docs-style squiggly underlines, suggestion chips, and one-click replacement. |

> [!TIP]
> **Works directly inside AI Chat inputs!** Traditional linters only work inside code files. AI Chat Spell Assistant bridges the gap by letting you correct prompts directly inside GitHub Copilot Chat, Antigravity, and webview inputs with a single keystroke.

---

## 🎯 Real-World Examples

| Typed Prompt (Before) | Corrected Output (<kbd>Alt</kbd> + <kbd>W</kbd>) | What Got Fixed |
| :--- | :--- | :--- |
| `i dant pley tannes infront of teh club` | `I don't play tennis in front of the club` | Contractions, phonetics, compound words |
| `can u fix this fucntion resposne pls` | `Can you fix this function response please` | Dev typos (`fucntion`, `resposne`), prompt slang |
| `their is a error in this peace of code` | `There is an error in this piece of code` | Homophones (`their` $\rightarrow$ `there`, `peace` $\rightarrow$ `piece`), article agreement |
| `getUserById(userId) is retun undefined` | `getUserById(userId) is returning undefined` | Code identifier preserved; grammar corrected |

---

## ✨ Key Features

### 1. ⚡ Zero-UI In-Place Auto-Fix (<kbd>Alt</kbd> + <kbd>W</kbd>)
Press <kbd>Alt</kbd> + <kbd>W</kbd> anywhere—including inside AI Chat boxes, markdown files, or commit inputs. The extension instantly captures your prompt line, applies Bayesian frequency scoring and phonetic correction, and pastes back clean text without opening any popup windows.

### 2. 🔍 Interactive Prompt Checker (<kbd>Alt</kbd> + <kbd>Q</kbd>)
Need to review complex prompts? Press <kbd>Alt</kbd> + <kbd>Q</kbd> (or <kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>Q</kbd>) to launch the dedicated side panel:
- **Live Squiggly Underlines**: Red wavy underlines highlight typos in real-time.
- **Suggestion Chips**: Click any suggestion to instantly replace the misspelled word.
- **Auto-Fix All**: Clean the entire prompt with one click.
- **Fix & Paste to Chat** (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd>): Sends the polished prompt straight back to your active chat panel.

### 3. 🛡️ Developer Code Shield (Immunity System)
Never worry about your code identifiers getting mangled:
- ✅ Preserves `camelCase` and `snake_case` variable names (`fetchUserData`, `user_id_token`).
- ✅ Preserves Markdown code blocks, inline code fences (`const x = 10`), and backticks.
- ✅ Preserves URLs, endpoints, API routes (`/api/v1/auth`), and file paths (`src/components/App.tsx`).
- ✅ Preserves developer terms (`async`, `await`, `jwt`, `oauth`, `regex`, `stdout`, `boolean`).

### 4. 🧠 Contextual Collocation & Malapropism Detection
Traditional spell checkers only check if a word exists in a dictionary. AI Chat Spell Assistant detects real-word slips where both words are valid English but contextually incorrect:
- `peace of paper` $\rightarrow$ `piece of paper`
- `can't plea tanned` $\rightarrow$ `can't play tennis`
- `faster then before` $\rightarrow$ `faster than before`
- `loose weight` $\rightarrow$ `lose weight`

### 5. 🔒 100% Offline & Private
- **Zero Cloud Calls by Default**: Core spell checking, Double Metaphone phonetics, and Google Web 1T frequency ranking run entirely in-memory on your local CPU.
- **No Keystroke Tracking**: The OS-level capture only triggers on explicit user keystroke (<kbd>Alt</kbd> + <kbd>W</kbd> or <kbd>Alt</kbd> + <kbd>Q</kbd>).

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Command | Action |
| :--- | :--- | :--- |
| <kbd>Alt</kbd> + <kbd>W</kbd> | `spellAssistant.quickFixAndCopy` | Auto-fixes prompt and pastes directly into active chat box or editor. |
| <kbd>Alt</kbd> + <kbd>Q</kbd> | `spellAssistant.openPromptChecker` | Opens the Interactive Prompt Checker with current text loaded. |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd> | `spellAssistant.openPromptChecker` | Secondary shortcut for Interactive Prompt Checker. |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> | *Webview Action* | (Inside Webview) Auto-fixes prompt and pastes to chat panel. |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | *Webview Action* | (Inside Webview) Copies clean prompt to clipboard. |

---

## ⚙️ Configuration

Configure the extension via VS Code Settings (<kbd>Ctrl</kbd> + <kbd>,</kbd> $\rightarrow$ search `Spell Assistant`):

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
  "spellAssistant.diagnosticSeverity": "error",
  "spellAssistant.extraKnownWords": ["myCustomService", "authProvider"],
  "spellAssistant.aiProofreader.enabled": true,
  "spellAssistant.aiProofreader.provider": "auto"
}
```

### Settings Breakdown

| Setting | Default | Description |
| :--- | :---: | :--- |
| `spellAssistant.enabled` | `true` | Master toggle for spell checking. |
| `spellAssistant.checkOnType` | `true` | Highlights typos in real-time as you type in supported documents. |
| `spellAssistant.targetLanguages` | `["markdown", "plaintext", ...]` | Language modes eligible for real-time squiggly underlines. |
| `spellAssistant.ignoreCamelCase` | `true` | Automatically skips `camelCase` and `snake_case` programming variables. |
| `spellAssistant.ignoreCodeBlocks` | `true` | Automatically skips fenced (` ``` `) and inline (`` `code` ``) blocks. |
| `spellAssistant.extraKnownWords` | `[]` | List of custom words or domain acronyms to treat as valid. |
| `spellAssistant.aiProofreader.provider` | `"auto"` | Provider for Tier 2 proofreading: `"auto"`, `"vscode-lm"`, `"languagetool"`, or `"custom-llm"`. |

---

## 🤝 Supported Environments

- **AI Chat Assistants**: GitHub Copilot Chat, Antigravity Agent, Cursor Chat, ChatGPT & Claude Webviews.
- **Editor Documents**: Markdown (`.md`), Plain Text (`.txt`), Git Commit messages (`git-commit`), SCM Input (`scminput`), Untitled scratch tabs.
- **Operating Systems**: Windows 10/11, macOS, Linux.

---

## 📄 License

MIT © [Ibrahim Adel](https://github.com/ibrahimadel000)
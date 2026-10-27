<div align="center">

<img src="./assets/icon.png" alt="AI Chat Spell Assistant Logo" width="120" height="120" />

# AI Chat Spell Assistant

### Stop burning tokens on broken prompts.

[![VS Code Extension](https://img.shields.io/badge/VS_Code-Extension-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=ibrahim-adel.ai-chat-spell-assistant)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Compatible-purple?style=for-the-badge)](https://open-vsx.org/)
[![Publisher](https://img.shields.io/badge/Publisher-ibrahim--adel-24292e?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=ibrahim-adel.ai-chat-spell-assistant)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br />

**Code-safe spell check for Cursor, Antigravity, Codex, Claude & Copilot ai chat —fixing typos before hitting Enter without breaking variables, functions, or syntax.**

</div>

> [!IMPORTANT]
> **Stay on the Latest Release**: Updates are frequently rolled out to fix chat bugs and improve performance. Keep your extension updated to ensure everything runs smoothly with zero issues!

---

## What It Does

Standard spell checkers only scan open files in your workspace—they completely ignore your chat inputs. When a prompt contains mistyped code identifiers or broken grammar, AI models (Copilot, Cursor, Claude, Antigravity) easily hallucinate or misunderstand your request.

**AI Chat Spell Assistant** runs right inside your editor's chat boxes, correcting your prompts on the fly before you hit enter.

---

## ⚡ Shortcuts

| Keyboard Shortcut | Mode | Behavior |
| :---: | :--- | :--- |
| <kbd>Alt&nbsp;+&nbsp;W</kbd> | **Instant Auto-Fix** | **Zero UI.** Select any prompt or text in your chat box and press <kbd>Alt</kbd>&nbsp;+&nbsp;<kbd>W</kbd> — it fixes all typos & grammar and replaces your selection in-place. |
| <kbd>Alt&nbsp;+&nbsp;Q</kbd> | **Interactive Inspector** | Select text and press <kbd>Alt</kbd>&nbsp;+&nbsp;<kbd>Q</kbd> to open the review panel with squiggly highlights, token metrics, and one-click replacement chips. |

---

## 🎯 Real-World Examples

| Prompt (Before) | Corrected Output (<kbd>Alt&nbsp;+&nbsp;W</kbd>) | What It Resolves |
| :--- | :--- | :--- |
| `can u fix this fucntion resposne pls` | `Can you fix this function response please` | Fixes dev slang & typos |
| `their is a error in this peace of code` | `There is an error in this piece of code` | Fixes contextual homophones |
| `getUserById(userId) is retun undefined` | `getUserById(userId) is returning undefined` | **Preserves code identifier**; fixes verb |

---

## ✨ Key Highlights

- **Code Shield™:** Never ruins code identifiers. Leaves `camelCase`, `snake_case`, inline backticks, API endpoints, and terminal flags untouched.
- **Context-Aware:** Detects real words used in the wrong context (e.g., `loose connection` → `lose connection`).
- **100% Local & Private:** Runs entirely on your local machine with zero external network requests. Your prompts and private code never leave your computer.
- **Universal Editor Support:** Works across Copilot Chat, Cursor, Antigravity, Markdown files, and Git commit inputs.

---

## 🚀 Getting Started

1. Open **Cursor**, **VS Code**, or **Antigravity IDE**.
2. Go to the Extensions panel (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Search for **`AI Chat Spell Assistant`** and click **Install**.
4. In any chat input, select your prompt text and press <kbd>Alt&nbsp;+&nbsp;W</kbd>.

---

## 💬 Need Help or Have Feedback? Message Me!

If you encounter any issues, have an idea for improvement, or need assistance, feel free to text or email me directly:

- 📧 **Direct Email**: [ibrahimalsharjabi69@gmail.com](mailto:ibrahimalsharjabi69@gmail.com?subject=AI%20Chat%20Spell%20Assistant%20Feedback%20%2F%20Issue)
- 🐛 **Report a Bug**: [Open an issue on GitHub](https://github.com/ibrahimadel000/vscode-prompt-spell-checker/issues/new)

I check messages regularly and respond promptly to help resolve any issues!

---

<div align="center">

Maintained by **ibrahim-adel** • Released under the [MIT License](LICENSE)

</div>

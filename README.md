<div align="center">

<img src="./assets/icon.png" alt="AI Chat Spell Assistant Logo" width="120" height="120" />

# AI Chat Spell Assistant

### Stop burning tokens on broken prompts.

<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.gif" width="100%" height="3px" />
<br /><br />

<!-- One-Click Install Action Buttons -->
<a href="https://open-vsx.org/extension/ibrahim-adel/ai-chat-spell-assistant">
  <img src="https://img.shields.io/badge/Install%20in-Antigravity%20IDE-8A2BE2?style=for-the-badge&logo=eclipseide&logoColor=white" alt="Install in Antigravity" height="38" />
</a>
&nbsp;&nbsp;
<a href="https://marketplace.visualstudio.com/items?itemName=ibrahim-adel.ai-chat-spell-assistant">
  <img src="https://img.shields.io/badge/Install%20in-VS%20Code-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="Install in VS Code" height="38" />
</a>

<br /><br />

<!-- Live Dynamic Badges -->
<a href="https://open-vsx.org/extension/ibrahim-adel/ai-chat-spell-assistant">
  <img src="https://img.shields.io/open-vsx/v/ibrahim-adel/ai-chat-spell-assistant?style=flat-square&logo=openvsx&label=Open%20VSX&color=purple" alt="Open VSX Version" />
</a>
<a href="https://open-vsx.org/extension/ibrahim-adel/ai-chat-spell-assistant">
  <img src="https://img.shields.io/open-vsx/dt/ibrahim-adel/ai-chat-spell-assistant?style=flat-square&logo=openvsx&label=Downloads&color=success" alt="Open VSX Downloads" />
</a>
<a href="https://marketplace.visualstudio.com/items?itemName=ibrahim-adel.ai-chat-spell-assistant">
  <img src="https://img.shields.io/badge/Publisher-ibrahim--adel-24292e?style=flat-square" alt="Publisher" />
</a>
<a href="LICENSE">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" />
</a>

<br /><br />
<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.gif" width="100%" height="3px" />
<br />

**Code-safe spell check for Cursor, Antigravity, Codex, Claude & Copilot AI chat — fixing typos before hitting Enter without breaking variables, functions, or syntax.**

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

1. Open **Antigravity IDE**, **VS Code**, or **Cursor**.
2. Go to the Extensions panel (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Search for:
   ```text
   @id:ibrahim-adel.ai-chat-spell-assistant
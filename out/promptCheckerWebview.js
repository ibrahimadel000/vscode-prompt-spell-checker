"use strict";
// 🧩 Prompt Checker Webview Panel 🧩
// An interactive text box where users review misspellings and copy clean text directly.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptCheckerPanel = void 0;
const vscode = __importStar(require("vscode"));
const selectionCapture_1 = require("./selectionCapture");
class PromptCheckerPanel {
    static currentPanel;
    _panel;
    _extensionUri;
    _spellEngine;
    _userDictionary;
    _getConfig;
    _disposables = [];
    _currentText = '';
    _targetEditor;
    _targetRange;
    static createOrShow(extensionUri, spellEngine, userDictionary, getConfig, initialText, targetEditor, targetRange) {
        const column = vscode.ViewColumn.Beside;
        if (PromptCheckerPanel.currentPanel) {
            PromptCheckerPanel.currentPanel._panel.reveal(column);
            // Update the text when non-empty text is selected
            if (initialText !== undefined && initialText.trim() !== '') {
                PromptCheckerPanel.currentPanel.setText(initialText, targetEditor, targetRange);
            }
            return;
        }
        const panel = vscode.window.createWebviewPanel('promptSpellChecker', 'AI Prompt Spell Checker', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri]
        });
        PromptCheckerPanel.currentPanel = new PromptCheckerPanel(panel, extensionUri, spellEngine, userDictionary, getConfig, initialText ?? '', targetEditor, targetRange);
    }
    constructor(panel, extensionUri, spellEngine, userDictionary, getConfig, initialText, targetEditor, targetRange) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._spellEngine = spellEngine;
        this._userDictionary = userDictionary;
        this._getConfig = getConfig;
        this._currentText = initialText;
        this._targetEditor = targetEditor;
        this._targetRange = targetRange;
        this._panel.webview.html = this._getHtmlForWebview();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'ready': {
                    // Webview DOM is loaded and event listeners are active!
                    this._panel.webview.postMessage({
                        command: 'loadText',
                        text: this._currentText,
                        hasEditorTarget: !!(this._targetEditor && this._targetRange)
                    });
                    this._analyzeAndSend(this._currentText);
                    break;
                }
                case 'checkText': {
                    this._currentText = message.text;
                    this._analyzeAndSend(message.text);
                    break;
                }
                case 'copyToClipboard': {
                    this._currentText = message.text;
                    await vscode.env.clipboard.writeText(message.text);
                    vscode.window.showInformationMessage('📋 Copied clean prompt to clipboard!');
                    break;
                }
                case 'replaceInEditor': {
                    this._currentText = message.text;
                    if (this._targetEditor && this._targetRange) {
                        await this._targetEditor.edit(editBuilder => {
                            editBuilder.replace(this._targetRange, message.text);
                        });
                        vscode.window.showInformationMessage('✅ Replaced in editor!');
                    }
                    else {
                        await vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('📋 Copied to clipboard (no editor selection).');
                    }
                    break;
                }
                case 'fixAndPasteToChat': {
                    this._currentText = message.text;
                    await vscode.env.clipboard.writeText(message.text);
                    // Close webview panel
                    this.dispose();
                    // Short wait for webview panel to close
                    await new Promise(resolve => setTimeout(resolve, 80));
                    // Focus the AI Chat box and paste the clean prompt
                    await selectionCapture_1.SelectionCapture.pasteToChat(30);
                    vscode.window.showInformationMessage('⚡ Fixed & pasted back into chat!');
                    break;
                }
                case 'addWord': {
                    if (message.word) {
                        await this._userDictionary.addWord(message.word);
                        this._spellEngine.addWordToChecker(message.word);
                        vscode.window.showInformationMessage(`Added "${message.word}" to dictionary.`);
                        this._analyzeAndSend(this._currentText);
                    }
                    break;
                }
            }
        }, null, this._disposables);
    }
    setText(text, targetEditor, targetRange) {
        this._currentText = text;
        this._targetEditor = targetEditor;
        this._targetRange = targetRange;
        this._panel.webview.postMessage({
            command: 'loadText',
            text: this._currentText,
            hasEditorTarget: !!(targetEditor && targetRange)
        });
        this._analyzeAndSend(this._currentText);
    }
    _analyzeAndSend(text) {
        const config = this._getConfig();
        const misspellings = this._spellEngine.findMisspellings(text, config);
        this._panel.webview.postMessage({
            command: 'spellResults',
            misspellings: misspellings.map(m => ({
                word: m.word,
                start: m.start,
                end: m.end,
                suggestions: m.suggestions
            }))
        });
    }
    dispose() {
        PromptCheckerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Prompt Spell Checker</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background, #1e1e1e);
            --fg: var(--vscode-editor-foreground, #d4d4d4);
            --card-bg: var(--vscode-editorWidget-background, #252526);
            --border: var(--vscode-editorWidget-border, #3c3c3c);
            --accent: var(--vscode-button-background, #007acc);
            --accent-hover: var(--vscode-button-hoverBackground, #0062a3);
            --btn-fg: var(--vscode-button-foreground, #ffffff);
            --sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
            --sec-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
            --sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
            --menu-bg: var(--vscode-menu-background, #252526);
            --menu-fg: var(--vscode-menu-foreground, #cccccc);
            --menu-border: var(--vscode-menu-border, #454545);
            --menu-hover: var(--vscode-menu-selectionBackground, #094771);
            --menu-hover-fg: var(--vscode-menu-selectionForeground, #ffffff);
            --badge-bg: rgba(235, 87, 87, 0.15);
            --badge-border: rgba(235, 87, 87, 0.5);
            --badge-fg: #ff6b6b;
            --sugg-bg: rgba(0, 122, 204, 0.15);
            --sugg-border: rgba(0, 122, 204, 0.4);
            --sugg-fg: #61afef;
            --typo-red: #ff4d4f;
            --typo-bg: rgba(255, 77, 79, 0.14);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--fg);
            background-color: var(--bg);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            height: 100vh;
            overflow: hidden;
            user-select: none;
        }

        /* ── Header ─────────────────────────────────────────────── */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .title {
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-badge {
            font-size: 11px;
            padding: 3px 10px;
            border-radius: 12px;
            font-weight: 500;
            background: var(--sec-bg);
            color: var(--fg);
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }

        .status-badge.has-errors {
            background: var(--badge-bg);
            color: var(--badge-fg);
            border: 1px solid var(--badge-border);
        }

        .status-badge.clean {
            background: rgba(46, 204, 113, 0.15);
            color: #2ecc71;
            border: 1px solid rgba(46, 204, 113, 0.4);
        }

        /* ── Interactive Google Speller Editor Container ─────────── */
        .editor-container {
            position: relative;
            flex: 1;
            min-height: 150px;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.25);
            overflow: hidden;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .editor-container:focus-within {
            border-color: var(--accent);
            box-shadow: 0 0 0 1px var(--accent), inset 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        .editor-backdrop,
        textarea#promptInput {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 14px 16px;
            box-sizing: border-box;
            font-family: var(--vscode-editor-font-family, Consolas, 'Segoe UI', monospace);
            font-size: 14px;
            line-height: 1.6;
            letter-spacing: 0px;
            white-space: pre-wrap;
            word-break: break-word;
            overflow-wrap: break-word;
            tab-size: 4;
        }

        .editor-backdrop {
            pointer-events: none;
            overflow: hidden;
            z-index: 1;
            color: transparent;
        }

        .editor-highlights {
            width: 100%;
            box-sizing: border-box;
            color: transparent;
            user-select: none;
            -webkit-user-select: none;
        }

        /* 🔴 Google Speller Red Wavy Squiggly Underline */
        .editor-highlights mark.misspelled {
            color: transparent;
            background-color: var(--typo-bg);
            text-decoration: underline wavy var(--typo-red) 2px;
            -webkit-text-decoration: underline wavy var(--typo-red) 2px;
            border-bottom: 2px wavy var(--typo-red);
            border-radius: 3px;
            padding: 1px 0;
            cursor: pointer;
            transition: background-color 0.15s ease;
        }

        .editor-highlights mark.misspelled.active-hover {
            background-color: rgba(255, 77, 79, 0.32);
        }

        textarea#promptInput {
            z-index: 2;
            background: transparent;
            color: var(--fg);
            border: none;
            outline: none;
            resize: none;
            overflow-y: auto;
            caret-color: var(--fg);
            user-select: text;
        }

        /* ── Action Buttons ──────────────────────────────────────── */
        .actions-bar {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            flex-shrink: 0;
        }

        button {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            border-radius: 5px;
            border: none;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s, transform 0.05s, opacity 0.15s;
        }

        button:active {
            transform: scale(0.98);
        }

        .btn-primary {
            background: #2ecc71;
            color: #000;
            font-weight: 600;
        }

        .btn-primary:hover {
            background: #27ae60;
        }

        .btn-secondary {
            background: var(--sec-bg);
            color: var(--sec-fg);
        }

        .btn-secondary:hover {
            background: var(--sec-hover);
        }

        .btn-clear {
            margin-left: auto;
            background: transparent;
            color: var(--fg);
            opacity: 0.6;
            border: 1px solid var(--border);
        }

        .btn-clear:hover {
            opacity: 1;
            background: var(--sec-bg);
        }

        /* ── Issues Overview Panel ───────────────────────────────── */
        .issues-panel {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 10px 12px;
            max-height: 180px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex-shrink: 0;
        }

        .issues-header {
            font-size: 11px;
            font-weight: 600;
            color: var(--fg);
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .issues-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .issue-card {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 7px 10px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 5px;
            border-left: 3px solid var(--badge-fg);
            transition: background 0.15s;
        }

        .issue-card:hover {
            background: rgba(255, 255, 255, 0.03);
        }

        .issue-word-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .issue-word {
            font-weight: 600;
            color: var(--badge-fg);
            text-decoration: underline wavy var(--badge-fg);
            cursor: pointer;
        }

        .issue-word:hover {
            opacity: 0.85;
        }

        .issue-btn-dict {
            background: transparent;
            color: var(--fg);
            opacity: 0.7;
            font-size: 11px;
            padding: 2px 8px;
            border: 1px solid var(--border);
            border-radius: 3px;
        }

        .issue-btn-dict:hover {
            opacity: 1;
            background: var(--sec-bg);
        }

        .suggestions-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .sugg-chip {
            background: var(--sugg-bg);
            color: var(--sugg-fg);
            border: 1px solid var(--sugg-border);
            padding: 3px 10px;
            border-radius: 14px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .sugg-chip:hover {
            background: var(--accent);
            color: var(--btn-fg);
            border-color: var(--accent);
            transform: translateY(-1px);
        }

        .empty-state {
            padding: 12px;
            text-align: center;
            color: var(--fg);
            opacity: 0.7;
            font-size: 12px;
        }

        /* ── Google Speller Floating Context Menu ─────────────────── */
        .speller-context-menu {
            position: fixed;
            z-index: 10000;
            min-width: 220px;
            max-width: 320px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            border: 1px solid var(--menu-border);
            border-radius: 8px;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(14px);
            padding: 6px;
            display: flex;
            flex-direction: column;
            gap: 3px;
            font-size: 12px;
            animation: menuPopIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
            transform-origin: top left;
        }

        @keyframes menuPopIn {
            from {
                opacity: 0;
                transform: scale(0.94) translateY(-4px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        .menu-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 8px 4px 8px;
        }

        .menu-typo-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: rgba(235, 87, 87, 0.15);
            border: 1px solid rgba(235, 87, 87, 0.4);
            color: #ff6b6b;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        }

        .menu-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.6;
        }

        .menu-suggestions-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
            max-height: 180px;
            overflow-y: auto;
        }

        .menu-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            padding: 7px 10px;
            border-radius: 5px;
            background: transparent;
            color: inherit;
            border: none;
            font-family: inherit;
            font-size: 12.5px;
            cursor: pointer;
            text-align: left;
            transition: background 0.1s, transform 0.08s;
        }

        .menu-item:hover,
        .menu-item.active {
            background: var(--menu-hover);
            color: var(--menu-hover-fg);
        }

        .suggestion-item {
            font-weight: 600;
        }

        .sugg-left {
            display: flex;
            align-items: center;
            gap: 7px;
        }

        .sugg-icon {
            font-size: 12px;
            color: #2ecc71;
        }

        .sugg-tag {
            font-size: 10px;
            opacity: 0.6;
            font-weight: normal;
        }

        .menu-divider {
            height: 1px;
            background: var(--border);
            margin: 4px 2px;
            opacity: 0.6;
        }

        .action-item {
            opacity: 0.85;
            font-size: 11.5px;
            font-weight: normal;
        }

        .action-item:hover {
            opacity: 1;
        }

        .action-left {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .no-suggestions-text {
            padding: 8px 10px;
            opacity: 0.6;
            font-style: italic;
            font-size: 11px;
        }

        /* ── Footer Tips & Toast ─────────────────────────────────── */
        .footer-tips {
            font-size: 11px;
            opacity: 0.7;
            display: flex;
            justify-content: space-between;
            flex-shrink: 0;
            padding-top: 2px;
        }

        .toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(40px);
            background: #2ecc71;
            color: #000;
            font-weight: 600;
            font-size: 12px;
            padding: 7px 18px;
            border-radius: 20px;
            opacity: 0;
            pointer-events: none;
            transition: all 0.25s ease;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
            z-index: 20000;
        }

        .toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">
            <span>✨</span> AI Prompt Spell Checker
        </div>
        <div id="statusBadge" class="status-badge clean">✅ No typos found</div>
    </div>

    <!-- 🎯 Interactive Google Speller Editor -->
    <div class="editor-container" id="editorContainer">
        <div class="editor-backdrop" id="editorBackdrop">
            <div class="editor-highlights" id="editorHighlights"></div>
        </div>
        <textarea
            id="promptInput"
            placeholder="Type or paste your AI prompt here... (e.g. I dont knw what hapened here)"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
        ></textarea>
    </div>

    <!-- ⚡ Action Buttons -->
    <div class="actions-bar">
        <button id="btnFixAndPaste" class="btn-primary" title="Auto-fix typos and paste directly back into AI Chat box (Ctrl+Shift+Enter)">
            ⚡ Fix & Paste to Chat
        </button>
        <button id="btnCopy" class="btn-secondary" title="Copy clean prompt to clipboard (Ctrl+Enter)">
            📋 Copy Clean Prompt
        </button>
        <button id="btnAutoFix" class="btn-secondary" title="Fix all typos automatically in the editor">
            ✨ Auto-Fix All
        </button>
        <button id="btnReplaceEditor" class="btn-secondary" style="display:none;" title="Replace in code editor">
            🔄 Replace in Editor
        </button>
        <button id="btnClear" class="btn-clear" title="Clear text">
            🗑️ Clear
        </button>
    </div>

    <!-- 📋 Misspellings Overview Panel -->
    <div class="issues-panel" id="issuesPanel">
        <div class="issues-header">
            <span>Misspellings & Quick Fixes</span>
            <span id="issuesCount" style="font-size: 10px; opacity: 0.6;">0 typos</span>
        </div>
        <div id="issuesList" class="issues-list">
            <div class="empty-state">No spelling mistakes detected. Your prompt is ready!</div>
        </div>
    </div>

    <!-- 💡 Footer Tips -->
    <div class="footer-tips">
        <span>⚡ <b>Right-click</b> (or click) any red wavy word to fix like Google Speller</span>
        <span>⚡ <b>Ctrl+Shift+Enter</b> fixes & pastes directly to AI Chat</span>
    </div>

    <!-- 🌟 Google Speller Floating Context Menu -->
    <div id="spellerContextMenu" class="speller-context-menu" style="display: none;">
        <div class="menu-header">
            <div class="menu-typo-pill">
                <span>❌</span>
                <span id="menuTypoWord">word</span>
            </div>
            <span class="menu-label">Suggestions</span>
        </div>
        <div id="menuSuggestionsList" class="menu-suggestions-list"></div>
        <div class="menu-divider"></div>
        <button id="menuBtnAddDict" class="menu-item action-item">
            <div class="action-left">
                <span>➕</span>
                <span>Add "<span id="menuDictWord">word</span>" to dictionary</span>
            </div>
        </button>
        <button id="menuBtnIgnore" class="menu-item action-item">
            <div class="action-left">
                <span>👁️</span>
                <span>Ignore word</span>
            </div>
        </button>
    </div>

    <div id="toast" class="toast">📋 Copied to clipboard!</div>

    <script>
        const vscode = acquireVsCodeApi();
        const textarea = document.getElementById('promptInput');
        const editorBackdrop = document.getElementById('editorBackdrop');
        const editorHighlights = document.getElementById('editorHighlights');
        const statusBadge = document.getElementById('statusBadge');
        const issuesList = document.getElementById('issuesList');
        const issuesCount = document.getElementById('issuesCount');
        const btnFixAndPaste = document.getElementById('btnFixAndPaste');
        const btnCopy = document.getElementById('btnCopy');
        const btnAutoFix = document.getElementById('btnAutoFix');
        const btnReplaceEditor = document.getElementById('btnReplaceEditor');
        const btnClear = document.getElementById('btnClear');
        const toast = document.getElementById('toast');

        // Context Menu elements
        const spellerContextMenu = document.getElementById('spellerContextMenu');
        const menuTypoWord = document.getElementById('menuTypoWord');
        const menuDictWord = document.getElementById('menuDictWord');
        const menuSuggestionsList = document.getElementById('menuSuggestionsList');
        const menuBtnAddDict = document.getElementById('menuBtnAddDict');
        const menuBtnIgnore = document.getElementById('menuBtnIgnore');

        let currentMisspellings = [];
        let ignoredWords = new Set();
        let activeMisspelling = null;
        let debounceTimer = null;

        function showToast(text) {
            toast.textContent = text;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 1500);
        }

        function escapeHtml(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // ── Synchronize Backdrop Dimensions & Scroll ─────────────
        function syncSizeAndScroll() {
            editorHighlights.style.width = textarea.clientWidth + 'px';
            editorBackdrop.scrollTop = textarea.scrollTop;
            editorBackdrop.scrollLeft = textarea.scrollLeft;
        }

        textarea.addEventListener('scroll', syncSizeAndScroll);
        window.addEventListener('resize', syncSizeAndScroll);

        // ── Render Red Wavy Squigglies in Backdrop ────────────────
        function renderHighlights() {
            const text = textarea.value;
            syncSizeAndScroll();

            if (!text) {
                editorHighlights.innerHTML = '';
                return;
            }

            // Filter out ignored words
            const activeErrors = currentMisspellings.filter(m => !ignoredWords.has(m.word.toLowerCase()));

            if (activeErrors.length === 0) {
                editorHighlights.innerHTML = escapeHtml(text);
                return;
            }

            // Sort by start index ascending
            const sorted = [...activeErrors].sort((a, b) => a.start - b.start);

            let html = '';
            let lastIndex = 0;

            for (let i = 0; i < sorted.length; i++) {
                const m = sorted[i];
                if (m.start < lastIndex || m.start >= text.length) continue;

                // Safe check that target slice corresponds to word
                const slice = text.slice(m.start, m.end);
                if (slice.toLowerCase() !== m.word.toLowerCase()) {
                    continue;
                }

                // Append normal text before typo
                html += escapeHtml(text.slice(lastIndex, m.start));

                // Append typo with red wavy squiggly mark
                html += '<mark class="misspelled" data-start="' + m.start + '" data-end="' + m.end + '" data-word="' + escapeHtml(m.word) + '">' + escapeHtml(slice) + '</mark>';

                lastIndex = m.end;
            }

            html += escapeHtml(text.slice(lastIndex));

            // Extra newline if text ends with newline for scroll parity
            if (text.endsWith('\\n')) {
                html += '\\n';
            }

            editorHighlights.innerHTML = html;
        }

        // ── Real-time Input Checking ──────────────────────────────
        textarea.addEventListener('input', () => {
            renderHighlights();
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                vscode.postMessage({ command: 'checkText', text: textarea.value });
            }, 160);
        });

        // ── Find Misspelling at Point or Offset ───────────────────
        function findMisspelling(clientX, clientY, textOffset) {
            // 1. Precise DOM bounding box check
            const marks = editorHighlights.querySelectorAll('mark.misspelled');
            for (const mark of marks) {
                const rect = mark.getBoundingClientRect();
                if (
                    clientX >= rect.left - 4 && clientX <= rect.right + 4 &&
                    clientY >= rect.top - 4 && clientY <= rect.bottom + 6
                ) {
                    const start = parseInt(mark.getAttribute('data-start'), 10);
                    const end = parseInt(mark.getAttribute('data-end'), 10);
                    const found = currentMisspellings.find(m => m.start === start && m.end === end);
                    if (found && !ignoredWords.has(found.word.toLowerCase())) {
                        return { misspelling: found, rect };
                    }
                }
            }

            // 2. Cursor index offset fallback
            if (typeof textOffset === 'number' && textOffset >= 0) {
                for (const m of currentMisspellings) {
                    if (ignoredWords.has(m.word.toLowerCase())) continue;
                    if (textOffset >= m.start && textOffset <= m.end) {
                        const mark = editorHighlights.querySelector('mark[data-start="' + m.start + '"][data-end="' + m.end + '"]');
                        const rect = mark ? mark.getBoundingClientRect() : null;
                        return { misspelling: m, rect };
                    }
                }
            }

            return null;
        }

        // ── Google Speller Context Menu ───────────────────────────
        function showContextMenu(clickX, clickY, misspelling, rect) {
            activeMisspelling = misspelling;

            menuTypoWord.textContent = misspelling.word;
            menuDictWord.textContent = misspelling.word;

            // Render suggestions
            menuSuggestionsList.innerHTML = '';
            if (misspelling.suggestions && misspelling.suggestions.length > 0) {
                misspelling.suggestions.slice(0, 5).forEach((sugg, idx) => {
                    const btn = document.createElement('button');
                    btn.className = 'menu-item suggestion-item' + (idx === 0 ? ' active' : '');
                    btn.innerHTML =
                        '<div class="sugg-left">' +
                            '<span class="sugg-icon">✓</span>' +
                            '<span>' + escapeHtml(sugg) + '</span>' +
                        '</div>' +
                        '<span class="sugg-tag">' + (idx === 0 ? 'Best match' : '') + '</span>';
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        applySuggestion(misspelling, sugg);
                    };
                    menuSuggestionsList.appendChild(btn);
                });
            } else {
                const empty = document.createElement('div');
                empty.className = 'no-suggestions-text';
                empty.textContent = 'No suggestions found';
                menuSuggestionsList.appendChild(empty);
            }

            spellerContextMenu.style.display = 'flex';

            // Calculate position
            const menuWidth = 230;
            const menuHeight = spellerContextMenu.offsetHeight || 190;

            let posX = clickX;
            let posY = clickY + 6;

            if (rect) {
                posX = rect.left;
                posY = rect.bottom + 4;
                if (posY + menuHeight > window.innerHeight - 10) {
                    posY = rect.top - menuHeight - 4;
                }
            }

            // Keep within viewport bounds
            if (posX + menuWidth > window.innerWidth - 10) {
                posX = window.innerWidth - menuWidth - 10;
            }
            if (posX < 10) posX = 10;

            if (posY + menuHeight > window.innerHeight - 10) {
                posY = window.innerHeight - menuHeight - 10;
            }
            if (posY < 10) posY = 10;

            spellerContextMenu.style.left = posX + 'px';
            spellerContextMenu.style.top = posY + 'px';
        }

        function hideContextMenu() {
            spellerContextMenu.style.display = 'none';
            activeMisspelling = null;
        }

        // 🖱️ Right-Click to open Google Speller Context Menu
        textarea.addEventListener('contextmenu', (e) => {
            const cursorPos = textarea.selectionStart;
            const match = findMisspelling(e.clientX, e.clientY, cursorPos);

            if (match) {
                e.preventDefault();
                showContextMenu(e.clientX, e.clientY, match.misspelling, match.rect);
            } else {
                hideContextMenu();
            }
        });

        // 🖱️ Left-Click on typo to also show suggestions (Google Docs style)
        textarea.addEventListener('click', (e) => {
            hideContextMenu();
            setTimeout(() => {
                if (textarea.selectionStart === textarea.selectionEnd) {
                    const cursorPos = textarea.selectionStart;
                    const match = findMisspelling(e.clientX, e.clientY, cursorPos);
                    if (match) {
                        showContextMenu(e.clientX, e.clientY, match.misspelling, match.rect);
                    }
                }
            }, 50);
        });

        // 🖱️ Mouse move hover effect
        textarea.addEventListener('mousemove', (e) => {
            const match = findMisspelling(e.clientX, e.clientY);
            const marks = editorHighlights.querySelectorAll('mark.misspelled');
            marks.forEach(m => m.classList.remove('active-hover'));

            if (match && match.rect) {
                const activeMark = editorHighlights.querySelector('mark[data-start="' + match.misspelling.start + '"]');
                if (activeMark) activeMark.classList.add('active-hover');
            }
        });

        // Dismiss menu on click outside or Escape
        document.addEventListener('click', (e) => {
            if (!spellerContextMenu.contains(e.target) && e.target !== textarea) {
                hideContextMenu();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideContextMenu();
            }
        });

        // ── Apply Suggestion / Replace Typo ───────────────────────
        function applySuggestion(misspelling, replacement) {
            const original = textarea.value;
            const before = original.slice(0, misspelling.start);
            const after = original.slice(misspelling.end);
            const newText = before + replacement + after;
            textarea.value = newText;

            // Set cursor right after the replacement word
            const newCursor = misspelling.start + replacement.length;
            textarea.setSelectionRange(newCursor, newCursor);
            textarea.focus();

            hideContextMenu();
            renderHighlights();

            vscode.postMessage({ command: 'checkText', text: newText });
            showToast('✨ Replaced "' + misspelling.word + '" with "' + replacement + '"');
        }

        // ── Menu Action Buttons ───────────────────────────────────
        menuBtnAddDict.addEventListener('click', () => {
            if (activeMisspelling) {
                const word = activeMisspelling.word;
                ignoredWords.add(word.toLowerCase());
                hideContextMenu();
                vscode.postMessage({ command: 'addWord', word });
                showToast('Added "' + word + '" to dictionary');
                vscode.postMessage({ command: 'checkText', text: textarea.value });
            }
        });

        menuBtnIgnore.addEventListener('click', () => {
            if (activeMisspelling) {
                const word = activeMisspelling.word;
                ignoredWords.add(word.toLowerCase());
                hideContextMenu();
                renderHighlights();
                renderResults(currentMisspellings);
                showToast('Ignored "' + word + '"');
            }
        });

        // ── Keyboard Shortcuts ────────────────────────────────────
        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                btnFixAndPaste.click();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                btnCopy.click();
            }
        });

        // ── Main Action Bar Handlers ──────────────────────────────
        btnFixAndPaste.addEventListener('click', () => {
            let text = textarea.value;
            let count = 0;
            const activeErrors = currentMisspellings.filter(m => !ignoredWords.has(m.word.toLowerCase()));

            if (activeErrors.length > 0) {
                const sorted = [...activeErrors].sort((a, b) => b.start - a.start);
                for (const m of sorted) {
                    if (m.suggestions && m.suggestions.length > 0) {
                        text = text.slice(0, m.start) + m.suggestions[0] + text.slice(m.end);
                        count++;
                    }
                }
                textarea.value = text;
            }

            vscode.postMessage({
                command: 'fixAndPasteToChat',
                text: textarea.value,
                count: count
            });
            showToast('⚡ Pasting into chat...');
        });

        btnCopy.addEventListener('click', () => {
            vscode.postMessage({ command: 'copyToClipboard', text: textarea.value });
            showToast('📋 Copied clean prompt!');
        });

        btnReplaceEditor.addEventListener('click', () => {
            vscode.postMessage({ command: 'replaceInEditor', text: textarea.value });
            showToast('✅ Replaced in editor!');
        });

        btnAutoFix.addEventListener('click', () => {
            const activeErrors = currentMisspellings.filter(m => !ignoredWords.has(m.word.toLowerCase()));
            if (activeErrors.length === 0) {
                btnCopy.click();
                return;
            }

            let text = textarea.value;
            const sorted = [...activeErrors].sort((a, b) => b.start - a.start);
            let count = 0;
            for (const m of sorted) {
                if (m.suggestions && m.suggestions.length > 0) {
                    text = text.slice(0, m.start) + m.suggestions[0] + text.slice(m.end);
                    count++;
                }
            }
            textarea.value = text;
            renderHighlights();
            vscode.postMessage({ command: 'checkText', text: textarea.value });
            showToast('⚡ Auto-fixed ' + count + ' typo(s)!');
        });

        btnClear.addEventListener('click', () => {
            textarea.value = '';
            currentMisspellings = [];
            ignoredWords.clear();
            renderHighlights();
            renderResults([]);
            textarea.focus();
            showToast('Cleared');
        });

        // ── Extension Messages ────────────────────────────────────
        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.command) {
                case 'loadText':
                    textarea.value = msg.text || '';
                    if (msg.hasEditorTarget) {
                        btnReplaceEditor.style.display = 'inline-flex';
                    } else {
                        btnReplaceEditor.style.display = 'none';
                    }
                    renderHighlights();
                    textarea.focus();
                    break;
                case 'spellResults':
                    currentMisspellings = msg.misspellings || [];
                    renderHighlights();
                    renderResults(currentMisspellings);
                    break;
            }
        });

        // ── Render Bottom Misspellings List ───────────────────────
        function renderResults(misspellings) {
            const activeErrors = misspellings.filter(m => !ignoredWords.has(m.word.toLowerCase()));
            issuesList.innerHTML = '';

            if (activeErrors.length === 0) {
                statusBadge.textContent = '✅ No typos found';
                statusBadge.className = 'status-badge clean';
                issuesCount.textContent = '0 typos';
                issuesList.innerHTML = '<div class="empty-state">No spelling mistakes detected. Your prompt is clean!</div>';
                return;
            }

            statusBadge.textContent = activeErrors.length + ' typo(s) found';
            statusBadge.className = 'status-badge has-errors';
            issuesCount.textContent = activeErrors.length + ' typo(s)';

            activeErrors.forEach(m => {
                const card = document.createElement('div');
                card.className = 'issue-card';

                const wordRow = document.createElement('div');
                wordRow.className = 'issue-word-row';

                const wordLabel = document.createElement('span');
                wordLabel.className = 'issue-word';
                wordLabel.textContent = m.word;
                wordLabel.title = 'Click to focus in editor';
                wordLabel.onclick = () => {
                    textarea.focus();
                    textarea.setSelectionRange(m.start, m.end);
                    syncSizeAndScroll();
                };

                const dictBtn = document.createElement('button');
                dictBtn.className = 'issue-btn-dict';
                dictBtn.textContent = '+ Add to Dict';
                dictBtn.onclick = () => {
                    ignoredWords.add(m.word.toLowerCase());
                    vscode.postMessage({ command: 'addWord', word: m.word });
                    showToast('Added "' + m.word + '" to dictionary');
                };

                wordRow.appendChild(wordLabel);
                wordRow.appendChild(dictBtn);
                card.appendChild(wordRow);

                const suggRow = document.createElement('div');
                suggRow.className = 'suggestions-row';

                if (m.suggestions && m.suggestions.length > 0) {
                    m.suggestions.slice(0, 5).forEach(sugg => {
                        const chip = document.createElement('span');
                        chip.className = 'sugg-chip';
                        chip.textContent = sugg;
                        chip.title = 'Click to replace with ' + sugg;
                        chip.onclick = () => applySuggestion(m, sugg);
                        suggRow.appendChild(chip);
                    });
                } else {
                    const noSugg = document.createElement('span');
                    noSugg.style.opacity = '0.6';
                    noSugg.style.fontSize = '11px';
                    noSugg.textContent = 'No suggestions found';
                    suggRow.appendChild(noSugg);
                }

                card.appendChild(suggRow);
                issuesList.appendChild(card);
            });
        }

        // Notify extension that Webview DOM is ready
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
    }
}
exports.PromptCheckerPanel = PromptCheckerPanel;
//# sourceMappingURL=promptCheckerWebview.js.map
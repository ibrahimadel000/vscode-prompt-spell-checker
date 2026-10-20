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
const typoRules_1 = require("./typoRules");
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
                case 'autoFixText': {
                    const { text: phraseFixed, count: pCount } = (0, typoRules_1.applyContextualPhraseFixes)(message.text);
                    let finalText = phraseFixed;
                    const config = this._getConfig();
                    const misspellings = this._spellEngine.findMisspellings(finalText, config);
                    let totalCount = pCount;
                    const sorted = [...misspellings].sort((a, b) => b.start - a.start);
                    for (const m of sorted) {
                        if (m.suggestions && m.suggestions.length > 0) {
                            finalText = finalText.slice(0, m.start) + m.suggestions[0] + finalText.slice(m.end);
                            totalCount++;
                        }
                    }
                    this._currentText = finalText;
                    this._panel.webview.postMessage({
                        command: 'loadText',
                        text: finalText,
                        hasEditorTarget: !!(this._targetEditor && this._targetRange)
                    });
                    this._analyzeAndSend(finalText);
                    vscode.window.showInformationMessage(`⚡ Auto-fixed ${totalCount} issue(s)!`);
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
            --fg: var(--vscode-editor-foreground, #cccccc);
            --muted: var(--vscode-descriptionForeground, #888888);
            --card-bg: var(--vscode-editorWidget-background, #252526);
            --border: var(--vscode-widget-border, rgba(255, 255, 255, 0.08));
            --border-hover: rgba(255, 255, 255, 0.16);
            --focus-border: var(--vscode-focusBorder, #007fd4);

            /* Primary Action Button - Modern, confident accent */
            --primary-bg: var(--vscode-button-background, #0e639c);
            --primary-hover: var(--vscode-button-hoverBackground, #1177bb);
            --primary-fg: var(--vscode-button-foreground, #ffffff);

            /* Secondary Action Button - Translucent surface */
            --secondary-bg: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.06));
            --secondary-hover: var(--vscode-button-secondaryHoverBackground, rgba(255, 255, 255, 0.11));
            --secondary-fg: var(--vscode-button-secondaryForeground, var(--fg));

            /* Context Menu - Frosted Glass */
            --menu-bg: var(--vscode-menu-background, rgba(30, 30, 32, 0.96));
            --menu-fg: var(--vscode-menu-foreground, #cccccc);
            --menu-border: var(--vscode-menu-border, rgba(255, 255, 255, 0.12));
            --menu-hover: var(--vscode-menu-selectionBackground, #04395e);
            --menu-hover-fg: var(--vscode-menu-selectionForeground, #ffffff);

            /* Speller Underline & Status */
            --typo-red: #ea4335;
            --typo-bg-hover: rgba(234, 67, 53, 0.14);
            --clean-green: #34d399;
            --clean-bg: rgba(52, 211, 153, 0.1);
            --clean-border: rgba(52, 211, 153, 0.25);
            --error-red: #f87171;
            --error-bg: rgba(248, 113, 113, 0.1);
            --error-border: rgba(248, 113, 113, 0.25);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--fg);
            background-color: var(--bg);
            padding: 16px 20px;
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
            padding-bottom: 2px;
        }

        .brand {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 13.5px;
            font-weight: 600;
            letter-spacing: -0.01em;
            color: var(--fg);
        }

        .brand-icon {
            opacity: 0.85;
            color: var(--primary-hover);
        }

        .header-right {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .stats-pill {
            font-size: 11px;
            color: var(--muted);
            font-variant-numeric: tabular-nums;
            padding: 2px 6px;
        }

        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 500;
            padding: 3px 10px;
            border-radius: 12px;
            transition: all 0.2s ease;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            display: inline-block;
        }

        .status-clean {
            background: var(--clean-bg);
            border: 1px solid var(--clean-border);
            color: var(--clean-green);
        }

        .status-clean .status-dot {
            background: var(--clean-green);
            box-shadow: 0 0 6px rgba(52, 211, 153, 0.4);
        }

        .status-errors {
            background: var(--error-bg);
            border: 1px solid var(--error-border);
            color: var(--error-red);
        }

        .status-errors .status-dot {
            background: var(--error-red);
            box-shadow: 0 0 6px rgba(248, 113, 113, 0.4);
        }

        /* ── Interactive Google Speller Editor Container ─────────── */
        .editor-container {
            position: relative;
            flex: 1;
            min-height: 180px;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16);
            overflow: hidden;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .editor-container:focus-within {
            border-color: var(--focus-border);
            box-shadow: 0 0 0 1px var(--focus-border), 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        .editor-highlights,
        textarea#promptInput {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 16px 18px;
            box-sizing: border-box;
            font-family: var(--vscode-editor-font-family, Menlo, Monaco, Consolas, 'Courier New', monospace);
            font-size: 13.5px;
            line-height: 1.65;
            letter-spacing: -0.01em;
            white-space: pre-wrap;
            word-break: break-word;
            overflow-wrap: break-word;
            tab-size: 4;
        }

        .editor-highlights {
            pointer-events: none;
            overflow-y: hidden;
            overflow-x: hidden;
            z-index: 1;
            color: transparent;
            user-select: none;
            -webkit-user-select: none;
        }

        /* 🔴 Google Speller Red Wavy Squiggly Underline */
        .editor-highlights mark.misspelled {
            color: transparent;
            background-color: transparent;
            text-decoration: underline wavy var(--typo-red) 1.5px;
            -webkit-text-decoration: underline wavy var(--typo-red) 1.5px;
            text-decoration-color: var(--typo-red);
            text-underline-offset: 3.5px;
            border-radius: 2px;
            cursor: pointer;
            transition: background-color 0.12s ease;
        }

        .editor-highlights mark.misspelled.active-hover {
            background-color: var(--typo-bg-hover);
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

        textarea#promptInput::placeholder {
            color: var(--muted);
            opacity: 0.5;
        }

        /* ── Action Buttons ──────────────────────────────────────── */
        .actions-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            flex-shrink: 0;
            padding-top: 2px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 13px;
            border-radius: 6px;
            border: 1px solid transparent;
            font-family: inherit;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.12s ease;
            white-space: nowrap;
        }

        .btn:active {
            transform: scale(0.98);
        }

        .btn-primary {
            background: var(--primary-bg);
            color: var(--primary-fg);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .btn-primary:hover {
            background: var(--primary-hover);
        }

        .btn-secondary {
            background: var(--secondary-bg);
            color: var(--secondary-fg);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover {
            background: var(--secondary-hover);
            border-color: var(--border-hover);
        }

        .btn-ghost {
            background: transparent;
            color: var(--muted);
            border: 1px solid transparent;
            margin-left: auto;
        }

        .btn-ghost:hover {
            color: var(--fg);
            background: var(--secondary-bg);
        }

        .kbd {
            display: inline-flex;
            align-items: center;
            font-family: inherit;
            font-size: 10px;
            font-weight: 500;
            padding: 1px 5px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid rgba(255, 255, 255, 0.12);
            opacity: 0.85;
            letter-spacing: 0.2px;
        }

        .btn-secondary .kbd {
            background: rgba(255, 255, 255, 0.07);
            border-color: rgba(255, 255, 255, 0.1);
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
            border-radius: 10px;
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.2);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            padding: 5px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 12.5px;
            animation: menuFadeIn 0.1s cubic-bezier(0.16, 1, 0.3, 1);
            transform-origin: top left;
        }

        @keyframes menuFadeIn {
            from {
                opacity: 0;
                transform: scale(0.96) translateY(-2px);
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
            gap: 6px;
            background: rgba(234, 67, 53, 0.12);
            border: 1px solid rgba(234, 67, 53, 0.3);
            color: #ff6b6b;
            padding: 2px 7px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }

        .menu-label {
            font-size: 10.5px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--muted);
        }

        .menu-suggestions-list {
            display: flex;
            flex-direction: column;
            gap: 1px;
            max-height: 180px;
            overflow-y: auto;
        }

        .menu-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            padding: 6px 9px;
            border-radius: 6px;
            background: transparent;
            color: inherit;
            border: none;
            font-family: inherit;
            font-size: 12.5px;
            cursor: pointer;
            text-align: left;
            transition: background 0.08s ease;
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

        .sugg-check {
            font-size: 11px;
            color: #34d399;
            opacity: 0.9;
        }

        .sugg-tag {
            font-size: 10px;
            color: var(--muted);
            font-weight: normal;
        }

        .menu-item:hover .sugg-tag {
            color: var(--menu-hover-fg);
            opacity: 0.75;
        }

        .menu-divider {
            height: 1px;
            background: var(--border);
            margin: 4px 2px;
        }

        .action-item {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 11.5px;
            color: var(--fg);
            opacity: 0.85;
            padding: 5px 9px;
        }

        .action-item:hover {
            opacity: 1;
        }

        .action-icon {
            opacity: 0.7;
        }

        .no-suggestions-text {
            padding: 8px 10px;
            color: var(--muted);
            font-style: italic;
            font-size: 11.5px;
        }

        /* ── Footer Tips & Toast ─────────────────────────────────── */
        .footer-tips {
            font-size: 11px;
            color: var(--muted);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            padding: 2px 2px 0 2px;
        }

        .tip-item {
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }

        .tip-kbd {
            font-family: inherit;
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 3px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--fg);
        }

        .toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(30px);
            background: var(--card-bg);
            color: var(--fg);
            border: 1px solid var(--border-hover);
            font-weight: 500;
            font-size: 12px;
            padding: 6px 14px;
            border-radius: 20px;
            opacity: 0;
            pointer-events: none;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            backdrop-filter: blur(16px);
            z-index: 20000;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="brand">
            <svg class="brand-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Prompt Spell Checker</span>
        </div>
        <div class="header-right">
            <span id="statsPill" class="stats-pill">0 words · 0 chars</span>
            <div id="statusBadge" class="status-pill status-clean">
                <span class="status-dot"></span>
                <span id="statusText">Clean</span>
            </div>
        </div>
    </header>

    <!-- 🎯 Interactive Google Speller Editor -->
    <div class="editor-container" id="editorContainer">
        <div class="editor-highlights" id="editorHighlights"></div>
        <textarea
            id="promptInput"
            placeholder="Type or paste your prompt here... (e.g. I dont knw what hapened here)"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
        ></textarea>
    </div>

    <!-- ⚡ Action Buttons -->
    <div class="actions-bar">
        <button id="btnFixAndPaste" class="btn btn-primary" title="Fix all typos and paste into chat (Ctrl+Shift+Enter)">
            <span>Fix & Paste to Chat</span>
            <kbd class="kbd">Ctrl+Shift+↵</kbd>
        </button>
        <button id="btnCopy" class="btn btn-secondary" title="Copy clean prompt (Ctrl+Enter)">
            <span>Copy Prompt</span>
            <kbd class="kbd">Ctrl+↵</kbd>
        </button>
        <button id="btnAutoFix" class="btn btn-secondary" title="Fix all typos in editor">
            <span>Auto-Fix All</span>
        </button>
        <button id="btnReplaceEditor" class="btn btn-secondary" style="display:none;" title="Replace in code editor">
            <span>Replace in Editor</span>
        </button>
        <button id="btnClear" class="btn btn-ghost" title="Clear text">
            <span>Clear</span>
        </button>
    </div>

    <!-- 💡 Footer Tips -->
    <footer class="footer-tips">
        <span class="tip-item"><kbd class="tip-kbd">Right-click</kbd> any underlined word to replace</span>
        <span class="tip-item"><kbd class="tip-kbd">Ctrl+Shift+Enter</kbd> to paste to chat</span>
    </footer>

    <!-- 🌟 Google Speller Floating Context Menu -->
    <div id="spellerContextMenu" class="speller-context-menu" style="display: none;">
        <div class="menu-header">
            <div class="menu-typo-pill">
                <span id="menuTypoWord">word</span>
            </div>
            <span class="menu-label">Suggestions</span>
        </div>
        <div id="menuSuggestionsList" class="menu-suggestions-list"></div>
        <div class="menu-divider"></div>
        <button id="menuBtnAddDict" class="menu-item action-item">
            <svg class="action-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add "<span id="menuDictWord">word</span>" to dictionary</span>
        </button>
        <button id="menuBtnIgnore" class="menu-item action-item">
            <svg class="action-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
            <span>Ignore word</span>
        </button>
    </div>

    <div id="toast" class="toast">
        <span id="toastIcon">✓</span>
        <span id="toastText">Copied to clipboard</span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const textarea = document.getElementById('promptInput');
        const editorHighlights = document.getElementById('editorHighlights');
        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');
        const statsPill = document.getElementById('statsPill');
        const btnFixAndPaste = document.getElementById('btnFixAndPaste');
        const btnCopy = document.getElementById('btnCopy');
        const btnAutoFix = document.getElementById('btnAutoFix');
        const btnReplaceEditor = document.getElementById('btnReplaceEditor');
        const btnClear = document.getElementById('btnClear');
        const toast = document.getElementById('toast');
        const toastIcon = document.getElementById('toastIcon');
        const toastText = document.getElementById('toastText');

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

        function showToast(text, icon = '✓') {
            toastText.textContent = text;
            toastIcon.textContent = icon;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 1600);
        }

        function updateStats() {
            const val = textarea.value;
            const words = val.trim() ? val.trim().split(/\s+/).length : 0;
            const chars = val.length;
            statsPill.textContent = words + (words === 1 ? ' word' : ' words') + ' · ' + chars + ' chars';
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

        // ── Synchronize Highlights Scroll ───────────────────────
        function syncSizeAndScroll() {
            editorHighlights.scrollTop = textarea.scrollTop;
            editorHighlights.scrollLeft = textarea.scrollLeft;
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
            updateStats();
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
                            '<span class="sugg-check">✓</span>' +
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
            updateStats();
            renderHighlights();

            vscode.postMessage({ command: 'checkText', text: newText });
            showToast('Replaced "' + misspelling.word + '" with "' + replacement + '"', '✓');
        }

        // ── Menu Action Buttons ───────────────────────────────────
        menuBtnAddDict.addEventListener('click', () => {
            if (activeMisspelling) {
                const word = activeMisspelling.word;
                ignoredWords.add(word.toLowerCase());
                hideContextMenu();
                vscode.postMessage({ command: 'addWord', word });
                showToast('Added "' + word + '" to dictionary', '+');
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
                showToast('Ignored "' + word + '" for session', '✓');
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
            showToast('Pasting into chat...', '⚡');
        });

        btnCopy.addEventListener('click', () => {
            vscode.postMessage({ command: 'copyToClipboard', text: textarea.value });
            showToast('Copied clean prompt', '✓');
        });

        btnReplaceEditor.addEventListener('click', () => {
            vscode.postMessage({ command: 'replaceInEditor', text: textarea.value });
            showToast('Replaced in editor', '✓');
        });

        btnAutoFix.addEventListener('click', () => {
            vscode.postMessage({ command: 'autoFixText', text: textarea.value });
        });

        btnClear.addEventListener('click', () => {
            textarea.value = '';
            currentMisspellings = [];
            ignoredWords.clear();
            updateStats();
            renderHighlights();
            renderResults([]);
            textarea.focus();
            showToast('Cleared editor', '✓');
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
                    updateStats();
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

        // ── Update Status Badge ───────────────────────────────────
        function renderResults(misspellings) {
            const activeErrors = misspellings.filter(m => !ignoredWords.has(m.word.toLowerCase()));

            if (activeErrors.length === 0) {
                statusBadge.className = 'status-pill status-clean';
                statusText.textContent = 'Clean';
                return;
            }

            statusBadge.className = 'status-pill status-errors';
            statusText.textContent = activeErrors.length + (activeErrors.length === 1 ? ' typo' : ' typos');
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
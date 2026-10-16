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
                    if (this._targetEditor && this._targetRange) {
                        await this._targetEditor.edit(editBuilder => {
                            editBuilder.replace(this._targetRange, message.text);
                        });
                        this.dispose();
                        vscode.window.showInformationMessage('⚡ Fixed & replaced in editor!');
                    }
                    else {
                        // Close webview panel so focus immediately returns to AI Chat box / previously focused element
                        this.dispose();
                        await new Promise(resolve => setTimeout(resolve, 80));
                        await selectionCapture_1.SelectionCapture.pasteToOS(30);
                        vscode.window.showInformationMessage('⚡ Fixed & pasted back into chat!');
                    }
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
            --badge-bg: rgba(235, 87, 87, 0.15);
            --badge-border: rgba(235, 87, 87, 0.5);
            --badge-fg: #ff6b6b;
            --sugg-bg: rgba(0, 122, 204, 0.15);
            --sugg-border: rgba(0, 122, 204, 0.4);
            --sugg-fg: #61afef;
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
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
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
            transition: all 0.2s;
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

        .textarea-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 120px;
        }

        textarea {
            width: 100%;
            height: 100%;
            min-height: 120px;
            background: var(--card-bg);
            color: var(--fg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 12px;
            font-family: inherit;
            font-size: 13px;
            line-height: 1.5;
            resize: none;
            outline: none;
            transition: border-color 0.2s;
        }

        textarea:focus {
            border-color: var(--accent);
        }

        .actions-bar {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        button {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            border-radius: 4px;
            border: none;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s, transform 0.05s;
        }

        button:active {
            transform: scale(0.98);
        }

        .btn-primary {
            background: var(--accent);
            color: var(--btn-fg);
        }

        .btn-primary:hover {
            background: var(--accent-hover);
        }

        .btn-secondary {
            background: var(--sec-bg);
            color: var(--sec-fg);
        }

        .btn-secondary:hover {
            background: var(--sec-hover);
        }

        .issues-panel {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 12px;
            max-height: 230px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .issues-header {
            font-size: 11px;
            font-weight: 600;
            color: var(--fg);
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .issue-card {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 8px 10px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 5px;
            border-left: 3px solid var(--badge-fg);
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
            padding: 4px 10px;
            border-radius: 14px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }

        .sugg-chip:hover {
            background: var(--accent);
            color: var(--btn-fg);
            border-color: var(--accent);
            transform: translateY(-1px);
        }

        .empty-state {
            padding: 16px;
            text-align: center;
            color: var(--fg);
            opacity: 0.7;
            font-size: 12px;
        }

        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(40px);
            background: #2ecc71;
            color: #000;
            font-weight: 600;
            font-size: 12px;
            padding: 6px 16px;
            border-radius: 20px;
            opacity: 0;
            pointer-events: none;
            transition: all 0.25s ease;
        }

        .toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        .footer-tips {
            font-size: 11px;
            opacity: 0.6;
            display: flex;
            justify-content: space-between;
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

    <div class="textarea-container">
        <textarea id="promptInput" placeholder="Type or paste your AI prompt here... (e.g. I dont knw what hapened here)"></textarea>
    </div>

    <div class="actions-bar">
        <button id="btnFixAndPaste" class="btn-primary" style="background: #2ecc71; color: #000; font-weight: 600;" title="Auto-fix typos and paste directly back into AI Chat box (Ctrl+Shift+Enter)">
            ⚡ Fix & Paste to Chat
        </button>
        <button id="btnCopy" class="btn-secondary" title="Copy clean prompt to clipboard (Ctrl+Enter)">
            📋 Copy Clean Prompt
        </button>
        <button id="btnAutoFix" class="btn-secondary" title="Fix all typos automatically and copy">
            ✨ Auto-Fix All & Copy
        </button>
        <button id="btnReplaceEditor" class="btn-secondary" style="display:none;" title="Replace in code editor">
            🔄 Replace in Editor
        </button>
    </div>

    <div class="issues-panel" id="issuesPanel">
        <div class="issues-header">Misspellings & Suggestions</div>
        <div id="issuesList">
            <div class="empty-state">No spelling mistakes detected. Your prompt is ready!</div>
        </div>
    </div>

    <div class="footer-tips">
        <span>⚡ <b>Ctrl+Shift+Enter</b> fixes & pastes directly to AI Chat</span>
        <span>📋 <b>Ctrl+Enter</b> copies clean prompt</span>
    </div>

    <div id="toast" class="toast">📋 Copied to clipboard!</div>

    <script>
        const vscode = acquireVsCodeApi();
        const textarea = document.getElementById('promptInput');
        const statusBadge = document.getElementById('statusBadge');
        const issuesList = document.getElementById('issuesList');
        const btnFixAndPaste = document.getElementById('btnFixAndPaste');
        const btnCopy = document.getElementById('btnCopy');
        const btnAutoFix = document.getElementById('btnAutoFix');
        const btnReplaceEditor = document.getElementById('btnReplaceEditor');
        const toast = document.getElementById('toast');

        let currentMisspellings = [];
        let debounceTimer = null;

        function showToast(text) {
            toast.textContent = text;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 1500);
        }

        textarea.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                vscode.postMessage({ command: 'checkText', text: textarea.value });
            }, 180);
        });

        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                btnFixAndPaste.click();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                btnCopy.click();
            }
        });

        btnFixAndPaste.addEventListener('click', () => {
            let text = textarea.value;
            let count = 0;
            if (currentMisspellings.length > 0) {
                const sorted = [...currentMisspellings].sort((a, b) => b.start - a.start);
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
            showToast('📋 Copied to clipboard!');
        });

        btnReplaceEditor.addEventListener('click', () => {
            vscode.postMessage({ command: 'replaceInEditor', text: textarea.value });
            showToast('✅ Replaced in editor!');
        });

        btnAutoFix.addEventListener('click', () => {
            if (currentMisspellings.length === 0) {
                btnCopy.click();
                return;
            }

            let text = textarea.value;
            const sorted = [...currentMisspellings].sort((a, b) => b.start - a.start);
            let count = 0;
            for (const m of sorted) {
                if (m.suggestions && m.suggestions.length > 0) {
                    text = text.slice(0, m.start) + m.suggestions[0] + text.slice(m.end);
                    count++;
                }
            }
            textarea.value = text;
            vscode.postMessage({ command: 'copyToClipboard', text: textarea.value });
            vscode.postMessage({ command: 'checkText', text: textarea.value });
            showToast('⚡ Fixed ' + count + ' typo(s) & copied!');
        });

        function replaceWord(start, end, replacement) {
            const text = textarea.value;
            textarea.value = text.slice(0, start) + replacement + text.slice(end);
            vscode.postMessage({ command: 'checkText', text: textarea.value });
            showToast('Replaced with "' + replacement + '"');
        }

        function addToDict(word) {
            vscode.postMessage({ command: 'addWord', word });
        }

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
                    textarea.focus();
                    break;
                case 'spellResults':
                    renderResults(msg.misspellings || []);
                    break;
            }
        });

        function renderResults(misspellings) {
            currentMisspellings = misspellings;
            issuesList.innerHTML = '';

            if (misspellings.length === 0) {
                statusBadge.textContent = '✅ No typos found';
                statusBadge.className = 'status-badge clean';
                issuesList.innerHTML = '<div class="empty-state">No spelling mistakes detected. Your prompt is ready!</div>';
                return;
            }

            statusBadge.textContent = misspellings.length + ' typo(s) found';
            statusBadge.className = 'status-badge has-errors';

            misspellings.forEach(m => {
                const card = document.createElement('div');
                card.className = 'issue-card';

                const wordRow = document.createElement('div');
                wordRow.className = 'issue-word-row';

                const wordLabel = document.createElement('span');
                wordLabel.className = 'issue-word';
                wordLabel.textContent = m.word;

                const dictBtn = document.createElement('button');
                dictBtn.className = 'issue-btn-dict';
                dictBtn.textContent = '+ Add to Dictionary';
                dictBtn.onclick = () => addToDict(m.word);

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
                        chip.onclick = () => replaceWord(m.start, m.end, sugg);
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

        // Notify extension that Webview is ready
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
    }
}
exports.PromptCheckerPanel = PromptCheckerPanel;
//# sourceMappingURL=promptCheckerWebview.js.map
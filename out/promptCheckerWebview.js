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
    _aiProofreader;
    _disposables = [];
    _currentText = '';
    _targetEditor;
    _targetRange;
    static createOrShow(extensionUri, spellEngine, userDictionary, getConfig, aiProofreader, initialText, targetEditor, targetRange) {
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
        PromptCheckerPanel.currentPanel = new PromptCheckerPanel(panel, extensionUri, spellEngine, userDictionary, getConfig, aiProofreader, initialText ?? '', targetEditor, targetRange);
    }
    constructor(panel, extensionUri, spellEngine, userDictionary, getConfig, aiProofreader, initialText, targetEditor, targetRange) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._spellEngine = spellEngine;
        this._userDictionary = userDictionary;
        this._getConfig = getConfig;
        this._aiProofreader = aiProofreader;
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
                    let cleanText = message.text || '';
                    const config = this._getConfig();
                    if (this._aiProofreader && cleanText.trim()) {
                        try {
                            const aiRes = await this._aiProofreader.proofread(cleanText, config.aiProofreader);
                            cleanText = aiRes.fixedText;
                        }
                        catch (e) {
                            // Handled by proofread fallback
                        }
                    }
                    await vscode.env.clipboard.writeText(cleanText);
                    // Close webview panel
                    this.dispose();
                    // Short wait for webview panel to close
                    await new Promise(resolve => setTimeout(resolve, 80));
                    // Focus the AI Chat box and paste the clean prompt
                    await selectionCapture_1.SelectionCapture.pasteToChat(30);
                    vscode.window.setStatusBarMessage('✨ Fixed & pasted back into chat!', 4000);
                    break;
                }
                case 'applyAiAutoFix': {
                    const originalText = message.text || '';
                    if (!originalText.trim())
                        break;
                    const config = this._getConfig();
                    let result;
                    if (this._aiProofreader) {
                        result = await this._aiProofreader.proofread(originalText, config.aiProofreader);
                    }
                    else {
                        result = {
                            originalText,
                            fixedText: originalText,
                            changes: [],
                            providerUsed: 'none',
                            durationMs: 0
                        };
                    }
                    this._currentText = result.fixedText;
                    this._panel.webview.postMessage({
                        command: 'loadText',
                        text: result.fixedText,
                        hasEditorTarget: !!(this._targetEditor && this._targetRange)
                    });
                    this._analyzeAndSend(result.fixedText);
                    const count = result.changes ? result.changes.length : 0;
                    vscode.window.showInformationMessage(`✨ AI Auto-fixed ${count} issue(s) (${result.providerUsed})!`);
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
                case 'pasteFromClipboard': {
                    const clipText = await vscode.env.clipboard.readText();
                    if (clipText && clipText.trim()) {
                        this._currentText = clipText;
                        this._panel.webview.postMessage({
                            command: 'loadText',
                            text: clipText,
                            hasEditorTarget: !!(this._targetEditor && this._targetRange)
                        });
                        this._analyzeAndSend(clipText);
                        vscode.window.showInformationMessage('📋 Pasted prompt from clipboard!');
                    }
                    else {
                        vscode.window.showWarningMessage('Clipboard contains no text.');
                    }
                    break;
                }
                case 'requestDiff': {
                    const originalText = message.text || '';
                    const { text: phraseFixed, count: pCount } = (0, typoRules_1.applyContextualPhraseFixes)(originalText);
                    let finalText = phraseFixed;
                    const config = this._getConfig();
                    const misspellings = this._spellEngine.findMisspellings(finalText, config);
                    let totalCount = pCount;
                    const sorted = [...misspellings].sort((a, b) => b.start - a.start);
                    const wordChanges = [];
                    for (const m of sorted) {
                        if (m.suggestions && m.suggestions.length > 0 && m.suggestions[0] !== m.word) {
                            wordChanges.unshift({ original: m.word, fixed: m.suggestions[0] });
                            finalText = finalText.slice(0, m.start) + m.suggestions[0] + finalText.slice(m.end);
                            totalCount++;
                        }
                    }
                    this._panel.webview.postMessage({
                        command: 'diffResult',
                        originalText: originalText,
                        fixedText: finalText,
                        fixesCount: totalCount,
                        wordChanges: wordChanges
                    });
                    break;
                }
                case 'requestAiProofread': {
                    const originalText = message.text || '';
                    if (!originalText.trim()) {
                        vscode.window.showWarningMessage('Please enter text to proofread with AI.');
                        break;
                    }
                    const config = this._getConfig();
                    let result;
                    if (this._aiProofreader) {
                        result = await this._aiProofreader.proofread(originalText, config.aiProofreader);
                    }
                    else {
                        result = {
                            originalText,
                            fixedText: originalText,
                            changes: [],
                            providerUsed: 'none',
                            durationMs: 0
                        };
                    }
                    this._panel.webview.postMessage({
                        command: 'aiProofreadResult',
                        originalText: result.originalText,
                        fixedText: result.fixedText,
                        changes: result.changes,
                        providerUsed: result.providerUsed,
                        durationMs: result.durationMs
                    });
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
    <title>AI Prompt Spell Assistant</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background, #1e1e1e);
            --fg: var(--vscode-editor-foreground, #cccccc);
            --muted: var(--vscode-descriptionForeground, #888888);
            --card-bg: var(--vscode-editorWidget-background, #252526);
            --card-hover: rgba(255, 255, 255, 0.04);
            --border: var(--vscode-widget-border, rgba(255, 255, 255, 0.09));
            --border-hover: rgba(255, 255, 255, 0.18);
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

            /* Speller Underline & Status Colors */
            --typo-red: #ea4335;
            --typo-bg-hover: rgba(234, 67, 53, 0.14);
            --clean-green: #34d399;
            --clean-bg: rgba(52, 211, 153, 0.1);
            --clean-border: rgba(52, 211, 153, 0.25);
            --error-red: #f87171;
            --error-bg: rgba(248, 113, 113, 0.1);
            --error-border: rgba(248, 113, 113, 0.25);

            /* Mode Accents */
            --accent-instant: #38bdf8;
            --accent-instant-bg: rgba(56, 189, 248, 0.08);
            --accent-instant-border: rgba(56, 189, 248, 0.22);
            --accent-review: #a78bfa;
            --accent-review-bg: rgba(167, 139, 250, 0.08);
            --accent-review-border: rgba(167, 139, 250, 0.25);
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
            padding: 14px 18px;
            display: flex;
            flex-direction: column;
            gap: 10px;
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
            gap: 12px;
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
            color: var(--primary-hover);
            flex-shrink: 0;
        }

        .header-center {
            display: inline-flex;
            align-items: center;
        }

        .view-switch {
            display: inline-flex;
            background: var(--secondary-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 2px;
            gap: 2px;
        }

        .tab-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: transparent;
            border: none;
            color: var(--muted);
            font-family: inherit;
            font-size: 11.5px;
            font-weight: 500;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.12s ease;
        }

        .tab-btn:hover {
            color: var(--fg);
        }

        .tab-btn.active {
            background: var(--card-bg);
            color: var(--fg);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            font-weight: 600;
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
            padding: 3px 8px;
            background: var(--secondary-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            white-space: nowrap;
        }

        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 500;
            padding: 3px 9px;
            border-radius: 12px;
            transition: all 0.2s ease;
            white-space: nowrap;
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

        @keyframes pulseClean {
            0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5); }
            70% { box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); }
            100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
        }

        .status-pill.pulse-clean {
            animation: pulseClean 1.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* ── Shortcut Workflow Banner (Alt+W vs Alt+Q) ─────────────── */
        .shortcut-banner {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            flex-shrink: 0;
        }

        .shortcut-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 7px;
            padding: 8px 12px;
            display: flex;
            flex-direction: column;
            gap: 3px;
            transition: all 0.15s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }

        .shortcut-card:hover {
            border-color: var(--border-hover);
            background: var(--card-hover);
        }

        .shortcut-card.mode-alt-w {
            border-left: 3px solid var(--accent-instant);
        }

        .shortcut-card.mode-alt-q {
            border-left: 3px solid var(--accent-review);
        }

        .shortcut-card.active {
            background: rgba(255, 255, 255, 0.03);
        }

        .shortcut-card-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
        }

        .shortcut-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11.5px;
            font-weight: 600;
            color: var(--fg);
        }

        .shortcut-tag {
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 10px;
            font-weight: 600;
            letter-spacing: 0.2px;
            text-transform: uppercase;
        }

        .tag-instant {
            background: var(--accent-instant-bg);
            border: 1px solid var(--accent-instant-border);
            color: var(--accent-instant);
        }

        .tag-active {
            background: var(--accent-review-bg);
            border: 1px solid var(--accent-review-border);
            color: var(--accent-review);
        }

        .shortcut-desc {
            font-size: 11px;
            color: var(--muted);
            line-height: 1.35;
        }

        /* ── Editor Container ────────────────────────────────────── */
        .editor-container {
            position: relative;
            flex: 1;
            min-height: 160px;
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
            padding: 14px 16px;
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
            opacity: 0.45;
        }

        /* ── Empty State ─────────────────────────────────────────── */
        .empty-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            z-index: 5;
            pointer-events: none;
            padding: 24px;
            text-align: center;
            background: var(--card-bg);
            transition: opacity 0.15s ease;
        }

        .empty-overlay.hidden {
            display: none !important;
        }

        .empty-icon-wrap {
            color: var(--accent-review);
            opacity: 0.9;
        }

        .empty-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--fg);
        }

        .empty-subtitle {
            font-size: 11.5px;
            color: var(--muted);
            max-width: 380px;
            line-height: 1.4;
        }

        .empty-shortcuts-box {
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: var(--secondary-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 10px 14px;
            width: 100%;
            max-width: 440px;
            text-align: left;
        }

        .empty-shortcut-row {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 11.5px;
        }

        .empty-shortcut-text {
            display: flex;
            flex-direction: column;
            line-height: 1.3;
        }

        .empty-shortcut-text strong {
            color: var(--fg);
            font-weight: 600;
        }

        .empty-shortcut-text span {
            color: var(--muted);
            font-size: 10.5px;
        }

        .empty-actions {
            margin-top: 4px;
        }

        .empty-paste-btn {
            pointer-events: auto;
            background: var(--secondary-bg);
            border: 1px solid var(--border);
        }

        .empty-paste-btn:hover {
            background: var(--secondary-hover);
        }

        /* ── Diff Comparison View ─────────────────────────────────── */
        .diff-container {
            position: relative;
            flex: 1;
            min-height: 160px;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .diff-header-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 14px;
            border-bottom: 1px solid var(--border);
            background: rgba(255, 255, 255, 0.02);
            flex-shrink: 0;
        }

        .diff-summary-badge {
            font-size: 12px;
            font-weight: 600;
            color: var(--clean-green);
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .diff-actions {
            display: inline-flex;
            gap: 8px;
        }

        .btn-sm {
            padding: 4px 10px !important;
            font-size: 11px !important;
        }

        .diff-content {
            flex: 1;
            padding: 16px 18px;
            font-family: var(--vscode-editor-font-family, Menlo, Monaco, Consolas, monospace);
            font-size: 13.5px;
            line-height: 1.7;
            white-space: pre-wrap;
            word-break: break-word;
            overflow-y: auto;
        }

        .diff-del {
            background: rgba(234, 67, 53, 0.15);
            color: #ff6b6b;
            text-decoration: line-through;
            padding: 1px 4px;
            border-radius: 3px;
            margin-right: 2px;
        }

        .diff-add {
            background: rgba(52, 211, 153, 0.18);
            color: #34d399;
            font-weight: 600;
            padding: 1px 4px;
            border-radius: 3px;
            margin-right: 4px;
        }

        .diff-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: var(--secondary-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 4px 8px;
            font-size: 11px;
            margin: 3px;
        }

        .diff-chips-panel {
            margin-bottom: 14px;
            padding-bottom: 12px;
            border-bottom: 1px dashed var(--border);
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            align-items: center;
        }

        .diff-clean-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--clean-green);
            gap: 8px;
            text-align: center;
            padding: 40px 20px;
        }

        /* ── Action Buttons ──────────────────────────────────────── */
        .actions-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
            flex-wrap: wrap;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 6px 12px;
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

        .btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            pointer-events: none;
        }

        .btn-primary {
            background: var(--primary-bg);
            color: var(--primary-fg);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 1px 3px rgba(0, 0, 0, 0.2);
            font-weight: 600;
        }

        .btn-primary:hover {
            background: var(--primary-hover);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 2px 6px rgba(0, 0, 0, 0.25);
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

        .actions-right {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-left: auto;
        }

        .btn-ghost {
            background: transparent;
            color: var(--muted);
            border: 1px solid transparent;
            padding: 6px 9px;
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
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            opacity: 0.9;
            letter-spacing: 0.2px;
        }

        .kbd-accent {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.18);
            font-weight: 600;
            color: var(--fg);
        }

        .kbd-light {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.25);
            color: #ffffff;
        }

        /* ── Google Speller Context Menu ─────────────────────────── */
        .speller-context-menu {
            position: fixed;
            z-index: 10000;
            min-width: 220px;
            max-width: 320px;
            background: var(--menu-bg);
            color: var(--menu-fg);
            border: 1px solid var(--menu-border);
            border-radius: 8px;
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
            border-radius: 5px;
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
            flex-shrink: 0;
        }

        .no-suggestions-text {
            padding: 8px 10px;
            color: var(--muted);
            font-style: italic;
            font-size: 11.5px;
        }

        /* ── Footer Tips ─────────────────────────────────────────── */
        .footer-tips {
            font-size: 11px;
            color: var(--muted);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            padding-top: 2px;
        }

        .footer-left {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .footer-dot {
            opacity: 0.4;
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

        /* ── Toast ───────────────────────────────────────────────── */
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

        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background, rgba(255, 255, 255, 0.15));
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground, rgba(255, 255, 255, 0.25));
        }
    </style>
</head>
<body>
    <!-- ── Header ───────────────────────────────────────────── -->
    <header class="header">
        <div class="brand">
            <svg class="brand-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Prompt Spell Assistant</span>
        </div>

        <div class="header-center">
            <div class="view-switch">
                <button id="tabEditor" class="tab-btn active" type="button" title="Interactive Editor View">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <span>Inspector</span>
                </button>
                <button id="tabDiff" class="tab-btn" type="button" title="Visual Diff & Change Comparison">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                    <span>Diff View</span>
                </button>
            </div>
        </div>

        <div class="header-right">
            <span id="statsPill" class="stats-pill">0 words · 0 chars</span>
            <div id="statusBadge" class="status-pill status-clean">
                <span class="status-dot"></span>
                <span id="statusText">Clean</span>
            </div>
        </div>
    </header>

    <!-- ── Shortcut Workflow Banner (Alt+W vs Alt+Q) ─────────── -->
    <section class="shortcut-banner">
        <div class="shortcut-card mode-alt-w" id="cardAltW" title="Click to see what Alt+W does or try quick fix">
            <div class="shortcut-card-top">
                <div class="shortcut-badge">
                    <kbd class="kbd kbd-accent">Alt+W</kbd>
                    <span>Instant Auto-Fix</span>
                </div>
                <span class="shortcut-tag tag-instant">In-Place • 0 Clicks</span>
            </div>
            <div class="shortcut-desc">
                Replaces typos &amp; phrases directly where you type (AI Chat input or editor) without opening any window.
            </div>
        </div>

        <div class="shortcut-card mode-alt-q active" id="cardAltQ" title="Alt+Q opened this interactive panel">
            <div class="shortcut-card-top">
                <div class="shortcut-badge">
                    <kbd class="kbd kbd-accent">Alt+Q</kbd>
                    <span>Interactive Review</span>
                </div>
                <span class="shortcut-tag tag-active">Current Panel</span>
            </div>
            <div class="shortcut-desc">
                Review red wavy squigglies, click words for smart suggestions, view diffs &amp; customize dictionary.
            </div>
        </div>
    </section>

    <!-- 🎯 Interactive Google Speller Editor -->
    <div class="editor-container" id="editorContainer">
        <div class="editor-highlights" id="editorHighlights"></div>
        <textarea
            id="promptInput"
            placeholder="Type or paste your prompt here to check spelling & phrases..."
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
        ></textarea>
        <div id="emptyOverlay" class="empty-overlay">
            <div class="empty-icon-wrap">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
            </div>
            <div class="empty-title">Ready to Proofread Prompt</div>
            <div class="empty-subtitle">Type directly below or choose how you like to work:</div>

            <div class="empty-shortcuts-box">
                <div class="empty-shortcut-row">
                    <kbd class="kbd kbd-accent">Alt + W</kbd>
                    <div class="empty-shortcut-text">
                        <strong>Instant Auto-Fix in Chat Box</strong>
                        <span>Fixes &amp; pastes prompt in-place with 0 clicks (30ms speed)</span>
                    </div>
                </div>
                <div class="empty-shortcut-row">
                    <kbd class="kbd kbd-accent">Alt + Q</kbd>
                    <div class="empty-shortcut-text">
                        <strong>Interactive Inspector Panel</strong>
                        <span>Review red wavy squigglies, choose suggestions &amp; view diffs</span>
                    </div>
                </div>
            </div>

            <div class="empty-actions">
                <button id="btnEmptyPaste" class="btn btn-secondary empty-paste-btn btn-sm" type="button">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>Paste from Clipboard</span>
                </button>
            </div>
        </div>
    </div>

    <!-- 🔍 Diff Comparison View -->
    <div id="diffContainer" class="diff-container" style="display: none;">
        <div class="diff-header-bar">
            <span id="diffSummaryBadge" class="diff-summary-badge">✨ 0 improvements found</span>
            <div class="diff-actions">
                <button id="btnDiffApply" class="btn btn-primary btn-sm" type="button" title="Apply all fixes to editor">
                    <span>Apply Fixes</span>
                </button>
                <button id="btnDiffCopy" class="btn btn-secondary btn-sm" type="button" title="Copy fixed text">
                    <span>Copy Fixed Prompt</span>
                </button>
            </div>
        </div>
        <div class="diff-content" id="diffContent"></div>
    </div>

    <!-- ⚡ Action Buttons -->
    <div class="actions-bar">
        <!-- Primary Action -->
        <button id="btnFixAndPaste" class="btn btn-primary" title="Fix all typos and paste into AI chat (Ctrl+Shift+Enter)">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>Fix &amp; Paste to Chat</span>
            <kbd class="kbd kbd-light">Ctrl+Shift+↵</kbd>
        </button>

        <!-- Secondary Action: Auto-Fix inside box -->
        <button id="btnAiAutoFix" class="btn btn-secondary" title="Auto-fix all typos inside this editor">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v3m6.364 1.636l-2.121 2.121M21 12h-3m1.636 6.364l-2.121-2.121M12 21v-3m-6.364 1.636l2.121-2.121M3 12h3m-1.636-6.364l2.121 2.121"></path>
            </svg>
            <span>Auto-Fix All</span>
        </button>

        <!-- Secondary Action: Copy Clean -->
        <button id="btnCopy" class="btn btn-secondary" title="Copy clean prompt (Ctrl+Enter)">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy Clean</span>
            <kbd class="kbd">Ctrl+↵</kbd>
        </button>

        <!-- Editor Replace (when editor target active) -->
        <button id="btnReplaceEditor" class="btn btn-secondary" style="display:none;" title="Replace in code editor">
            <span>Replace in Editor</span>
        </button>

        <!-- Right utility actions -->
        <div class="actions-right">
            <button id="btnUndo" class="btn btn-ghost" title="Undo change (Ctrl+Z)" disabled>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
                <span>Undo</span>
            </button>
            <button id="btnClear" class="btn btn-ghost" title="Clear text">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>Clear</span>
            </button>
        </div>
    </div>

    <!-- 💡 Footer Tips -->
    <footer class="footer-tips">
        <div class="footer-left">
            <span class="tip-item"><kbd class="tip-kbd">Alt+W</kbd> Instant fix in chat</span>
            <span class="footer-dot">•</span>
            <span class="tip-item"><kbd class="tip-kbd">Alt+Q</kbd> Interactive inspector</span>
            <span class="footer-dot">•</span>
            <span class="tip-item"><kbd class="tip-kbd">Ctrl+Shift+Enter</kbd> Fix &amp; paste</span>
        </div>
        <div>
            <span>Click or right-click any red underline to choose suggestions</span>
        </div>
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
            <span>Ignore for this session</span>
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
        const btnAiAutoFix = document.getElementById('btnAiAutoFix');
        const btnUndo = document.getElementById('btnUndo');
        const btnReplaceEditor = document.getElementById('btnReplaceEditor');
        const btnClear = document.getElementById('btnClear');
        const toast = document.getElementById('toast');
        const toastIcon = document.getElementById('toastIcon');
        const toastText = document.getElementById('toastText');

        // Shortcut Banner Cards
        const cardAltW = document.getElementById('cardAltW');
        const cardAltQ = document.getElementById('cardAltQ');

        // View Tabs and Diff elements
        const tabEditor = document.getElementById('tabEditor');
        const tabDiff = document.getElementById('tabDiff');
        const editorContainer = document.getElementById('editorContainer');
        const diffContainer = document.getElementById('diffContainer');
        const diffSummaryBadge = document.getElementById('diffSummaryBadge');
        const diffContent = document.getElementById('diffContent');
        const btnDiffApply = document.getElementById('btnDiffApply');
        const btnDiffCopy = document.getElementById('btnDiffCopy');
        const emptyOverlay = document.getElementById('emptyOverlay');
        const btnEmptyPaste = document.getElementById('btnEmptyPaste');

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
        let historyStack = [];
        let redoStack = [];
        let lastDiffResult = null;

        function updateEmptyState() {
            if (!textarea.value || textarea.value.trim().length === 0) {
                if (emptyOverlay) emptyOverlay.classList.remove('hidden');
            } else {
                if (emptyOverlay) emptyOverlay.classList.add('hidden');
            }
        }

        function pushHistory() {
            historyStack.push(textarea.value);
            if (historyStack.length > 50) historyStack.shift();
            redoStack = [];
            updateUndoState();
        }

        function updateUndoState() {
            if (btnUndo) {
                btnUndo.disabled = historyStack.length === 0;
            }
        }

        function undo() {
            if (historyStack.length === 0) return;
            redoStack.push(textarea.value);
            const prev = historyStack.pop();
            textarea.value = prev;
            updateUndoState();
            updateEmptyState();
            updateStats();
            renderHighlights();
            vscode.postMessage({ command: 'checkText', text: prev });
            showToast('Undo', '↺');
        }

        function redo() {
            if (redoStack.length === 0) return;
            historyStack.push(textarea.value);
            const next = redoStack.pop();
            textarea.value = next;
            updateUndoState();
            updateEmptyState();
            updateStats();
            renderHighlights();
            vscode.postMessage({ command: 'checkText', text: next });
            showToast('Redo', '↻');
        }

        function showToast(text, icon = '✓') {
            toastText.textContent = text;
            toastIcon.textContent = icon;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 1700);
        }

        function updateStats() {
            const val = textarea.value;
            const words = val.trim() ? val.trim().split(/\\s+/).length : 0;
            const chars = val.length;
            const tokens = Math.ceil(words * 1.33);
            statsPill.textContent = (words > 0 ? '~' + tokens + ' tokens · ' : '') + words + (words === 1 ? ' word' : ' words') + ' · ' + chars + ' chars';
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

            if (text.endsWith('\\n')) {
                html += '\\n';
            }

            editorHighlights.innerHTML = html;
        }

        // ── Real-time Input Checking ──────────────────────────────
        textarea.addEventListener('input', () => {
            updateEmptyState();
            updateStats();
            renderHighlights();
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                vscode.postMessage({ command: 'checkText', text: textarea.value });
            }, 160);
        });

        // ── Find Misspelling at Point or Offset ───────────────────
        function findMisspelling(clientX, clientY, textOffset) {
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
            pushHistory();
            const original = textarea.value;
            const before = original.slice(0, misspelling.start);
            const after = original.slice(misspelling.end);
            const newText = before + replacement + after;
            textarea.value = newText;

            const newCursor = misspelling.start + replacement.length;
            textarea.setSelectionRange(newCursor, newCursor);
            textarea.focus();

            hideContextMenu();
            updateEmptyState();
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
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                } else {
                    e.preventDefault();
                    undo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                btnFixAndPaste.click();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                btnCopy.click();
            }
        });

        // ── Card Alt+W & Alt+Q Interactions ───────────────────────
        if (cardAltW) {
            cardAltW.addEventListener('click', () => {
                if (textarea.value.trim().length > 0) {
                    btnFixAndPaste.click();
                } else {
                    showToast('Alt+W runs instant fix directly in your chat/editor!', '⚡');
                }
            });
        }

        if (cardAltQ) {
            cardAltQ.addEventListener('click', () => {
                textarea.focus();
                showToast('Alt+Q opens this live inspector panel', '🔍');
            });
        }

        // ── Main Action Bar Handlers ──────────────────────────────
        btnFixAndPaste.addEventListener('click', () => {
            let text = textarea.value;
            let count = 0;
            const activeErrors = currentMisspellings.filter(m => !ignoredWords.has(m.word.toLowerCase()));

            if (activeErrors.length > 0) {
                pushHistory();
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
            showToast('Pasting clean prompt into chat...', '⚡');
        });

        btnCopy.addEventListener('click', () => {
            vscode.postMessage({ command: 'copyToClipboard', text: textarea.value });
            const origSpan = btnCopy.querySelector('span');
            if (origSpan) {
                const prev = origSpan.textContent;
                origSpan.textContent = 'Copied!';
                btnCopy.style.borderColor = 'var(--clean-green)';
                btnCopy.style.color = 'var(--clean-green)';
                setTimeout(() => {
                    origSpan.textContent = prev;
                    btnCopy.style.borderColor = '';
                    btnCopy.style.color = '';
                }, 1400);
            }
            showToast('Copied clean prompt', '✓');
        });

        btnReplaceEditor.addEventListener('click', () => {
            vscode.postMessage({ command: 'replaceInEditor', text: textarea.value });
            showToast('Replaced in editor', '✓');
        });

        if (btnAiAutoFix) {
            btnAiAutoFix.addEventListener('click', () => {
                if (!textarea.value || !textarea.value.trim()) {
                    showToast('Enter prompt to auto-fix', '⚠️');
                    return;
                }
                pushHistory();
                btnAiAutoFix.disabled = true;
                const origHtml = btnAiAutoFix.innerHTML;
                btnAiAutoFix.innerHTML = '<span>Fixing...</span>';
                vscode.postMessage({
                    command: 'applyAiAutoFix',
                    text: textarea.value
                });
                setTimeout(() => {
                    btnAiAutoFix.disabled = false;
                    btnAiAutoFix.innerHTML = origHtml;
                }, 1200);
            });
        }

        if (btnUndo) {
            btnUndo.addEventListener('click', undo);
        }

        if (btnEmptyPaste) {
            btnEmptyPaste.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({ command: 'pasteFromClipboard' });
            });
        }

        if (tabEditor && tabDiff) {
            tabEditor.addEventListener('click', () => {
                tabEditor.classList.add('active');
                tabDiff.classList.remove('active');
                if (editorContainer) editorContainer.style.display = 'block';
                if (diffContainer) diffContainer.style.display = 'none';
                textarea.focus();
            });

            tabDiff.addEventListener('click', () => {
                tabDiff.classList.add('active');
                tabEditor.classList.remove('active');
                if (editorContainer) editorContainer.style.display = 'none';
                if (diffContainer) diffContainer.style.display = 'flex';
                vscode.postMessage({ command: 'requestAiProofread', text: textarea.value });
            });
        }

        if (btnDiffApply) {
            btnDiffApply.addEventListener('click', () => {
                if (lastDiffResult && lastDiffResult.fixedText) {
                    pushHistory();
                    textarea.value = lastDiffResult.fixedText;
                    if (tabEditor) tabEditor.click();
                    updateEmptyState();
                    updateStats();
                    renderHighlights();
                    vscode.postMessage({ command: 'checkText', text: textarea.value });
                    showToast('Applied all fixes to editor!', '⚡');
                }
            });
        }

        if (btnDiffCopy) {
            btnDiffCopy.addEventListener('click', () => {
                if (lastDiffResult && lastDiffResult.fixedText) {
                    vscode.postMessage({ command: 'copyToClipboard', text: lastDiffResult.fixedText });
                    showToast('Copied fixed prompt!', '✓');
                }
            });
        }

        btnClear.addEventListener('click', () => {
            if (textarea.value.trim()) {
                pushHistory();
            }
            textarea.value = '';
            currentMisspellings = [];
            ignoredWords.clear();
            updateEmptyState();
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
                    updateEmptyState();
                    updateStats();
                    renderHighlights();
                    textarea.focus();
                    break;
                case 'spellResults':
                    currentMisspellings = msg.misspellings || [];
                    renderHighlights();
                    renderResults(currentMisspellings);
                    break;
                case 'diffResult':
                    lastDiffResult = msg;
                    renderDiffView(msg);
                    break;
                case 'aiProofreadResult':
                    lastDiffResult = {
                        originalText: msg.originalText,
                        fixedText: msg.fixedText,
                        fixesCount: (msg.changes || []).length,
                        wordChanges: msg.changes,
                        providerUsed: msg.providerUsed,
                        durationMs: msg.durationMs
                    };
                    if (tabDiff) tabDiff.click();
                    renderDiffView(lastDiffResult);
                    showToast('Proofread ready (' + (msg.providerUsed || 'Local') + (msg.durationMs ? ' · ' + msg.durationMs + 'ms' : '') + ')', '✓');
                    break;
            }
        });

        // ── Render Diff Comparison View ───────────────────────────
        function renderDiffView(msg) {
            if (!diffContent || !diffSummaryBadge) return;
            const fixesCount = msg.fixesCount || 0;
            const orig = msg.originalText || '';
            const fixed = msg.fixedText || '';

            if (fixesCount === 0 || orig === fixed) {
                diffSummaryBadge.textContent = '✨ 100% Clean';
                diffSummaryBadge.style.color = 'var(--clean-green)';
                if (btnDiffApply) btnDiffApply.disabled = true;
                diffContent.innerHTML =
                    '<div class="diff-clean-card">' +
                        '<div style="font-size:28px;">✓</div>' +
                        '<div style="font-weight:600;font-size:14px;color:var(--clean-green);">Prompt is 100% Clean!</div>' +
                        '<div style="font-size:12px;color:var(--muted);max-width:320px;">No typos, phrase errors, contractions, or developer slip-ups found in this prompt.</div>' +
                    '</div>';
                return;
            }

            diffSummaryBadge.textContent = fixesCount + (fixesCount === 1 ? ' improvement found' : ' improvements found');
            diffSummaryBadge.style.color = 'var(--clean-green)';
            if (btnDiffApply) btnDiffApply.disabled = false;

            let html = '';

            if (msg.providerUsed) {
                html += '<div style="margin-bottom:10px;display:flex;align-items:center;gap:6px;">' +
                    '<span style="font-size:10.5px;padding:2px 8px;border-radius:10px;background:rgba(56,189,248,0.1);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);font-weight:600;">Engine: ' + escapeHtml(msg.providerUsed) + (msg.durationMs ? ' · ' + msg.durationMs + 'ms' : '') + '</span>' +
                '</div>';
            }

            if (msg.wordChanges && msg.wordChanges.length > 0) {
                html += '<div class="diff-chips-panel">';
                html += '<span style="font-size:11px;color:var(--muted);margin-right:4px;">Corrections:</span>';
                msg.wordChanges.forEach(c => {
                    const titleAttr = c.reason ? ' title="' + escapeHtml(c.reason) + '"' : '';
                    html += '<span class="diff-chip"' + titleAttr + '><span class="diff-del">' + escapeHtml(c.original) + '</span> → <span class="diff-add">' + escapeHtml(c.fixed) + '</span></span>';
                });
                html += '</div>';
            }

            let preview = escapeHtml(fixed);
            if (msg.wordChanges) {
                msg.wordChanges.forEach(c => {
                    const escFixed = escapeHtml(c.fixed);
                    const rep = '<span class="diff-add" title="Was: &quot;' + escapeHtml(c.original) + '&quot;">' + escFixed + '</span>';
                    preview = preview.split(escFixed).join(rep);
                });
            }

            html += '<div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Clean Prompt Preview</div>';
            html += '<div style="background:var(--secondary-bg);padding:14px;border-radius:6px;border:1px solid var(--border);line-height:1.7;">' + preview + '</div>';

            diffContent.innerHTML = html;
        }

        // ── Update Status Badge ───────────────────────────────────
        function renderResults(misspellings) {
            const activeErrors = misspellings.filter(m => !ignoredWords.has(m.word.toLowerCase()));

            if (activeErrors.length === 0) {
                statusBadge.className = 'status-pill status-clean';
                const hasText = textarea.value.trim().length > 0;
                statusText.textContent = hasText ? '100% Clean' : 'Clean';
                if (hasText) {
                    statusBadge.classList.add('pulse-clean');
                }
                return;
            }

            statusBadge.className = 'status-pill status-errors';
            statusBadge.classList.remove('pulse-clean');
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
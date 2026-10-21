// 🧩 Prompt Checker Webview Panel 🧩
// An interactive text box where users review misspellings and copy clean text directly.

import * as vscode from 'vscode';
import { SpellEngine } from './spellEngine';
import { ExtensionConfig, ProofreadResult } from './types';
import { UserDictionary } from './userDictionary';
import { SelectionCapture } from './selectionCapture';
import { applyContextualPhraseFixes } from './typoRules';
import { AIProofreader } from './aiProofreader';

export class PromptCheckerPanel {
    public static currentPanel: PromptCheckerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _spellEngine: SpellEngine;
    private readonly _userDictionary: UserDictionary;
    private readonly _getConfig: () => ExtensionConfig;
    private readonly _aiProofreader?: AIProofreader;
    private _disposables: vscode.Disposable[] = [];
    private _currentText: string = '';
    private _targetEditor: vscode.TextEditor | undefined;
    private _targetRange: vscode.Range | undefined;

    public static createOrShow(
        extensionUri: vscode.Uri,
        spellEngine: SpellEngine,
        userDictionary: UserDictionary,
        getConfig: () => ExtensionConfig,
        aiProofreader?: AIProofreader,
        initialText?: string,
        targetEditor?: vscode.TextEditor,
        targetRange?: vscode.Range
    ) {
        const column = vscode.ViewColumn.Beside;

        if (PromptCheckerPanel.currentPanel) {
            PromptCheckerPanel.currentPanel._panel.reveal(column);
            // Update the text when non-empty text is selected
            if (initialText !== undefined && initialText.trim() !== '') {
                PromptCheckerPanel.currentPanel.setText(initialText, targetEditor, targetRange);
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'promptSpellChecker',
            'AI Prompt Spell Checker',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        PromptCheckerPanel.currentPanel = new PromptCheckerPanel(
            panel,
            extensionUri,
            spellEngine,
            userDictionary,
            getConfig,
            aiProofreader,
            initialText ?? '',
            targetEditor,
            targetRange
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        spellEngine: SpellEngine,
        userDictionary: UserDictionary,
        getConfig: () => ExtensionConfig,
        aiProofreader: AIProofreader | undefined,
        initialText: string,
        targetEditor?: vscode.TextEditor,
        targetRange?: vscode.Range
    ) {
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

        this._panel.webview.onDidReceiveMessage(
            async message => {
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
                                editBuilder.replace(this._targetRange!, message.text);
                            });
                            vscode.window.showInformationMessage('✅ Replaced in editor!');
                        } else {
                            await vscode.env.clipboard.writeText(message.text);
                            vscode.window.showInformationMessage('📋 Copied to clipboard (no editor selection).');
                        }
                        break;
                    }
                    case 'fixAndPasteToChat': {
                        this._currentText = message.text;
                        let cleanText = message.text || '';
                        const config = this._getConfig();

                        if (config.defaultFixEngine !== 'local' && this._aiProofreader && cleanText.trim()) {
                            try {
                                const aiRes = await this._aiProofreader.proofread(cleanText, config.aiProofreader);
                                cleanText = aiRes.fixedText;
                            } catch (e) {
                                // Handled by proofread fallback
                            }
                        }

                        await vscode.env.clipboard.writeText(cleanText);

                        // Close webview panel
                        this.dispose();

                        // Short wait for webview panel to close
                        await new Promise(resolve => setTimeout(resolve, 80));

                        // Focus the AI Chat box and paste the clean prompt
                        await SelectionCapture.pasteToChat(30);
                        vscode.window.showInformationMessage('✨ Fixed & pasted back into chat!');
                        break;
                    }
                    case 'applyAiAutoFix': {
                        const originalText = message.text || '';
                        if (!originalText.trim()) break;
                        const config = this._getConfig();
                        let result: ProofreadResult;
                        if (this._aiProofreader) {
                            result = await this._aiProofreader.proofread(originalText, config.aiProofreader);
                        } else {
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
                        const { text: phraseFixed, count: pCount } = applyContextualPhraseFixes(message.text);
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
                        } else {
                            vscode.window.showWarningMessage('Clipboard contains no text.');
                        }
                        break;
                    }
                    case 'requestDiff': {
                        const originalText = message.text || '';
                        const { text: phraseFixed, count: pCount } = applyContextualPhraseFixes(originalText);
                        let finalText = phraseFixed;
                        const config = this._getConfig();
                        const misspellings = this._spellEngine.findMisspellings(finalText, config);
                        let totalCount = pCount;
                        const sorted = [...misspellings].sort((a, b) => b.start - a.start);
                        const wordChanges: Array<{ original: string; fixed: string }> = [];
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
                        let result: ProofreadResult;
                        if (this._aiProofreader) {
                            result = await this._aiProofreader.proofread(originalText, config.aiProofreader);
                        } else {
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
            },
            null,
            this._disposables
        );
    }

    public setText(text: string, targetEditor?: vscode.TextEditor, targetRange?: vscode.Range) {
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

    private _analyzeAndSend(text: string) {
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

    public dispose() {
        PromptCheckerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview(): string {
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

        .view-switch {
            display: inline-flex;
            background: var(--secondary-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 2px;
            gap: 2px;
        }

        .tab-btn {
            background: transparent;
            border: none;
            color: var(--muted);
            font-family: inherit;
            font-size: 11px;
            font-weight: 500;
            padding: 3px 9px;
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

        .stats-pill {
            font-size: 11px;
            color: var(--muted);
            font-variant-numeric: tabular-nums;
            padding: 3px 8px;
            background: var(--secondary-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
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

        @keyframes pulseClean {
            0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5); }
            70% { box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); }
            100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
        }

        .status-pill.pulse-clean {
            animation: pulseClean 1.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            pointer-events: none;
        }

        /* ── Diff Comparison View ─────────────────────────────────── */
        .diff-container {
            position: relative;
            flex: 1;
            min-height: 180px;
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
            font-size: 11.5px;
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

        /* ── Empty State Overlay ─────────────────────────────────── */
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
            gap: 8px;
            z-index: 5;
            pointer-events: none;
            opacity: 0.9;
            transition: opacity 0.15s ease;
        }

        .empty-overlay.hidden {
            display: none !important;
        }

        .empty-sparkle {
            font-size: 26px;
        }

        .empty-text {
            font-size: 13.5px;
            font-weight: 600;
            color: var(--fg);
        }

        .empty-hint {
            font-size: 11.5px;
            color: var(--muted);
            margin-bottom: 4px;
        }

        .empty-paste-btn {
            pointer-events: auto;
            background: var(--secondary-bg);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
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

        .btn-ai {
            background: linear-gradient(135deg, rgba(142, 68, 173, 0.22), rgba(41, 128, 185, 0.22));
            border: 1px solid rgba(155, 89, 182, 0.45);
            color: #e0b0ff;
            font-weight: 600;
        }

        .btn-ai:hover {
            background: linear-gradient(135deg, rgba(142, 68, 173, 0.42), rgba(41, 128, 185, 0.42));
            border-color: rgba(187, 143, 206, 0.7);
            color: #ffffff;
            box-shadow: 0 0 10px rgba(155, 89, 182, 0.35);
        }

        .btn-ai.loading {
            opacity: 0.65;
            pointer-events: none;
        }

        .btn-ai-hero {
            background: linear-gradient(135deg, #1b5e9b, #6b21a8);
            border: 1px solid rgba(168, 85, 247, 0.45);
            color: #ffffff;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 2px 6px rgba(0, 0, 0, 0.25);
            font-weight: 600;
        }

        .btn-ai-hero:hover {
            background: linear-gradient(135deg, #2563eb, #7c3aed);
            border-color: rgba(192, 132, 252, 0.65);
            box-shadow: 0 0 12px rgba(168, 85, 247, 0.45);
        }

        .diff-engine-selector {
            display: inline-flex;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 2px;
            gap: 2px;
        }

        .diff-toggle-btn {
            background: transparent;
            border: none;
            color: var(--muted);
            font-size: 11px;
            font-weight: 500;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .diff-toggle-btn:hover {
            color: var(--fg);
        }

        .diff-toggle-btn.active {
            background: rgba(155, 89, 182, 0.28);
            color: #e0b0ff;
            font-weight: 600;
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
        <div class="view-switch">
            <button id="tabEditor" class="tab-btn active" type="button" title="Interactive Editor View">Editor</button>
            <button id="tabDiff" class="tab-btn" type="button" title="Visual Diff & Change Comparison">Diff Preview</button>
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
        <div id="emptyOverlay" class="empty-overlay">
            <div class="empty-sparkle">✨</div>
            <div class="empty-text">Prompt Spell Checker Ready</div>
            <div class="empty-hint">Type or paste prompt to detect spelling, grammar, and contractions</div>
            <button id="btnEmptyPaste" class="btn btn-secondary empty-paste-btn" type="button">
                <span>📋 Paste from Clipboard</span>
            </button>
        </div>
    </div>

    <!-- 🔍 Diff Comparison View -->
    <div id="diffContainer" class="diff-container" style="display: none;">
        <div class="diff-header-bar">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span id="diffSummaryBadge" class="diff-summary-badge">⚡ 0 improvements found</span>
                <div class="diff-engine-selector">
                    <button id="btnDiffEngineAi" class="diff-toggle-btn active" type="button" title="View AI Predictive Proofread (vscode.lm / LanguageTool)">✨ AI Mode</button>
                    <button id="btnDiffEngineLocal" class="diff-toggle-btn" type="button" title="View Fast Local 0ms Fix (Hunspell + Soundex)">⚡ Fast Local</button>
                </div>
            </div>
            <div class="diff-actions">
                <button id="btnDiffApply" class="btn btn-primary btn-sm" type="button" title="Apply all fixes to editor">
                    <span>⚡ Apply All Fixes</span>
                </button>
                <button id="btnDiffCopy" class="btn btn-secondary btn-sm" type="button" title="Copy fixed text">
                    <span>📋 Copy Fixed Prompt</span>
                </button>
            </div>
        </div>
        <div class="diff-content" id="diffContent"></div>
    </div>

    <!-- ⚡ Action Buttons -->
    <div class="actions-bar">
        <button id="btnFixAndPaste" class="btn btn-primary btn-ai-hero" title="AI Fix all typos and paste into chat (Ctrl+Shift+Enter)">
            <span>✨ AI Fix & Paste to Chat</span>
            <kbd class="kbd">Ctrl+Shift+↵</kbd>
        </button>
        <button id="btnCopy" class="btn btn-secondary" title="Copy clean prompt (Ctrl+Enter)">
            <span>📋 Copy Clean</span>
            <kbd class="kbd">Ctrl+↵</kbd>
        </button>
        <button id="btnAiAutoFix" class="btn btn-ai" title="Predict & fix all typos in editor with AI (vscode.lm / LanguageTool / LLM)">
            <span>✨ AI Auto-Fix</span>
        </button>
        <button id="btnLocalFix" class="btn btn-secondary" title="Instant 0ms offline dictionary fix (Hunspell + Soundex)">
            <span>⚡ Fast Local (0ms)</span>
        </button>
        <button id="btnUndo" class="btn btn-secondary" title="Undo change (Ctrl+Z)" disabled>
            <span>↺ Undo</span>
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
        const btnAiAutoFix = document.getElementById('btnAiAutoFix');
        const btnLocalFix = document.getElementById('btnLocalFix');
        const btnUndo = document.getElementById('btnUndo');
        const btnReplaceEditor = document.getElementById('btnReplaceEditor');
        const btnClear = document.getElementById('btnClear');
        const toast = document.getElementById('toast');
        const toastIcon = document.getElementById('toastIcon');
        const toastText = document.getElementById('toastText');

        // View Tabs and Diff elements
        const tabEditor = document.getElementById('tabEditor');
        const tabDiff = document.getElementById('tabDiff');
        const editorContainer = document.getElementById('editorContainer');
        const diffContainer = document.getElementById('diffContainer');
        const diffSummaryBadge = document.getElementById('diffSummaryBadge');
        const diffContent = document.getElementById('diffContent');
        const btnDiffApply = document.getElementById('btnDiffApply');
        const btnDiffCopy = document.getElementById('btnDiffCopy');
        const btnDiffEngineAi = document.getElementById('btnDiffEngineAi');
        const btnDiffEngineLocal = document.getElementById('btnDiffEngineLocal');
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
            setTimeout(() => toast.classList.remove('show'), 1600);
        }

        function updateStats() {
            const val = textarea.value;
            const words = val.trim() ? val.trim().split(/\s+/).length : 0;
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

            // Extra newline if text ends with newline for scroll parity
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
            pushHistory();
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
            showToast('Pasting into chat...', '⚡');
        });

        btnCopy.addEventListener('click', () => {
            vscode.postMessage({ command: 'copyToClipboard', text: textarea.value });
            const origSpan = btnCopy.querySelector('span');
            if (origSpan) {
                const prev = origSpan.textContent;
                origSpan.textContent = '✓ Copied!';
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
                    showToast('Enter prompt to fix with AI', '⚠️');
                    return;
                }
                pushHistory();
                btnAiAutoFix.classList.add('loading');
                btnAiAutoFix.innerHTML = '<span>✨ AI Fixing...</span>';
                vscode.postMessage({
                    command: 'applyAiAutoFix',
                    text: textarea.value
                });
            });
        }

        if (btnLocalFix) {
            btnLocalFix.addEventListener('click', () => {
                if (!textarea.value || !textarea.value.trim()) {
                    showToast('Enter prompt to fix', '⚠️');
                    return;
                }
                pushHistory();
                vscode.postMessage({ command: 'autoFixText', text: textarea.value });
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

        let activeDiffMode = 'ai';

        function loadDiff(mode) {
            activeDiffMode = mode;
            if (btnDiffEngineAi && btnDiffEngineLocal) {
                if (mode === 'ai') {
                    btnDiffEngineAi.classList.add('active');
                    btnDiffEngineLocal.classList.remove('active');
                    vscode.postMessage({ command: 'requestAiProofread', text: textarea.value });
                } else {
                    btnDiffEngineLocal.classList.add('active');
                    btnDiffEngineAi.classList.remove('active');
                    vscode.postMessage({ command: 'requestDiff', text: textarea.value });
                }
            }
        }

        if (btnDiffEngineAi) {
            btnDiffEngineAi.addEventListener('click', () => loadDiff('ai'));
        }
        if (btnDiffEngineLocal) {
            btnDiffEngineLocal.addEventListener('click', () => loadDiff('local'));
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
                loadDiff(activeDiffMode);
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
                    if (btnAiAutoFix) {
                        btnAiAutoFix.classList.remove('loading');
                        btnAiAutoFix.innerHTML = '<span>✨ AI Auto-Fix</span>';
                    }
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
                    if (btnAiAutoFix) {
                        btnAiAutoFix.classList.remove('loading');
                        btnAiAutoFix.innerHTML = '<span>✨ AI Auto-Fix</span>';
                    }
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
                    showToast('AI Proofread (' + (msg.providerUsed || 'AI') + (msg.durationMs ? ' · ' + msg.durationMs + 'ms' : '') + ')', '✨');
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
                        '<div style="font-size:32px;">✨</div>' +
                        '<div style="font-weight:600;font-size:14px;color:var(--clean-green);">Prompt is 100% Clean!</div>' +
                        '<div style="font-size:12px;color:var(--muted);max-width:320px;">No typos, phrase errors, contractions, or developer slip-ups found in this prompt.</div>' +
                    '</div>';
                return;
            }

            diffSummaryBadge.textContent = '⚡ ' + fixesCount + (fixesCount === 1 ? ' improvement found' : ' improvements found');
            diffSummaryBadge.style.color = 'var(--clean-green)';
            if (btnDiffApply) btnDiffApply.disabled = false;

            let html = '';

            // Render provider badge if AI proofread
            if (msg.providerUsed) {
                html += '<div style="margin-bottom:10px;display:flex;align-items:center;gap:6px;">' +
                    '<span style="font-size:10.5px;padding:2px 8px;border-radius:10px;background:rgba(155,89,182,0.18);color:#dfb2f4;border:1px solid rgba(155,89,182,0.4);font-weight:600;">✨ ' + escapeHtml(msg.providerUsed) + (msg.durationMs ? ' · ' + msg.durationMs + 'ms' : '') + '</span>' +
                '</div>';
            }

            // Render chips of what was corrected
            if (msg.wordChanges && msg.wordChanges.length > 0) {
                html += '<div class="diff-chips-panel">';
                html += '<span style="font-size:11px;color:var(--muted);margin-right:4px;">Corrections:</span>';
                msg.wordChanges.forEach(c => {
                    const titleAttr = c.reason ? ' title="' + escapeHtml(c.reason) + '"' : '';
                    html += '<span class="diff-chip"' + titleAttr + '><span class="diff-del">' + escapeHtml(c.original) + '</span> → <span class="diff-add">' + escapeHtml(c.fixed) + '</span></span>';
                });
                html += '</div>';
            }

            // Render full preview text with changes highlighted
            let preview = escapeHtml(fixed);
            if (msg.wordChanges) {
                msg.wordChanges.forEach(c => {
                    const escFixed = escapeHtml(c.fixed);
                    const rep = '<span class="diff-add" title="Was: &quot;' + escapeHtml(c.original) + '&quot;">' + escFixed + '</span>';
                    preview = preview.split(escFixed).join(rep);
                });
            }

            html += '<div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Enhanced Clean Prompt Preview</div>';
            html += '<div style="background:var(--secondary-bg);padding:14px;border-radius:6px;border:1px solid var(--border);line-height:1.7;">' + preview + '</div>';

            diffContent.innerHTML = html;
        }

        // ── Update Status Badge ───────────────────────────────────
        function renderResults(misspellings) {
            const activeErrors = misspellings.filter(m => !ignoredWords.has(m.word.toLowerCase()));

            if (activeErrors.length === 0) {
                statusBadge.className = 'status-pill status-clean';
                const hasText = textarea.value.trim().length > 0;
                statusText.textContent = hasText ? '✨ 100% Clean' : 'Clean';
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
// 🧩 Extension Entry Point 🧩
// Activates the AI Chat Spell Assistant extension.

import * as vscode from 'vscode';
import { ExtensionConfig, DEFAULT_DEV_WORDS } from './types';
import { SpellEngine } from './spellEngine';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { SpellCodeActionProvider } from './codeActionProvider';
import { UserDictionary } from './userDictionary';
import { StatusBarManager } from './statusBar';
import { PromptCheckerPanel } from './promptCheckerWebview';
import { SelectionCapture } from './selectionCapture';
import { applyContextualPhraseFixes } from './typoRules';

let statusBar: StatusBarManager;
let diagnosticsProvider: DiagnosticsProvider;
let spellEngine: SpellEngine;
let userDictionary: UserDictionary;

function getConfig(): ExtensionConfig {
    const cfg = vscode.workspace.getConfiguration('spellAssistant');
    return {
        enabled: cfg.get<boolean>('enabled', true),
        checkOnType: cfg.get<boolean>('checkOnType', true),
        debounceMs: cfg.get<number>('debounceMs', 300),
        extraKnownWords: cfg.get<string[]>('extraKnownWords', []),
        targetLanguages: cfg.get<string[]>('targetLanguages', ['markdown', 'plaintext', 'git-commit', 'scminput']),
        ignoreCamelCase: cfg.get<boolean>('ignoreCamelCase', true),
        ignoreCodeBlocks: cfg.get<boolean>('ignoreCodeBlocks', true),
        ignoreUrls: cfg.get<boolean>('ignoreUrls', true),
        ignoreFilePaths: cfg.get<boolean>('ignoreFilePaths', true),
        ignoreAllCaps: cfg.get<boolean>('ignoreAllCaps', true),
        maxSuggestions: cfg.get<number>('maxSuggestions', 5),
        diagnosticSeverity: cfg.get<'error' | 'warning' | 'information'>('diagnosticSeverity', 'error'),
    };
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('[Spell Assistant] Activating extension...');

    // Initialize OS-level selection capture (Ctrl+C helper for webview chat inputs)
    SelectionCapture.init(context.extensionPath);

    const config = getConfig();
    userDictionary = new UserDictionary(context);
    const combinedDevWords = [...DEFAULT_DEV_WORDS, ...config.extraKnownWords];
    spellEngine = new SpellEngine(userDictionary, context.extensionPath, combinedDevWords);
    statusBar = new StatusBarManager();
    diagnosticsProvider = new DiagnosticsProvider(spellEngine);

    await spellEngine.waitReady();
    console.log('[Spell Assistant] SpellEngine is ready:', spellEngine.isReady());

    diagnosticsProvider.activate(getConfig);

    // Register Quick Fix actions for target languages and untitled documents
    const selectors: vscode.DocumentSelector = [
        ...config.targetLanguages.map(lang => ({ language: lang })),
        { scheme: 'untitled' }
    ];
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            selectors,
            new SpellCodeActionProvider(),
            { providedCodeActionKinds: SpellCodeActionProvider.providedCodeActionKinds }
        )
    );

    // 🎯 Helper to capture target text and range intelligently
    // Priority:
    // 1) OS-level selection capture (works anywhere keyboard focus is, including AI chat box!)
    // 2) Active Monaco text editor selection (if user is inside an editor)
    // 3) Word under cursor in active editor
    // 4) Clipboard fallback
    async function getTargetTextAndRange(editor?: vscode.TextEditor): Promise<{
        text: string;
        targetEditor?: vscode.TextEditor;
        targetRange?: vscode.Range;
        isOsCaptured?: boolean;
    }> {
        // 1️⃣ Priority: Capture whatever is highlighted in the active OS control (AI chat box, webview, editor, etc.)
        const osCapturedText = await SelectionCapture.captureFromOS();
        if (osCapturedText && osCapturedText.trim()) {
            const activeEd = editor || vscode.window.activeTextEditor;
            let targetEditor: vscode.TextEditor | undefined;
            let targetRange: vscode.Range | undefined;

            // If the captured text matches the current Monaco editor selection, link it
            if (activeEd && !activeEd.selection.isEmpty && activeEd.document.getText(activeEd.selection) === osCapturedText) {
                targetEditor = activeEd;
                targetRange = activeEd.selection;
            }

            return {
                text: osCapturedText,
                targetEditor,
                targetRange,
                isOsCaptured: true
            };
        }

        // 2️⃣ If user is in an active text editor and has text selected
        const activeEd = editor || vscode.window.activeTextEditor;
        if (activeEd && !activeEd.selection.isEmpty) {
            return {
                text: activeEd.document.getText(activeEd.selection),
                targetEditor: activeEd,
                targetRange: activeEd.selection,
                isOsCaptured: false
            };
        }

        // 3️⃣ Word under cursor in the active editor
        if (activeEd) {
            const wordRange = activeEd.document.getWordRangeAtPosition(activeEd.selection.active);
            if (wordRange) {
                return {
                    text: activeEd.document.getText(wordRange),
                    targetEditor: activeEd,
                    targetRange: wordRange,
                    isOsCaptured: false
                };
            }
        }

        // 4️⃣ Clipboard fallback (if user copied text previously)
        try {
            const text = (await vscode.env.clipboard.readText()) || '';
            return {
                text: text.trim(),
                targetEditor: undefined,
                targetRange: undefined,
                isOsCaptured: false
            };
        } catch {
            return {
                text: '',
                targetEditor: undefined,
                targetRange: undefined,
                isOsCaptured: false
            };
        }
    }

    // 💡 Alt+Q: Select text → open Prompt Checker panel with it directly
    const quickFixWord = async () => {
        const editor = vscode.window.activeTextEditor;
        const target = await getTargetTextAndRange(editor);

        // Open the Prompt Checker panel with the selected text (or empty if nothing selected)
        PromptCheckerPanel.createOrShow(
            context.extensionUri,
            spellEngine,
            userDictionary,
            getConfig,
            target.text || '',
            target.targetEditor,
            target.targetRange
        );
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.quickFixWord', quickFixWord)
    );

    // 🚀 Open AI Prompt Spell Checker (Interactive Text Box with Misspellings & Direct Copy)
    const openPromptChecker = async () => {
        const editor = vscode.window.activeTextEditor;
        const target = await getTargetTextAndRange(editor);

        PromptCheckerPanel.createOrShow(
            context.extensionUri,
            spellEngine,
            userDictionary,
            getConfig,
            target.text,
            target.targetEditor,
            target.targetRange
        );
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.openPromptChecker', openPromptChecker)
    );

    // ⚡ Quick Fix & Copy Directly (Zero-UI fast auto-fix)
    const quickFixAndCopy = async () => {
        const editor = vscode.window.activeTextEditor;
        const target = await getTargetTextAndRange(editor);
        const originalText = target.text;

        if (!originalText || !originalText.trim()) {
            vscode.window.showWarningMessage('No text selected or in clipboard to check.');
            return;
        }

        // 1. Contextual phrase corrections (e.g. 'cant plea tanned' -> 'can't play tennis')
        const { text: phraseFixedText, count: phraseCount } = applyContextualPhraseFixes(originalText);
        let fixedText = phraseFixedText;

        // 2. Word-level spell checking on the text
        const currentConfig = getConfig();
        const misspellings = spellEngine.findMisspellings(fixedText, currentConfig);

        if (misspellings.length === 0 && phraseCount === 0) {
            vscode.window.showInformationMessage('✅ No typos found! Text is clean.');
            return;
        }

        // Apply word suggestions right to left
        const sorted = [...misspellings].sort((a, b) => b.start - a.start);
        let fixedCount = phraseCount;

        for (const m of sorted) {
            if (m.suggestions && m.suggestions.length > 0) {
                fixedText = fixedText.slice(0, m.start) + m.suggestions[0] + fixedText.slice(m.end);
                fixedCount++;
            }
        }

        await vscode.env.clipboard.writeText(fixedText);

        if (target.targetEditor && target.targetRange) {
            await target.targetEditor.edit(builder => builder.replace(target.targetRange!, fixedText));
            vscode.window.showInformationMessage(`⚡ Fixed ${fixedCount} typo(s)! Replaced in editor & copied to clipboard.`);
        } else if (target.isOsCaptured) {
            // Auto-paste directly over highlighted selection in AI Chat box (Ctrl+V)
            await SelectionCapture.pasteToOS(40);
            vscode.window.showInformationMessage(`⚡ Fixed ${fixedCount} typo(s) & pasted directly into chat!`);
        } else {
            // Auto-paste clean text directly
            await SelectionCapture.pasteToOS(40);
            vscode.window.showInformationMessage(`⚡ Fixed ${fixedCount} typo(s)! Copied & pasted clean text.`);
        }
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.quickFixAndCopy', quickFixAndCopy)
    );

    // Alt+Q: Scan document or open prompt checker
    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.scanDocument', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                diagnosticsProvider.checkDocument(editor.document, getConfig());
                vscode.window.showInformationMessage('Spell check complete.');
            } else {
                openPromptChecker();
            }
        })
    );

    // Alt+W: Quick fix all typos in document
    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.quickFixAll', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                await quickFixAndCopy();
                return;
            }

            const currentConfig = getConfig();
            const misspellings = spellEngine.findMisspellings(editor.document.getText(), currentConfig);

            if (misspellings.length === 0) {
                vscode.window.showInformationMessage('No typos found!');
                return;
            }

            const edit = new vscode.WorkspaceEdit();
            const sortedMisspellings = [...misspellings].sort((a, b) => b.start - a.start);

            for (const m of sortedMisspellings) {
                if (m.suggestions.length > 0) {
                    const range = new vscode.Range(
                        editor.document.positionAt(m.start),
                        editor.document.positionAt(m.end)
                    );
                    edit.replace(editor.document.uri, range, m.suggestions[0]);
                }
            }

            await vscode.workspace.applyEdit(edit);
            diagnosticsProvider.checkDocument(editor.document, currentConfig);

            const fixCount = sortedMisspellings.filter(m => m.suggestions.length > 0).length;
            vscode.window.showInformationMessage('Fixed ' + fixCount + ' typo(s).');
        })
    );

    // Toggle spell checking on/off
    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.toggle', () => {
            const cfg = vscode.workspace.getConfiguration('spellAssistant');
            const currentlyEnabled = cfg.get<boolean>('enabled', true);
            cfg.update('enabled', !currentlyEnabled, vscode.ConfigurationTarget.Global);
        })
    );

    // Add word to dictionary
    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.addWord', async (word?: string) => {
            if (!word) {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    word = editor.document.getText(editor.selection);
                } else {
                    word = await vscode.window.showInputBox({
                        prompt: 'Enter a word to add to your dictionary',
                        placeHolder: 'word',
                    });
                }
            }

            if (word) {
                await userDictionary.addWord(word);
                spellEngine.addWordToChecker(word);
                vscode.window.showInformationMessage('Added "' + word + '" to dictionary.');

                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    diagnosticsProvider.checkDocument(editor.document, getConfig());
                }
            }
        })
    );

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('spellAssistant')) {
                const newConfig = getConfig();
                statusBar.update(newConfig.enabled);

                if (newConfig.enabled) {
                    for (const doc of vscode.workspace.textDocuments) {
                        if (diagnosticsProvider.isTargetDocument(doc, newConfig)) {
                            diagnosticsProvider.checkDocument(doc, newConfig);
                        }
                    }
                } else {
                    diagnosticsProvider.clearAll();
                }
            }
        })
    );

    context.subscriptions.push(statusBar);
    context.subscriptions.push(diagnosticsProvider);

    statusBar.update(config.enabled);
    console.log('[Spell Assistant] Activated successfully.');
}

export function deactivate() {
    console.log('[Spell Assistant] Deactivated.');
}
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
import { AIProofreader } from './aiProofreader';

let statusBar: StatusBarManager;
let diagnosticsProvider: DiagnosticsProvider;
let spellEngine: SpellEngine;
let userDictionary: UserDictionary;
let aiProofreader: AIProofreader;

function getConfig(): ExtensionConfig {
    const cfg = vscode.workspace.getConfiguration('spellAssistant');
    const aiCfg = cfg.get<any>('aiProofreader', {});
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
        defaultFixEngine: cfg.get<'ai' | 'local'>('defaultFixEngine', 'ai'),
        aiProofreader: {
            enabled: aiCfg.enabled ?? true,
            provider: aiCfg.provider ?? 'auto',
            customEndpoint: aiCfg.customEndpoint,
            customApiKey: aiCfg.customApiKey,
            customModel: aiCfg.customModel,
            languageToolEndpoint: aiCfg.languageToolEndpoint
        }
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
    aiProofreader = new AIProofreader(spellEngine);
    statusBar = new StatusBarManager();
    diagnosticsProvider = new DiagnosticsProvider(spellEngine);

    await spellEngine.waitReady();
    console.log('[Spell Assistant] SpellEngine is ready:', spellEngine.isReady());

    diagnosticsProvider.activate(getConfig);

    // 📊 Connect live document diagnostics with status bar typo counter
    diagnosticsProvider.onDiagnosticsUpdated = (doc, count) => {
        const activeEd = vscode.window.activeTextEditor;
        if (activeEd && activeEd.document.uri.toString() === doc.uri.toString()) {
            statusBar.update(getConfig().enabled, count, true);
        }
    };

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            const currentCfg = getConfig();
            if (!editor) {
                statusBar.update(currentCfg.enabled, undefined, false);
                return;
            }
            const count = diagnosticsProvider.getDiagnosticCount(editor.document.uri);
            statusBar.update(currentCfg.enabled, count, diagnosticsProvider.isTargetDocument(editor.document, currentCfg));
        })
    );

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
        // 1️⃣ Priority: If user has an active Monaco editor with text selected, use it directly (0ms)
        const activeEd = editor || vscode.window.activeTextEditor;
        if (activeEd && !activeEd.selection.isEmpty) {
            return {
                text: activeEd.document.getText(activeEd.selection),
                targetEditor: activeEd,
                targetRange: activeEd.selection,
                isOsCaptured: false
            };
        }

        // 2️⃣ Priority: OS Global Selection Capture (AI Chat box, webviews, external controls)
        // With autoSelectLine=true, if cursor is at the end of the prompt in the chat box,
        // it selects the line (Shift+Home) and copies it automatically.
        const osCapturedText = await SelectionCapture.captureFromOS(true);
        if (osCapturedText && osCapturedText.trim()) {
            let targetEditor: vscode.TextEditor | undefined;
            let targetRange: vscode.Range | undefined;
            let isOsCaptured = true;

            // If the captured text matches Monaco editor's current line, link to Monaco
            if (activeEd) {
                const currentLine = activeEd.document.lineAt(activeEd.selection.active.line);
                if (currentLine && (currentLine.text.trim() === osCapturedText.trim() || currentLine.text === osCapturedText)) {
                    targetEditor = activeEd;
                    targetRange = currentLine.range;
                    isOsCaptured = false;
                }
            }

            return {
                text: osCapturedText.trim(),
                targetEditor,
                targetRange,
                isOsCaptured
            };
        }

        // 3️⃣ If user is in an active Monaco editor with no selection, use the current line
        if (activeEd) {
            const currentLine = activeEd.document.lineAt(activeEd.selection.active.line);
            if (currentLine && currentLine.text.trim().length > 0) {
                return {
                    text: currentLine.text.trim(),
                    targetEditor: activeEd,
                    targetRange: currentLine.range,
                    isOsCaptured: false
                };
            }
        }

        // 4️⃣ Return empty (do not check stale old clipboard!)
        return {
            text: '',
            targetEditor: undefined,
            targetRange: undefined,
            isOsCaptured: false
        };
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
            aiProofreader,
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
            aiProofreader,
            target.text,
            target.targetEditor,
            target.targetRange
        );
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.openPromptChecker', openPromptChecker)
    );

    // 🛠️ Local 0ms fast rule & Hunspell fixer helper
    const runLocalFix = (text: string): { fixedText: string; fixedCount: number } => {
        const { text: phraseFixedText, count: phraseCount } = applyContextualPhraseFixes(text);
        let fixedText = phraseFixedText;
        const currentConfig = getConfig();
        const misspellings = spellEngine.findMisspellings(fixedText, currentConfig);
        const sorted = [...misspellings].sort((a, b) => b.start - a.start);
        let fixedCount = phraseCount;

        for (const m of sorted) {
            if (m.suggestions && m.suggestions.length > 0 && m.suggestions[0] !== m.word) {
                fixedText = fixedText.slice(0, m.start) + m.suggestions[0] + fixedText.slice(m.end);
                fixedCount++;
            }
        }
        return { fixedText, fixedCount };
    };

    // ✨ Primary Auto-Fix & Paste (Default: AI Predictive Proofreader, Alt+W)
    const quickFixAndCopy = async () => {
        const editor = vscode.window.activeTextEditor;
        const target = await getTargetTextAndRange(editor);
        const originalText = target.text;

        if (!originalText || !originalText.trim()) {
            vscode.window.showWarningMessage('No text selected or active prompt to check.');
            return;
        }

        const currentConfig = getConfig();
        const useAi = currentConfig.defaultFixEngine !== 'local';

        if (useAi && aiProofreader) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '✨ AI is predicting prompt corrections...',
                cancellable: false
            }, async () => {
                const result = await aiProofreader.proofread(originalText, currentConfig.aiProofreader);
                const fixedText = result.fixedText;
                await vscode.env.clipboard.writeText(fixedText);

                const previewBefore = originalText.trim().length > 25 ? originalText.trim().slice(0, 25) + '...' : originalText.trim();
                const previewAfter = fixedText.trim().length > 25 ? fixedText.trim().slice(0, 25) + '...' : fixedText.trim();

                if (target.targetEditor && target.targetRange) {
                    await target.targetEditor.edit(b => b.replace(target.targetRange!, fixedText));
                    vscode.window.showInformationMessage(`✨ AI Fixed (${result.providerUsed}): "${previewBefore}" → "${previewAfter}"`);
                } else {
                    await SelectionCapture.pasteToOS(40);
                    vscode.window.showInformationMessage(`✨ AI Fixed & pasted (${result.providerUsed}): "${previewAfter}"`);
                }
            });
        } else {
            // Local 0ms fallback
            const { fixedText, fixedCount } = runLocalFix(originalText);
            if (fixedCount === 0 && fixedText === originalText) {
                const preview = originalText.length > 35 ? originalText.slice(0, 35) + '...' : originalText;
                vscode.window.showInformationMessage(`✅ No typos found in: "${preview}"`);
                return;
            }

            await vscode.env.clipboard.writeText(fixedText);
            const previewBefore = originalText.trim().length > 30 ? originalText.trim().slice(0, 30) + '...' : originalText.trim();
            const previewAfter = fixedText.trim().length > 30 ? fixedText.trim().slice(0, 30) + '...' : fixedText.trim();

            if (target.targetEditor && target.targetRange) {
                await target.targetEditor.edit(builder => builder.replace(target.targetRange!, fixedText));
                vscode.window.showInformationMessage(`⚡ Fast Local Fixed: "${previewBefore}" → "${previewAfter}"`);
            } else {
                await SelectionCapture.pasteToOS(40);
                vscode.window.showInformationMessage(`⚡ Fast Local Fixed & pasted: "${previewAfter}"`);
            }
        }
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.quickFixAndCopy', quickFixAndCopy)
    );

    // ⚡ Dedicated Fast Local Fix & Paste (0ms Offline, Alt+Shift+W)
    const localQuickFixAndCopy = async () => {
        const editor = vscode.window.activeTextEditor;
        const target = await getTargetTextAndRange(editor);
        const originalText = target.text;

        if (!originalText || !originalText.trim()) {
            vscode.window.showWarningMessage('No text selected or active prompt to check.');
            return;
        }

        const { fixedText, fixedCount } = runLocalFix(originalText);
        if (fixedCount === 0 && fixedText === originalText) {
            const preview = originalText.length > 35 ? originalText.slice(0, 35) + '...' : originalText;
            vscode.window.showInformationMessage(`✅ No typos found in: "${preview}"`);
            return;
        }

        await vscode.env.clipboard.writeText(fixedText);
        const previewBefore = originalText.trim().length > 30 ? originalText.trim().slice(0, 30) + '...' : originalText.trim();
        const previewAfter = fixedText.trim().length > 30 ? fixedText.trim().slice(0, 30) + '...' : fixedText.trim();

        if (target.targetEditor && target.targetRange) {
            await target.targetEditor.edit(builder => builder.replace(target.targetRange!, fixedText));
            vscode.window.showInformationMessage(`⚡ Fast Local Fixed (0ms): "${previewBefore}" → "${previewAfter}"`);
        } else {
            await SelectionCapture.pasteToOS(40);
            vscode.window.showInformationMessage(`⚡ Fast Local Fixed & pasted (0ms): "${previewAfter}"`);
        }
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.localQuickFixAndCopy', localQuickFixAndCopy)
    );

    // ✨ AI Predict & Proofread alias command
    context.subscriptions.push(
        vscode.commands.registerCommand('spellAssistant.aiProofread', quickFixAndCopy)
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

            const originalDocText = editor.document.getText();
            const { text: phraseFixed, count: phraseCount } = applyContextualPhraseFixes(originalDocText);
            let currentText = phraseFixed;
            const currentConfig = getConfig();
            const misspellings = spellEngine.findMisspellings(currentText, currentConfig);

            if (misspellings.length === 0 && phraseCount === 0) {
                vscode.window.showInformationMessage('✅ No typos found! Document is clean.');
                return;
            }

            let fixedText = currentText;
            const sortedMisspellings = [...misspellings].sort((a, b) => b.start - a.start);
            let wordFixCount = 0;
            for (const m of sortedMisspellings) {
                if (m.suggestions.length > 0 && m.suggestions[0] !== m.word) {
                    fixedText = fixedText.slice(0, m.start) + m.suggestions[0] + fixedText.slice(m.end);
                    wordFixCount++;
                }
            }

            const totalFixed = phraseCount + wordFixCount;
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(originalDocText.length)
            );

            await editor.edit(builder => builder.replace(fullRange, fixedText));
            diagnosticsProvider.checkDocument(editor.document, currentConfig);
            vscode.window.showInformationMessage(`⚡ Fixed ${totalFixed} typo(s) across document.`);
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
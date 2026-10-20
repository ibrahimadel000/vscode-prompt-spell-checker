"use strict";
// 🧩 Extension Entry Point 🧩
// Activates the AI Chat Spell Assistant extension.
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const spellEngine_1 = require("./spellEngine");
const diagnosticsProvider_1 = require("./diagnosticsProvider");
const codeActionProvider_1 = require("./codeActionProvider");
const userDictionary_1 = require("./userDictionary");
const statusBar_1 = require("./statusBar");
const promptCheckerWebview_1 = require("./promptCheckerWebview");
const selectionCapture_1 = require("./selectionCapture");
const typoRules_1 = require("./typoRules");
let statusBar;
let diagnosticsProvider;
let spellEngine;
let userDictionary;
function getConfig() {
    const cfg = vscode.workspace.getConfiguration('spellAssistant');
    return {
        enabled: cfg.get('enabled', true),
        checkOnType: cfg.get('checkOnType', true),
        debounceMs: cfg.get('debounceMs', 300),
        extraKnownWords: cfg.get('extraKnownWords', []),
        targetLanguages: cfg.get('targetLanguages', ['markdown', 'plaintext', 'git-commit', 'scminput']),
        ignoreCamelCase: cfg.get('ignoreCamelCase', true),
        ignoreCodeBlocks: cfg.get('ignoreCodeBlocks', true),
        ignoreUrls: cfg.get('ignoreUrls', true),
        ignoreFilePaths: cfg.get('ignoreFilePaths', true),
        ignoreAllCaps: cfg.get('ignoreAllCaps', true),
        maxSuggestions: cfg.get('maxSuggestions', 5),
        diagnosticSeverity: cfg.get('diagnosticSeverity', 'error'),
    };
}
async function activate(context) {
    console.log('[Spell Assistant] Activating extension...');
    // Initialize OS-level selection capture (Ctrl+C helper for webview chat inputs)
    selectionCapture_1.SelectionCapture.init(context.extensionPath);
    const config = getConfig();
    userDictionary = new userDictionary_1.UserDictionary(context);
    const combinedDevWords = [...types_1.DEFAULT_DEV_WORDS, ...config.extraKnownWords];
    spellEngine = new spellEngine_1.SpellEngine(userDictionary, context.extensionPath, combinedDevWords);
    statusBar = new statusBar_1.StatusBarManager();
    diagnosticsProvider = new diagnosticsProvider_1.DiagnosticsProvider(spellEngine);
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
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        const currentCfg = getConfig();
        if (!editor) {
            statusBar.update(currentCfg.enabled, undefined, false);
            return;
        }
        const count = diagnosticsProvider.getDiagnosticCount(editor.document.uri);
        statusBar.update(currentCfg.enabled, count, diagnosticsProvider.isTargetDocument(editor.document, currentCfg));
    }));
    // Register Quick Fix actions for target languages and untitled documents
    const selectors = [
        ...config.targetLanguages.map(lang => ({ language: lang })),
        { scheme: 'untitled' }
    ];
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selectors, new codeActionProvider_1.SpellCodeActionProvider(), { providedCodeActionKinds: codeActionProvider_1.SpellCodeActionProvider.providedCodeActionKinds }));
    // 🎯 Helper to capture target text and range intelligently
    // Priority:
    // 1) OS-level selection capture (works anywhere keyboard focus is, including AI chat box!)
    // 2) Active Monaco text editor selection (if user is inside an editor)
    // 3) Word under cursor in active editor
    // 4) Clipboard fallback
    async function getTargetTextAndRange(editor) {
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
        const osCapturedText = await selectionCapture_1.SelectionCapture.captureFromOS(true);
        if (osCapturedText && osCapturedText.trim()) {
            let targetEditor;
            let targetRange;
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
        promptCheckerWebview_1.PromptCheckerPanel.createOrShow(context.extensionUri, spellEngine, userDictionary, getConfig, target.text || '', target.targetEditor, target.targetRange);
    };
    context.subscriptions.push(vscode.commands.registerCommand('spellAssistant.quickFixWord', quickFixWord));
    // 🚀 Open AI Prompt Spell Checker (Interactive Text Box with Misspellings & Direct Copy)
    const openPromptChecker = async () => {
        const editor = vscode.window.activeTextEditor;
        const target = await getTargetTextAndRange(editor);
        promptCheckerWebview_1.PromptCheckerPanel.createOrShow(context.extensionUri, spellEngine, userDictionary, getConfig, target.text, target.targetEditor, target.targetRange);
    };
    context.subscriptions.push(vscode.commands.registerCommand('spellAssistant.openPromptChecker', openPromptChecker));
    // ⚡ Quick Fix & Copy Directly (Zero-UI fast auto-fix)
    const quickFixAndCopy = async () => {
        const editor = vscode.window.activeTextEditor;
        const target = await getTargetTextAndRange(editor);
        const originalText = target.text;
        if (!originalText || !originalText.trim()) {
            vscode.window.showWarningMessage('No text selected or active prompt to check.');
            return;
        }
        // 1. Contextual phrase corrections (e.g. 'cant plea tanned' -> 'can't play tennis')
        const { text: phraseFixedText, count: phraseCount } = (0, typoRules_1.applyContextualPhraseFixes)(originalText);
        let fixedText = phraseFixedText;
        // 2. Word-level spell checking on the text
        const currentConfig = getConfig();
        const misspellings = spellEngine.findMisspellings(fixedText, currentConfig);
        if (misspellings.length === 0 && phraseCount === 0) {
            const preview = originalText.length > 35 ? originalText.slice(0, 35) + '...' : originalText;
            vscode.window.showInformationMessage(`✅ No typos found in: "${preview}"`);
            return;
        }
        // Apply word suggestions right to left
        const sorted = [...misspellings].sort((a, b) => b.start - a.start);
        let fixedCount = phraseCount;
        for (const m of sorted) {
            if (m.suggestions && m.suggestions.length > 0 && m.suggestions[0] !== m.word) {
                fixedText = fixedText.slice(0, m.start) + m.suggestions[0] + fixedText.slice(m.end);
                fixedCount++;
            }
        }
        await vscode.env.clipboard.writeText(fixedText);
        const previewBefore = originalText.trim().length > 30 ? originalText.trim().slice(0, 30) + '...' : originalText.trim();
        const previewAfter = fixedText.trim().length > 30 ? fixedText.trim().slice(0, 30) + '...' : fixedText.trim();
        if (target.targetEditor && target.targetRange) {
            await target.targetEditor.edit(builder => builder.replace(target.targetRange, fixedText));
            vscode.window.showInformationMessage(`⚡ Fixed: "${previewBefore}" → "${previewAfter}"`);
        }
        else {
            // Auto-paste directly over highlighted selection in AI Chat box (Ctrl+V)
            await selectionCapture_1.SelectionCapture.pasteToOS(40);
            vscode.window.showInformationMessage(`⚡ Fixed & pasted into chat: "${previewAfter}"`);
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('spellAssistant.quickFixAndCopy', quickFixAndCopy));
    // Alt+Q: Scan document or open prompt checker
    context.subscriptions.push(vscode.commands.registerCommand('spellAssistant.scanDocument', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            diagnosticsProvider.checkDocument(editor.document, getConfig());
            vscode.window.showInformationMessage('Spell check complete.');
        }
        else {
            openPromptChecker();
        }
    }));
    // Alt+W: Quick fix all typos in document
    context.subscriptions.push(vscode.commands.registerCommand('spellAssistant.quickFixAll', async () => {
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
                const range = new vscode.Range(editor.document.positionAt(m.start), editor.document.positionAt(m.end));
                edit.replace(editor.document.uri, range, m.suggestions[0]);
            }
        }
        await vscode.workspace.applyEdit(edit);
        diagnosticsProvider.checkDocument(editor.document, currentConfig);
        const fixCount = sortedMisspellings.filter(m => m.suggestions.length > 0).length;
        vscode.window.showInformationMessage('Fixed ' + fixCount + ' typo(s).');
    }));
    // Toggle spell checking on/off
    context.subscriptions.push(vscode.commands.registerCommand('spellAssistant.toggle', () => {
        const cfg = vscode.workspace.getConfiguration('spellAssistant');
        const currentlyEnabled = cfg.get('enabled', true);
        cfg.update('enabled', !currentlyEnabled, vscode.ConfigurationTarget.Global);
    }));
    // Add word to dictionary
    context.subscriptions.push(vscode.commands.registerCommand('spellAssistant.addWord', async (word) => {
        if (!word) {
            const editor = vscode.window.activeTextEditor;
            if (editor && !editor.selection.isEmpty) {
                word = editor.document.getText(editor.selection);
            }
            else {
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
    }));
    // Listen for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('spellAssistant')) {
            const newConfig = getConfig();
            statusBar.update(newConfig.enabled);
            if (newConfig.enabled) {
                for (const doc of vscode.workspace.textDocuments) {
                    if (diagnosticsProvider.isTargetDocument(doc, newConfig)) {
                        diagnosticsProvider.checkDocument(doc, newConfig);
                    }
                }
            }
            else {
                diagnosticsProvider.clearAll();
            }
        }
    }));
    context.subscriptions.push(statusBar);
    context.subscriptions.push(diagnosticsProvider);
    statusBar.update(config.enabled);
    console.log('[Spell Assistant] Activated successfully.');
}
function deactivate() {
    console.log('[Spell Assistant] Deactivated.');
}
//# sourceMappingURL=extension.js.map
"use strict";
// ─── Code Action Provider ────────────────────────────────────────────
// Provides Quick Fix actions (lightbulb menu) for misspelled words:
//  - Replace with suggestion
//  - Add word to dictionary
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
exports.SpellCodeActionProvider = void 0;
const vscode = __importStar(require("vscode"));
const diagnosticsProvider_1 = require("./diagnosticsProvider");
class SpellCodeActionProvider {
    static providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
    ];
    addWordCommand;
    constructor(addWordCommand = 'spellAssistant.addWord') {
        this.addWordCommand = addWordCommand;
    }
    provideCodeActions(document, range, context, _token) {
        const actions = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== diagnosticsProvider_1.DIAGNOSTIC_SOURCE) {
                continue;
            }
            const word = document.getText(diagnostic.range);
            // Parse suggestions from the diagnostic code
            let suggestions = [];
            try {
                if (typeof diagnostic.code === 'string') {
                    suggestions = JSON.parse(diagnostic.code);
                }
            }
            catch {
                // If parsing fails, no suggestions available
            }
            // Create a Quick Fix for each suggestion
            suggestions.forEach((suggestion, idx) => {
                const label = idx === 0 ? `Replace with "${suggestion}" (Best match)` : `Replace with "${suggestion}"`;
                const fixAction = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
                fixAction.edit = new vscode.WorkspaceEdit();
                fixAction.edit.replace(document.uri, diagnostic.range, suggestion);
                fixAction.diagnostics = [diagnostic];
                fixAction.isPreferred = idx === 0;
                actions.push(fixAction);
            });
            // "Add to dictionary" action
            const addAction = new vscode.CodeAction(`Add "${word}" to dictionary`, vscode.CodeActionKind.QuickFix);
            addAction.command = {
                command: this.addWordCommand,
                title: `Add "${word}" to dictionary`,
                arguments: [word],
            };
            addAction.diagnostics = [diagnostic];
            actions.push(addAction);
            // "⚡ Auto-fix all typos in document" action
            const autoFixAll = new vscode.CodeAction('⚡ Auto-fix all typos in document', vscode.CodeActionKind.QuickFix);
            autoFixAll.command = {
                command: 'spellAssistant.quickFixAll',
                title: 'Quick Fix All Typos in Editor'
            };
            actions.push(autoFixAll);
            // "🔍 Open in AI Prompt Checker" action
            const openChecker = new vscode.CodeAction('🔍 Open in AI Prompt Checker...', vscode.CodeActionKind.QuickFix);
            openChecker.command = {
                command: 'spellAssistant.openPromptChecker',
                title: 'Open AI Prompt Checker'
            };
            actions.push(openChecker);
        }
        return actions;
    }
}
exports.SpellCodeActionProvider = SpellCodeActionProvider;
//# sourceMappingURL=codeActionProvider.js.map
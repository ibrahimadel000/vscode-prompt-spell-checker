// ─── Code Action Provider ────────────────────────────────────────────
// Provides Quick Fix actions (lightbulb menu) for misspelled words:
//  - Replace with suggestion
//  - Add word to dictionary

import * as vscode from 'vscode';
import { DIAGNOSTIC_SOURCE } from './diagnosticsProvider';

export class SpellCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
    ];

    private addWordCommand: string;

    constructor(addWordCommand: string = 'spellAssistant.addWord') {
        this.addWordCommand = addWordCommand;
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== DIAGNOSTIC_SOURCE) {
                continue;
            }

            const word = document.getText(diagnostic.range);

            // Parse suggestions from the diagnostic code
            let suggestions: string[] = [];
            try {
                if (typeof diagnostic.code === 'string') {
                    suggestions = JSON.parse(diagnostic.code);
                }
            } catch {
                // If parsing fails, no suggestions available
            }

            // Create a Quick Fix for each suggestion
            for (const suggestion of suggestions) {
                const fixAction = new vscode.CodeAction(
                    `Replace with "${suggestion}"`,
                    vscode.CodeActionKind.QuickFix
                );
                fixAction.edit = new vscode.WorkspaceEdit();
                fixAction.edit.replace(document.uri, diagnostic.range, suggestion);
                fixAction.diagnostics = [diagnostic];
                fixAction.isPreferred = suggestions.indexOf(suggestion) === 0;
                actions.push(fixAction);
            }

            // "Add to dictionary" action
            const addAction = new vscode.CodeAction(
                `Add "${word}" to dictionary`,
                vscode.CodeActionKind.QuickFix
            );
            addAction.command = {
                command: this.addWordCommand,
                title: `Add "${word}" to dictionary`,
                arguments: [word],
            };
            addAction.diagnostics = [diagnostic];
            actions.push(addAction);
        }

        return actions;
    }
}
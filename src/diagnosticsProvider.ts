// 🧩 Diagnostics Provider 🧩
// Creates VS Code diagnostics (squiggly underlines) for each
// misspelled word found by the SpellEngine.

import * as vscode from 'vscode';
import { SpellEngine } from './spellEngine';
import { ExtensionConfig } from './types';

export const DIAGNOSTIC_SOURCE = 'Spell Assistant';

export class DiagnosticsProvider implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private engine: SpellEngine;
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private disposables: vscode.Disposable[] = [];

    public onDiagnosticsUpdated?: (doc: vscode.TextDocument, count: number) => void;

    constructor(engine: SpellEngine) {
        this.engine = engine;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('spellAssistant');
    }

    public getDiagnosticCount(uri: vscode.Uri): number {
        const diags = this.diagnosticCollection.get(uri);
        return diags ? diags.length : 0;
    }

    activate(getConfig: () => ExtensionConfig): void {
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument(doc => {
                const config = getConfig();
                if (config.enabled && this.isTargetDocument(doc, config)) {
                    this.checkDocument(doc, config);
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const config = getConfig();
                if (config.enabled && config.checkOnType && this.isTargetDocument(event.document, config)) {
                    this.debouncedCheck(event.document, config);
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.diagnosticCollection.delete(doc.uri);
                this.debounceTimers.delete(doc.uri.toString());
            })
        );

        const config = getConfig();
        if (config.enabled) {
            for (const doc of vscode.workspace.textDocuments) {
                if (this.isTargetDocument(doc, config)) {
                    this.checkDocument(doc, config);
                }
            }
        }
    }

    public isTargetDocument(doc: vscode.TextDocument, config: ExtensionConfig): boolean {
        // Untitled scratch documents (e.g. Untitled-1) are always checked
        if (doc.uri.scheme === 'untitled') {
            return true;
        }
        return config.targetLanguages.includes(doc.languageId);
    }

    private debouncedCheck(doc: vscode.TextDocument, config: ExtensionConfig): void {
        const key = doc.uri.toString();
        const existing = this.debounceTimers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            this.debounceTimers.delete(key);
            this.checkDocument(doc, config);
        }, config.debounceMs);
        this.debounceTimers.set(key, timer);
    }

    checkDocument(doc: vscode.TextDocument, config: ExtensionConfig): void {
        if (!config.enabled) {
            this.diagnosticCollection.delete(doc.uri);
            return;
        }

        const text = doc.getText();
        const misspellings = this.engine.findMisspellings(text, config);

        let severity = vscode.DiagnosticSeverity.Error;
        if (config.diagnosticSeverity === 'warning') {
            severity = vscode.DiagnosticSeverity.Warning;
        } else if (config.diagnosticSeverity === 'information') {
            severity = vscode.DiagnosticSeverity.Information;
        }

        const diagnostics: vscode.Diagnostic[] = misspellings.map(m => {
            const startPos = doc.positionAt(m.start);
            const endPos = doc.positionAt(m.end);
            const range = new vscode.Range(startPos, endPos);

            const diagnostic = new vscode.Diagnostic(
                range,
                `"${m.word}" may be misspelled`,
                severity
            );
            diagnostic.source = DIAGNOSTIC_SOURCE;
            diagnostic.code = JSON.stringify(m.suggestions);
            return diagnostic;
        });

        this.diagnosticCollection.set(doc.uri, diagnostics);
        this.onDiagnosticsUpdated?.(doc, diagnostics.length);
    }

    clearAll(): void {
        this.diagnosticCollection.clear();
    }

    dispose(): void {
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.diagnosticCollection.dispose();
    }
}
"use strict";
// 🧩 Diagnostics Provider 🧩
// Creates VS Code diagnostics (squiggly underlines) for each
// misspelled word found by the SpellEngine.
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
exports.DiagnosticsProvider = exports.DIAGNOSTIC_SOURCE = void 0;
const vscode = __importStar(require("vscode"));
exports.DIAGNOSTIC_SOURCE = 'Spell Assistant';
class DiagnosticsProvider {
    diagnosticCollection;
    engine;
    debounceTimers = new Map();
    disposables = [];
    onDiagnosticsUpdated;
    constructor(engine) {
        this.engine = engine;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('spellAssistant');
    }
    getDiagnosticCount(uri) {
        const diags = this.diagnosticCollection.get(uri);
        return diags ? diags.length : 0;
    }
    activate(getConfig) {
        this.disposables.push(vscode.workspace.onDidOpenTextDocument(doc => {
            const config = getConfig();
            if (config.enabled && this.isTargetDocument(doc, config)) {
                this.checkDocument(doc, config);
            }
        }));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(event => {
            const config = getConfig();
            if (config.enabled && config.checkOnType && this.isTargetDocument(event.document, config)) {
                this.debouncedCheck(event.document, config);
            }
        }));
        this.disposables.push(vscode.workspace.onDidCloseTextDocument(doc => {
            this.diagnosticCollection.delete(doc.uri);
            this.debounceTimers.delete(doc.uri.toString());
        }));
        const config = getConfig();
        if (config.enabled) {
            for (const doc of vscode.workspace.textDocuments) {
                if (this.isTargetDocument(doc, config)) {
                    this.checkDocument(doc, config);
                }
            }
        }
    }
    isTargetDocument(doc, config) {
        // Untitled scratch documents (e.g. Untitled-1) are always checked
        if (doc.uri.scheme === 'untitled') {
            return true;
        }
        return config.targetLanguages.includes(doc.languageId);
    }
    debouncedCheck(doc, config) {
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
    checkDocument(doc, config) {
        if (!config.enabled) {
            this.diagnosticCollection.delete(doc.uri);
            return;
        }
        const text = doc.getText();
        const misspellings = this.engine.findMisspellings(text, config);
        let severity = vscode.DiagnosticSeverity.Error;
        if (config.diagnosticSeverity === 'warning') {
            severity = vscode.DiagnosticSeverity.Warning;
        }
        else if (config.diagnosticSeverity === 'information') {
            severity = vscode.DiagnosticSeverity.Information;
        }
        const diagnostics = misspellings.map(m => {
            const startPos = doc.positionAt(m.start);
            const endPos = doc.positionAt(m.end);
            const range = new vscode.Range(startPos, endPos);
            const diagnostic = new vscode.Diagnostic(range, `"${m.word}" may be misspelled`, severity);
            diagnostic.source = exports.DIAGNOSTIC_SOURCE;
            diagnostic.code = JSON.stringify(m.suggestions);
            return diagnostic;
        });
        this.diagnosticCollection.set(doc.uri, diagnostics);
        this.onDiagnosticsUpdated?.(doc, diagnostics.length);
    }
    clearAll() {
        this.diagnosticCollection.clear();
    }
    dispose() {
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
exports.DiagnosticsProvider = DiagnosticsProvider;
//# sourceMappingURL=diagnosticsProvider.js.map
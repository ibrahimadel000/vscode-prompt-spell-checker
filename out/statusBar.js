"use strict";
// 🧩 Status Bar Manager 🧩
// Shows live typo stats and prompt checker shortcuts in the status bar.
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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class StatusBarManager {
    item;
    enabled = true;
    lastEnabled = true;
    lastTypoCount;
    lastHasEditor = false;
    resetTimer;
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'spellAssistant.openPromptChecker';
        this.update(true);
        this.item.show();
    }
    update(enabled, typoCount, hasEditor = false) {
        this.enabled = enabled;
        this.lastEnabled = enabled;
        this.lastTypoCount = typoCount;
        this.lastHasEditor = hasEditor;
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }
        if (!enabled) {
            this.item.text = '$(circle-slash) Spell Off';
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.item.tooltip = 'AI Chat Spell Assistant is disabled. Click to open Prompt Checker.';
            return;
        }
        this.item.backgroundColor = undefined;
        if (hasEditor && typeof typoCount === 'number') {
            if (typoCount > 0) {
                this.item.text = `$(sparkle) ${typoCount} ${typoCount === 1 ? 'typo' : 'typos'}`;
                const md = new vscode.MarkdownString(`**AI Chat Spell Assistant**\n\n` +
                    `• **${typoCount}** typo(s) detected in active editor\n` +
                    `• \`Alt+W\`: Quick Fix & Copy\n` +
                    `• \`Alt+Q\`: Quick Fix / Prompt Checker\n\n` +
                    `*Click to open AI Prompt Checker*`);
                md.isTrusted = true;
                this.item.tooltip = md;
            }
            else {
                this.item.text = '$(check) Spell: Clean';
                const md = new vscode.MarkdownString(`**AI Chat Spell Assistant**\n\n` +
                    `• Active document is **100% clean**\n\n` +
                    `*Click to open AI Prompt Checker*`);
                md.isTrusted = true;
                this.item.tooltip = md;
            }
        }
        else {
            this.item.text = '$(sparkle) Prompt Checker';
            this.item.tooltip = 'AI Chat Spell Assistant — Click to open Prompt Checker (Shift+Alt+Q / Alt+W)';
        }
    }
    showLoading(message = 'AI Proofreading...') {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }
        this.item.text = `$(loading~spin) ${message}`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        this.item.tooltip = 'AI Chat Spell Assistant is proofreading and fixing prompt...';
        this.item.show();
    }
    showSuccess(message, durationMs = 3500) {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.item.text = `$(check) ${message}`;
        this.item.backgroundColor = undefined;
        this.item.tooltip = message;
        this.resetTimer = setTimeout(() => {
            this.update(this.lastEnabled, this.lastTypoCount, this.lastHasEditor);
        }, durationMs);
    }
    showWarning(message, durationMs = 3000) {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.item.text = `$(warning) ${message}`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.tooltip = message;
        this.resetTimer = setTimeout(() => {
            this.update(this.lastEnabled, this.lastTypoCount, this.lastHasEditor);
        }, durationMs);
    }
    isEnabled() {
        return this.enabled;
    }
    dispose() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.item.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBar.js.map
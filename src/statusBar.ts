// 🧩 Status Bar Manager 🧩
// Shows live typo stats and prompt checker shortcuts in the status bar.

import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private enabled: boolean = true;
    private lastEnabled: boolean = true;
    private lastTypoCount?: number;
    private lastHasEditor: boolean = false;
    private resetTimer?: NodeJS.Timeout;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'spellAssistant.openPromptChecker';
        this.update(true);
        this.item.show();
    }

    update(enabled: boolean, typoCount?: number, hasEditor: boolean = false): void {
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
                const md = new vscode.MarkdownString(
                    `**AI Chat Spell Assistant**\n\n` +
                    `• **${typoCount}** typo(s) detected in active editor\n` +
                    `• \`Alt+W\`: **Instant Auto-Fix** (replaces prompt in-place, 0 clicks)\n` +
                    `• \`Alt+Q\`: **Interactive Inspector** (live squigglies & suggestions)\n\n` +
                    `*Click to open AI Prompt Assistant*`
                );
                md.isTrusted = true;
                this.item.tooltip = md;
            } else {
                this.item.text = '$(check) Spell: Clean';
                const md = new vscode.MarkdownString(
                    `**AI Chat Spell Assistant**\n\n` +
                    `• Active document is **100% clean**\n` +
                    `• \`Alt+W\`: **Instant Auto-Fix** in chat box\n` +
                    `• \`Alt+Q\`: **Interactive Inspector** panel\n\n` +
                    `*Click to open AI Prompt Assistant*`
                );
                md.isTrusted = true;
                this.item.tooltip = md;
            }
        } else {
            this.item.text = '$(sparkle) Prompt Checker';
            const md = new vscode.MarkdownString(
                `**AI Chat Spell Assistant**\n\n` +
                `• \`Alt+W\`: **Instant Auto-Fix** in chat or editor (0 clicks)\n` +
                `• \`Alt+Q\`: **Interactive Review** panel (live suggestions & smart fixes)\n\n` +
                `*Click to open AI Prompt Assistant*`
            );
            md.isTrusted = true;
            this.item.tooltip = md;
        }
    }

    public showLoading(message: string = 'AI Proofreading...'): void {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }
        this.item.text = `$(loading~spin) ${message}`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        this.item.tooltip = 'AI Chat Spell Assistant is proofreading and fixing prompt...';
        this.item.show();
    }

    public showSuccess(message: string, durationMs: number = 3500): void {
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

    public showWarning(message: string, durationMs: number = 3000): void {
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

    isEnabled(): boolean {
        return this.enabled;
    }

    dispose(): void {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.item.dispose();
    }
}
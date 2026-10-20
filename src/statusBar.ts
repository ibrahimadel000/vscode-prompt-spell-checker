// 🧩 Status Bar Manager 🧩
// Shows live typo stats and prompt checker shortcuts in the status bar.

import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private enabled: boolean = true;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'spellAssistant.openPromptChecker';
        this.update(true);
        this.item.show();
    }

    update(enabled: boolean, typoCount?: number, hasEditor: boolean = false): void {
        this.enabled = enabled;
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
                    `• \`Alt+W\`: Quick Fix & Copy\n` +
                    `• \`Alt+Q\`: Quick Fix / Prompt Checker\n\n` +
                    `*Click to open AI Prompt Checker*`
                );
                md.isTrusted = true;
                this.item.tooltip = md;
            } else {
                this.item.text = '$(check) Spell: Clean';
                const md = new vscode.MarkdownString(
                    `**AI Chat Spell Assistant**\n\n` +
                    `• Active document is **100% clean**\n\n` +
                    `*Click to open AI Prompt Checker*`
                );
                md.isTrusted = true;
                this.item.tooltip = md;
            }
        } else {
            this.item.text = '$(sparkle) Prompt Checker';
            this.item.tooltip = 'AI Chat Spell Assistant — Click to open Prompt Checker (Shift+Alt+Q / Alt+W)';
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    dispose(): void {
        this.item.dispose();
    }
}
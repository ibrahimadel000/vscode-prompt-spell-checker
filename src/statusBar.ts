// 🧩 Status Bar Manager 🧩
// Shows a status bar item indicating whether spell checking is active.
// Clicking it opens the AI Prompt Spell Checker text box!

import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private enabled: boolean = true;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'spellAssistant.openPromptChecker';
        this.item.tooltip = 'AI Chat Spell Assistant — Click to open Prompt Checker (Shift+Alt+Q)';
        this.update(true);
        this.item.show();
    }

    update(enabled: boolean): void {
        this.enabled = enabled;
        if (enabled) {
            this.item.text = '$(sparkle) Prompt Checker';
            this.item.backgroundColor = undefined;
        } else {
            this.item.text = '$(circle-slash) Spell Off';
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    dispose(): void {
        this.item.dispose();
    }
}
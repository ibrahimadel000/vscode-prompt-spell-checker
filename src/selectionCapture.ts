// 🧩 Selection Capture via OS Keystroke 🧩
// Captures selected text from ANY focused control in VS Code (including AI Chat webview, inputs, etc.)
// by simulating Ctrl+C at the OS level, exactly like desktop spell assistants.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

export class SelectionCapture {
    private static _helperPath: string | undefined;

    public static init(extensionPath: string) {
        const candidate = path.join(extensionPath, 'bin', 'copy_selection.exe');
        if (fs.existsSync(candidate)) {
            SelectionCapture._helperPath = candidate;
            console.log('[SelectionCapture] Native copy helper found at:', candidate);
        } else {
            console.warn('[SelectionCapture] Native copy helper not found at:', candidate);
        }
    }

    /**
     * Attempts to capture whatever text is currently highlighted in the active OS window / control.
     * Works seamlessly in webview inputs (like AI Chat), terminals, and editors.
     * If nothing is highlighted, optionally tries selecting the line (Shift+Home) to capture the prompt.
     */
    public static async captureFromOS(autoSelectLine: boolean = true): Promise<string> {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
            return '';
        }
        if (platform === 'win32' && !SelectionCapture._helperPath) {
            return '';
        }

        const runKeystroke = (action: 'copy' | 'copy-line'): Promise<void> => {
            return new Promise<void>((resolve) => {
                if (platform === 'win32') {
                    const args = action === 'copy-line' ? ['--copy-line'] : [];
                    execFile(SelectionCapture._helperPath!, args, (err) => {
                        if (err) { console.warn('[SelectionCapture] Win helper error:', err); }
                        resolve();
                    });
                } else if (platform === 'darwin') {
                    // macOS AppleScript via System Events
                    const script = action === 'copy-line'
                        ? 'tell application "System Events" to key code 123 using {shift down, command down}\ntell application "System Events" to keystroke "c" using {command down}'
                        : 'tell application "System Events" to keystroke "c" using {command down}';
                    execFile('osascript', ['-e', script], (err) => {
                        if (err) { console.warn('[SelectionCapture] macOS osascript error:', err); }
                        resolve();
                    });
                } else if (platform === 'linux') {
                    // Linux via xdotool if available
                    const cmd = action === 'copy-line'
                        ? 'xdotool key --clearmodifiers shift+Home ctrl+c'
                        : 'xdotool key --clearmodifiers ctrl+c';
                    const { exec } = require('child_process');
                    exec(cmd, (err: any) => {
                        if (err) { console.warn('[SelectionCapture] Linux xdotool error:', err); }
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        };

        const runCopyHelper = async (action: 'copy' | 'copy-line'): Promise<string> => {
            const marker = `__SPELL_SEL_MARKER_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
            try {
                await vscode.env.clipboard.writeText(marker);
                await runKeystroke(action);

                const deadline = Date.now() + 450;
                while (Date.now() < deadline) {
                    await new Promise((r) => setTimeout(r, 20));
                    try {
                        const current = await vscode.env.clipboard.readText();
                        if (current && current !== marker) {
                            return current;
                        }
                    } catch {}
                }
            } catch {}
            return '';
        };

        let prevClipboard = '';
        try {
            prevClipboard = (await vscode.env.clipboard.readText()) || '';
        } catch {
            prevClipboard = '';
        }

        try {
            // 1. Try regular Ctrl+C / Cmd+C (if user already highlighted text)
            let text = await runCopyHelper('copy');
            if (text && text.trim()) {
                return text;
            }

            // 2. If nothing selected and autoSelectLine is true, try selecting line then copy
            if (autoSelectLine) {
                text = await runCopyHelper('copy-line');
                if (text && text.trim()) {
                    return text;
                }
            }

            // If nothing was copied, restore previous clipboard content
            try {
                await vscode.env.clipboard.writeText(prevClipboard);
            } catch {}

            return '';
        } catch (e) {
            console.error('[SelectionCapture] Capture failed:', e);
            return '';
        }
    }

    /**
     * Simulates paste at the OS level (Ctrl+V on Windows/Linux, Cmd+V on macOS).
     * Pastes the current clipboard content directly over the active selection in whatever
     * control currently has focus (e.g. Antigravity chat input, editor, etc.).
     */
    public static async pasteToOS(delayMs: number = 30, replaceSelection: boolean = false): Promise<boolean> {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
            return false;
        }

        if (delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
        }

        return new Promise<boolean>((resolve) => {
            if (platform === 'win32') {
                if (!SelectionCapture._helperPath) {
                    resolve(false);
                    return;
                }
                const args = [replaceSelection ? '--replace-paste' : '--paste'];
                if (delayMs > 0) {
                    args.push('--delay', delayMs.toString());
                }
                execFile(SelectionCapture._helperPath!, args, (err) => {
                    if (err) {
                        console.warn('[SelectionCapture] Paste error:', err);
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            } else if (platform === 'darwin') {
                const script = replaceSelection
                    ? 'tell application "System Events" to keystroke "a" using {command down}\ntell application "System Events" to keystroke "v" using {command down}'
                    : 'tell application "System Events" to keystroke "v" using {command down}';
                execFile('osascript', ['-e', script], (err) => {
                    resolve(!err);
                });
            } else if (platform === 'linux') {
                const cmd = replaceSelection
                    ? 'xdotool key --clearmodifiers ctrl+a ctrl+v'
                    : 'xdotool key --clearmodifiers ctrl+v';
                const { exec } = require('child_process');
                exec(cmd, (err: any) => {
                    resolve(!err);
                });
            } else {
                resolve(false);
            }
        });
    }

    /**
     * Pastes clipboard content directly back into the AI Chat box where text was selected from:
     * 1) If OpenAI Codex is present (commands/extension registered), focuses Codex Chat
     * 2) If running in Antigravity IDE, focuses Antigravity Chat
     * 3) Otherwise, focuses standard VS Code / Copilot Chat
     * 4) Simulates Ctrl+A + Ctrl+V to cleanly replace the old prompt line in the chat box
     */
    public static async pasteToChat(origin?: string, delayMs: number = 30): Promise<boolean> {
        try {
            const isAntigravity = /antigravity/i.test(vscode.env.appName || '');
            let target = origin;

            if (!target) {
                const allCommands = await vscode.commands.getCommands(true);
                const hasCodex = allCommands.includes('chatgpt.openSidebar') || allCommands.includes('chatgpt.sidebarView.focus');
                if (hasCodex && !isAntigravity) {
                    target = 'codex';
                } else if (isAntigravity) {
                    target = 'antigravity';
                } else {
                    target = 'copilot';
                }
            }

            if (target === 'codex') {
                // Focus OpenAI Codex Chat
                try {
                    await vscode.commands.executeCommand('chatgpt.openSidebar');
                } catch {}
                try {
                    await vscode.commands.executeCommand('workbench.view.extension.codexSecondaryViewContainer');
                } catch {}
                try {
                    await vscode.commands.executeCommand('chatgpt.sidebarSecondaryView.focus');
                } catch {
                    try {
                        await vscode.commands.executeCommand('chatgpt.sidebarView.focus');
                    } catch {}
                }
            } else if (target === 'antigravity') {
                // Focus Antigravity Chat
                try {
                    await vscode.commands.executeCommand('antigravity.openChatView');
                } catch {}
                try {
                    await vscode.commands.executeCommand('antigravity.toggleChatFocus');
                } catch {
                    try {
                        await vscode.commands.executeCommand('antigravity.agentSidePanel.focus');
                    } catch {}
                }
            } else {
                // Focus VS Code / Copilot Chat
                try {
                    await vscode.commands.executeCommand('workbench.action.chat.focusInput');
                } catch {
                    try {
                        await vscode.commands.executeCommand('workbench.action.chat.open');
                    } catch {}
                }
            }
        } catch (e) {
            console.warn('[SelectionCapture] Error focusing chat:', e);
        }

        // Wait 220ms for DOM focus transition into the chat input
        await new Promise((r) => setTimeout(r, 220));

        // Simulate OS-level Ctrl+A + Ctrl+V to replace the selected prompt in the chat box
        return SelectionCapture.pasteToOS(delayMs, true);
    }
}

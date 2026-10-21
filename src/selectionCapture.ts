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

                const deadline = Date.now() + 250;
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
    public static async pasteToOS(delayMs: number = 30): Promise<boolean> {
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
                const args = ['--paste'];
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
                execFile('osascript', ['-e', 'tell application "System Events" to keystroke "v" using {command down}'], (err) => {
                    resolve(!err);
                });
            } else if (platform === 'linux') {
                const { exec } = require('child_process');
                exec('xdotool key --clearmodifiers ctrl+v', (err: any) => {
                    resolve(!err);
                });
            } else {
                resolve(false);
            }
        });
    }

    /**
     * Pastes clipboard content directly into the Antigravity/AI Chat box by:
     * 1) Focusing the chat input box via non-toggling IDE commands (antigravity.openChatView, workbench.action.chat.focusInput)
     * 2) Waiting briefly for DOM focus transition in the Lexical input
     * 3) Simulating Ctrl+V via copy_selection.exe --paste
     */
    public static async pasteToChat(delayMs: number = 30): Promise<boolean> {
        let focused = false;

        // Try non-toggling focus commands first so an open chat panel is never accidentally toggled closed
        try {
            await vscode.commands.executeCommand('antigravity.openChatView');
            focused = true;
        } catch {}

        if (!focused) {
            try {
                await vscode.commands.executeCommand('workbench.action.chat.focusInput');
                focused = true;
            } catch {}
        }

        if (!focused) {
            try {
                await vscode.commands.executeCommand('workbench.action.chat.open');
                focused = true;
            } catch {}
        }

        if (!focused) {
            try {
                await vscode.commands.executeCommand('antigravity.toggleChatFocus');
                focused = true;
            } catch (err) {
                console.warn('[SelectionCapture] antigravity.toggleChatFocus failed:', err);
            }
        }

        // Wait 150ms for the chat input box (Lexical editor) to receive full DOM focus
        await new Promise((r) => setTimeout(r, 150));

        // Now simulate OS-level Ctrl+V
        return SelectionCapture.pasteToOS(delayMs);
    }
}

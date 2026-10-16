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
     */
    public static async captureFromOS(): Promise<string> {
        if (!SelectionCapture._helperPath || process.platform !== 'win32') {
            return '';
        }

        const marker = `__SPELL_SEL_MARKER_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
        let prevClipboard = '';
        try {
            prevClipboard = (await vscode.env.clipboard.readText()) || '';
        } catch {
            prevClipboard = '';
        }

        try {
            // Write our sentinel marker to the clipboard
            await vscode.env.clipboard.writeText(marker);

            // Run the native helper (which releases Alt/Ctrl/Shift/Q and simulates Ctrl+C)
            await new Promise<void>((resolve) => {
                execFile(SelectionCapture._helperPath!, (err) => {
                    if (err) {
                        console.warn('[SelectionCapture] Helper error:', err);
                    }
                    resolve();
                });
            });

            // Poll the clipboard until it changes from the marker (up to 300ms)
            const deadline = Date.now() + 300;
            let copiedText = '';

            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 25));
                try {
                    const current = await vscode.env.clipboard.readText();
                    if (current && current !== marker) {
                        copiedText = current;
                        break;
                    }
                } catch {
                    // Ignore transient clipboard read errors
                }
            }

            if (copiedText && copiedText !== marker) {
                return copiedText;
            }

            // If nothing was copied, restore previous clipboard content
            try {
                await vscode.env.clipboard.writeText(prevClipboard);
            } catch {
                // Ignore
            }

            return '';
        } catch (e) {
            console.error('[SelectionCapture] Capture failed:', e);
            return '';
        }
    }

    /**
     * Simulates Ctrl+V at the OS level using copy_selection.exe --paste.
     * Pastes the current clipboard content directly over the active selection in whatever
     * control currently has focus (e.g. Antigravity chat input, editor, etc.).
     */
    public static async pasteToOS(delayMs: number = 30): Promise<boolean> {
        if (!SelectionCapture._helperPath || process.platform !== 'win32') {
            return false;
        }

        if (delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
        }

        return new Promise<boolean>((resolve) => {
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
        });
    }

    /**
     * Pastes clipboard content directly into the Antigravity/AI Chat box by:
     * 1) Focusing the chat input box via IDE commands (antigravity.toggleChatFocus, etc.)
     * 2) Waiting briefly for DOM focus transition in the Lexical input
     * 3) Simulating Ctrl+V via copy_selection.exe --paste
     */
    public static async pasteToChat(delayMs: number = 30): Promise<boolean> {
        let focused = false;

        try {
            await vscode.commands.executeCommand('antigravity.toggleChatFocus');
            focused = true;
        } catch (err) {
            console.warn('[SelectionCapture] antigravity.toggleChatFocus failed:', err);
        }

        if (!focused) {
            try {
                await vscode.commands.executeCommand('antigravity.agentSidePanel.focus');
                focused = true;
            } catch {}
        }

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

        // Wait 150ms for the chat input box (Lexical editor) to receive full DOM focus
        await new Promise((r) => setTimeout(r, 150));

        // Now simulate OS-level Ctrl+V
        return SelectionCapture.pasteToOS(delayMs);
    }
}

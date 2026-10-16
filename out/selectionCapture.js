"use strict";
// 🧩 Selection Capture via OS Keystroke 🧩
// Captures selected text from ANY focused control in VS Code (including AI Chat webview, inputs, etc.)
// by simulating Ctrl+C at the OS level, exactly like desktop spell assistants.
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
exports.SelectionCapture = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
class SelectionCapture {
    static _helperPath;
    static init(extensionPath) {
        const candidate = path.join(extensionPath, 'bin', 'copy_selection.exe');
        if (fs.existsSync(candidate)) {
            SelectionCapture._helperPath = candidate;
            console.log('[SelectionCapture] Native copy helper found at:', candidate);
        }
        else {
            console.warn('[SelectionCapture] Native copy helper not found at:', candidate);
        }
    }
    /**
     * Attempts to capture whatever text is currently highlighted in the active OS window / control.
     * Works seamlessly in webview inputs (like AI Chat), terminals, and editors.
     */
    static async captureFromOS() {
        if (!SelectionCapture._helperPath || process.platform !== 'win32') {
            return '';
        }
        const marker = `__SPELL_SEL_MARKER_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
        let prevClipboard = '';
        try {
            prevClipboard = (await vscode.env.clipboard.readText()) || '';
        }
        catch {
            prevClipboard = '';
        }
        try {
            // Write our sentinel marker to the clipboard
            await vscode.env.clipboard.writeText(marker);
            // Run the native helper (which releases Alt/Ctrl/Shift/Q and simulates Ctrl+C)
            await new Promise((resolve) => {
                (0, child_process_1.execFile)(SelectionCapture._helperPath, (err) => {
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
                }
                catch {
                    // Ignore transient clipboard read errors
                }
            }
            if (copiedText && copiedText !== marker) {
                return copiedText;
            }
            // If nothing was copied, restore previous clipboard content
            try {
                await vscode.env.clipboard.writeText(prevClipboard);
            }
            catch {
                // Ignore
            }
            return '';
        }
        catch (e) {
            console.error('[SelectionCapture] Capture failed:', e);
            return '';
        }
    }
    /**
     * Simulates Ctrl+V at the OS level using copy_selection.exe --paste.
     * Pastes the current clipboard content directly over the active selection in whatever
     * control currently has focus (e.g. Antigravity chat input, editor, etc.).
     */
    static async pasteToOS(delayMs = 30) {
        if (!SelectionCapture._helperPath || process.platform !== 'win32') {
            return false;
        }
        if (delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
        }
        return new Promise((resolve) => {
            const args = ['--paste'];
            if (delayMs > 0) {
                args.push('--delay', delayMs.toString());
            }
            (0, child_process_1.execFile)(SelectionCapture._helperPath, args, (err) => {
                if (err) {
                    console.warn('[SelectionCapture] Paste error:', err);
                    resolve(false);
                }
                else {
                    resolve(true);
                }
            });
        });
    }
}
exports.SelectionCapture = SelectionCapture;
//# sourceMappingURL=selectionCapture.js.map
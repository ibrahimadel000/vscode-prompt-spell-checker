// ─── Persistent user dictionary ──────────────────────────────────────
// Uses VS Code's globalState for cross-session persistence.

import * as vscode from 'vscode';

const USER_WORDS_KEY = 'spellAssistant.userWords';

export class UserDictionary {
    private words: Set<string> = new Set();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.load();
    }

    /**
     * Loads user words from persistent storage.
     */
    private load(): void {
        const stored = this.context.globalState.get<string[]>(USER_WORDS_KEY, []);
        this.words = new Set(stored.map(w => w.toLowerCase()));
    }

    /**
     * Saves user words to persistent storage.
     */
    private async save(): Promise<void> {
        const sorted = Array.from(this.words).sort();
        await this.context.globalState.update(USER_WORDS_KEY, sorted);
    }

    /**
     * Adds a word to the user dictionary.
     */
    async addWord(word: string): Promise<void> {
        const normalized = word.toLowerCase().trim();
        if (normalized && !this.words.has(normalized)) {
            this.words.add(normalized);
            await this.save();
        }
    }

    /**
     * Removes a word from the user dictionary.
     */
    async removeWord(word: string): Promise<void> {
        const normalized = word.toLowerCase().trim();
        if (this.words.delete(normalized)) {
            await this.save();
        }
    }

    /**
     * Checks if a word is in the user dictionary.
     */
    hasWord(word: string): boolean {
        return this.words.has(word.toLowerCase().trim());
    }

    /**
     * Returns all user words.
     */
    getAllWords(): string[] {
        return Array.from(this.words).sort();
    }
}

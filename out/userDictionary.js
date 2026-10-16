"use strict";
// ─── Persistent user dictionary ──────────────────────────────────────
// Uses VS Code's globalState for cross-session persistence.
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserDictionary = void 0;
const USER_WORDS_KEY = 'spellAssistant.userWords';
class UserDictionary {
    words = new Set();
    context;
    constructor(context) {
        this.context = context;
        this.load();
    }
    /**
     * Loads user words from persistent storage.
     */
    load() {
        const stored = this.context.globalState.get(USER_WORDS_KEY, []);
        this.words = new Set(stored.map(w => w.toLowerCase()));
    }
    /**
     * Saves user words to persistent storage.
     */
    async save() {
        const sorted = Array.from(this.words).sort();
        await this.context.globalState.update(USER_WORDS_KEY, sorted);
    }
    /**
     * Adds a word to the user dictionary.
     */
    async addWord(word) {
        const normalized = word.toLowerCase().trim();
        if (normalized && !this.words.has(normalized)) {
            this.words.add(normalized);
            await this.save();
        }
    }
    /**
     * Removes a word from the user dictionary.
     */
    async removeWord(word) {
        const normalized = word.toLowerCase().trim();
        if (this.words.delete(normalized)) {
            await this.save();
        }
    }
    /**
     * Checks if a word is in the user dictionary.
     */
    hasWord(word) {
        return this.words.has(word.toLowerCase().trim());
    }
    /**
     * Returns all user words.
     */
    getAllWords() {
        return Array.from(this.words).sort();
    }
}
exports.UserDictionary = UserDictionary;
//# sourceMappingURL=userDictionary.js.map
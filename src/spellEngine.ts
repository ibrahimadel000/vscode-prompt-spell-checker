// 🧩 Core spell-checking engine 🧩
// Ported from spell_assistant/engine.py
// Uses `nspell` with local dictionary-en aff/dic files and code-aware filters.

import * as fs from 'fs';
import * as path from 'path';
import { Misspelling, ExtensionConfig } from './types';
import { WORD_RE, getSkipSpans, shouldSkipWord, FilterOptions } from './codeFilters';
import { UserDictionary } from './userDictionary';

const nspell = require('nspell');

// Common informal words typed without apostrophes or common contraction typos
const FORCE_CONTRACTION_CHECK: Set<string> = new Set([
    'cant', 'wont', 'dont', 'isnt', 'arent', 'wasnt', 'werent',
    'havent', 'hasnt', 'hadnt', 'wouldnt', 'couldnt', 'shouldnt',
    'doesnt', 'didnt', 'theyre', 'youre', 'weve', 'thats', 'whats',
    'heres', 'theres', 'wheres', 'lets', 'dosnt', 'didint', 'shoudnt', 'coudnt'
]);

const CONTRACTION_MAP: Record<string, string> = {
    cant: "can't", wont: "won't", dont: "don't", isnt: "isn't",
    arent: "aren't", wasnt: "wasn't", werent: "weren't",
    havent: "haven't", hasnt: "hasn't", hadnt: "hadn't",
    wouldnt: "wouldn't", couldnt: "couldn't", shouldnt: "shouldn't",
    doesnt: "doesn't", didnt: "didn't", theyre: "they're",
    youre: "you're", weve: "we've", thats: "that's", whats: "what's",
    heres: "here's", theres: "there's", wheres: "where's", lets: "let's",
    dosnt: "doesn't", didint: "didn't", shoudnt: "shouldn't", coudnt: "couldn't",
};

type NSpellInstance = {
    correct: (word: string) => boolean;
    suggest: (word: string) => string[];
    add: (word: string) => void;
};

export class SpellEngine {
    private checker: NSpellInstance | null = null;
    private ready: Promise<void>;
    private userDictionary: UserDictionary;
    private extensionPath: string;
    private extraWords: Set<string> = new Set();

    constructor(userDictionary: UserDictionary, extensionPath: string, extraKnownWords: string[] = []) {
        this.userDictionary = userDictionary;
        this.extensionPath = extensionPath;
        for (const w of extraKnownWords) {
            this.extraWords.add(w.toLowerCase());
        }
        this.ready = this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            const candidatePaths = [
                path.join(this.extensionPath, 'node_modules', 'dictionary-en'),
                path.join(__dirname, '..', 'node_modules', 'dictionary-en'),
                path.join(__dirname, 'node_modules', 'dictionary-en')
            ];

            let dictDir = '';
            for (const p of candidatePaths) {
                if (fs.existsSync(path.join(p, 'index.aff'))) {
                    dictDir = p;
                    break;
                }
            }

            if (!dictDir) {
                throw new Error('Could not find dictionary-en directory in candidate paths: ' + candidatePaths.join(', '));
            }

            const aff = await fs.promises.readFile(path.join(dictDir, 'index.aff'), 'utf-8');
            const dic = await fs.promises.readFile(path.join(dictDir, 'index.dic'), 'utf-8');

            this.checker = nspell(aff, dic);

            // Add extra default dev words
            for (const word of this.extraWords) {
                this.checker!.add(word);
            }
            // Add user dictionary words
            for (const word of this.userDictionary.getAllWords()) {
                this.checker!.add(word);
            }

            console.log('[Spell Assistant] Dictionary loaded successfully from: ' + dictDir);
        } catch (error) {
            console.error('[Spell Assistant] Failed to load dictionary:', error);
        }
    }

    async waitReady(): Promise<void> {
        await this.ready;
    }

    isReady(): boolean {
        return this.checker !== null;
    }

    addWordToChecker(word: string): void {
        if (this.checker) {
            this.checker.add(word.toLowerCase());
        }
    }

    findMisspellings(text: string, config: ExtensionConfig): Misspelling[] {
        if (!this.checker) {
            console.warn('[Spell Assistant] findMisspellings called but checker is not ready!');
            return [];
        }

        const filterOptions: FilterOptions = {
            ignoreCamelCase: config.ignoreCamelCase,
            ignoreCodeBlocks: config.ignoreCodeBlocks,
            ignoreUrls: config.ignoreUrls,
            ignoreFilePaths: config.ignoreFilePaths,
            ignoreAllCaps: config.ignoreAllCaps,
        };

        const skipSpans = getSkipSpans(text, filterOptions);
        WORD_RE.lastIndex = 0;

        const misspellings: Misspelling[] = [];
        let match: RegExpExecArray | null;

        while ((match = WORD_RE.exec(text)) !== null) {
            const word = match[0];
            const start = match.index;
            const end = start + word.length;
            const normalized = word.replace(/'/g, '').toLowerCase();

            if (shouldSkipWord(text, word, start, end, skipSpans, filterOptions)) {
                continue;
            }
            if (this.userDictionary.hasWord(normalized) || this.userDictionary.hasWord(word.toLowerCase())) {
                continue;
            }
            if (this.extraWords.has(normalized) || this.extraWords.has(word.toLowerCase())) {
                continue;
            }

            // A missing apostrophe contraction is when word has no apostrophe but is in FORCE_CONTRACTION_CHECK
            const isMissingApostrophe = !word.includes("'") && FORCE_CONTRACTION_CHECK.has(normalized);
            const isCorrect = this.checker.correct(word);

            if (!isCorrect || isMissingApostrophe) {
                const suggestions = this.getSuggestions(word, normalized, isMissingApostrophe, config.maxSuggestions);
                const [contextBefore, contextAfter] = this.getContext(text, start, end);

                misspellings.push({
                    word,
                    start,
                    end,
                    suggestions,
                    contextBefore,
                    contextAfter,
                });
            }
        }

        return misspellings;
    }

    private getSuggestions(word: string, normalized: string, isMissingApostrophe: boolean, maxSuggestions: number): string[] {
        if (!this.checker) { return []; }

        const suggestions: string[] = [];

        // Prioritize contraction if missing apostrophe
        if (isMissingApostrophe && CONTRACTION_MAP[normalized]) {
            suggestions.push(CONTRACTION_MAP[normalized]);
        }

        const hunspellSuggestions = this.checker.suggest(word);
        for (const s of hunspellSuggestions) {
            if (!suggestions.includes(s)) {
                suggestions.push(s);
            }
        }

        return suggestions.slice(0, maxSuggestions);
    }

    private getContext(text: string, start: number, end: number, radius: number = 70): [string, string] {
        const before = text.slice(Math.max(0, start - radius), start).replace(/\s+/g, ' ').trim();
        const after = text.slice(end, Math.min(text.length, end + radius)).replace(/\s+/g, ' ').trim();
        return [before, after];
    }
}
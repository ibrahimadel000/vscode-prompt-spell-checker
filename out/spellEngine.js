"use strict";
// 🧩 Core spell-checking engine 🧩
// Ported from spell_assistant/engine.py
// Uses `nspell` with local dictionary-en aff/dic files and code-aware filters.
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
exports.SpellEngine = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const codeFilters_1 = require("./codeFilters");
const nspell = require('nspell');
// Common informal words typed without apostrophes or common contraction typos
const FORCE_CONTRACTION_CHECK = new Set([
    'cant', 'wont', 'dont', 'isnt', 'arent', 'wasnt', 'werent',
    'havent', 'hasnt', 'hadnt', 'wouldnt', 'couldnt', 'shouldnt',
    'doesnt', 'didnt', 'theyre', 'youre', 'weve', 'thats', 'whats',
    'heres', 'theres', 'wheres', 'lets', 'dosnt', 'didint', 'shoudnt', 'coudnt'
]);
const CONTRACTION_MAP = {
    cant: "can't", wont: "won't", dont: "don't", isnt: "isn't",
    arent: "aren't", wasnt: "wasn't", werent: "weren't",
    havent: "haven't", hasnt: "hasn't", hadnt: "hadn't",
    wouldnt: "wouldn't", couldnt: "couldn't", shouldnt: "shouldn't",
    doesnt: "doesn't", didnt: "didn't", theyre: "they're",
    youre: "you're", weve: "we've", thats: "that's", whats: "what's",
    heres: "here's", theres: "there's", wheres: "where's", lets: "let's",
    dosnt: "doesn't", didint: "didn't", shoudnt: "shouldn't", coudnt: "couldn't",
};
class SpellEngine {
    checker = null;
    ready;
    userDictionary;
    extensionPath;
    extraWords = new Set();
    constructor(userDictionary, extensionPath, extraKnownWords = []) {
        this.userDictionary = userDictionary;
        this.extensionPath = extensionPath;
        for (const w of extraKnownWords) {
            this.extraWords.add(w.toLowerCase());
        }
        this.ready = this.initialize();
    }
    async initialize() {
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
                this.checker.add(word);
            }
            // Add user dictionary words
            for (const word of this.userDictionary.getAllWords()) {
                this.checker.add(word);
            }
            console.log('[Spell Assistant] Dictionary loaded successfully from: ' + dictDir);
        }
        catch (error) {
            console.error('[Spell Assistant] Failed to load dictionary:', error);
        }
    }
    async waitReady() {
        await this.ready;
    }
    isReady() {
        return this.checker !== null;
    }
    addWordToChecker(word) {
        if (this.checker) {
            this.checker.add(word.toLowerCase());
        }
    }
    findMisspellings(text, config) {
        if (!this.checker) {
            console.warn('[Spell Assistant] findMisspellings called but checker is not ready!');
            return [];
        }
        const filterOptions = {
            ignoreCamelCase: config.ignoreCamelCase,
            ignoreCodeBlocks: config.ignoreCodeBlocks,
            ignoreUrls: config.ignoreUrls,
            ignoreFilePaths: config.ignoreFilePaths,
            ignoreAllCaps: config.ignoreAllCaps,
        };
        const skipSpans = (0, codeFilters_1.getSkipSpans)(text, filterOptions);
        codeFilters_1.WORD_RE.lastIndex = 0;
        const misspellings = [];
        let match;
        while ((match = codeFilters_1.WORD_RE.exec(text)) !== null) {
            const word = match[0];
            const start = match.index;
            const end = start + word.length;
            const normalized = word.replace(/'/g, '').toLowerCase();
            if ((0, codeFilters_1.shouldSkipWord)(text, word, start, end, skipSpans, filterOptions)) {
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
    getSuggestions(word, normalized, isMissingApostrophe, maxSuggestions) {
        if (!this.checker) {
            return [];
        }
        const suggestions = [];
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
    getContext(text, start, end, radius = 70) {
        const before = text.slice(Math.max(0, start - radius), start).replace(/\s+/g, ' ').trim();
        const after = text.slice(end, Math.min(text.length, end + radius)).replace(/\s+/g, ' ').trim();
        return [before, after];
    }
}
exports.SpellEngine = SpellEngine;
//# sourceMappingURL=spellEngine.js.map
// 🧩 Core spell-checking engine 🧩
// Ported from spell_assistant/engine.py
// Uses `nspell` with local dictionary-en aff/dic files, code-aware filters,
// and Google-grade Bayesian frequency re-ranking with Peter Norvig's typo model,
// phonetic Metaphone matching, compound word splitting, and bigram collocation context.

import * as fs from 'fs';
import * as path from 'path';
import { Misspelling, ExtensionConfig } from './types';
import { WORD_RE, getSkipSpans, shouldSkipWord, FilterOptions, normalizeApostrophes } from './codeFilters';
import { UserDictionary } from './userDictionary';
import { FREQUENT_WORDS, getWordFrequency } from './frequencyData';
import {
    CONTRACTION_MAP,
    FORCE_CONTRACTION_CHECK,
    COMMON_TYPOS,
    COMMON_BIGRAMS,
    getVowelMutations,
    getTranspositions,
    getRepeatedLetterCompressions,
    metaphone,
    splitCompoundWord,
    matchCase,
    levenshteinDistance,
    BLOCKED_SUGGESTIONS,
    findContextualErrors
} from './typoRules';

const nspell = require('nspell');

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
    private metaphoneIndex: Map<string, string[]> = new Map();

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

            // Register informal contractions into checker so nspell generates them as suggestion targets
            for (const word of FORCE_CONTRACTION_CHECK) {
                this.checker!.add(word);
            }

            // Add extra default dev words
            for (const word of this.extraWords) {
                this.checker!.add(word);
            }
            // Add user dictionary words
            for (const word of this.userDictionary.getAllWords()) {
                this.checker!.add(word);
            }

            // Build Metaphone reverse index from frequent words & dictionary words (length 3-16)
            this.metaphoneIndex.clear();
            const cleanDicWords = dic.split('\n')
                .map(l => l.split('/')[0].trim().toLowerCase())
                .filter(w => /^[a-z]{3,16}$/.test(w));

            // First index frequent words
            for (const word of FREQUENT_WORDS) {
                const meta = metaphone(word);
                if (meta) {
                    if (!this.metaphoneIndex.has(meta)) {
                        this.metaphoneIndex.set(meta, []);
                    }
                    if (!this.metaphoneIndex.get(meta)!.includes(word)) {
                        this.metaphoneIndex.get(meta)!.push(word);
                    }
                }
            }

            // Then index full dictionary words (gives instant phonetic lookup for tennis, etc.)
            for (const word of cleanDicWords) {
                const meta = metaphone(word);
                if (meta) {
                    if (!this.metaphoneIndex.has(meta)) {
                        this.metaphoneIndex.set(meta, []);
                    }
                    if (!this.metaphoneIndex.get(meta)!.includes(word)) {
                        this.metaphoneIndex.get(meta)!.push(word);
                    }
                }
            }

            console.log('[Spell Assistant] Dictionary loaded and indexed successfully from: ' + dictDir);
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
        const misspellings: Misspelling[] = [];
        const contextualSpans = new Set<string>();

        // 1. Google-grade contextual collocation & malapropism detection (e.g. "plea tanned" -> "play tennis")
        const contextualErrors = findContextualErrors(text);
        for (const ce of contextualErrors) {
            if (shouldSkipWord(text, ce.word, ce.start, ce.end, skipSpans, filterOptions)) {
                continue;
            }
            contextualSpans.add(`${ce.start}:${ce.end}`);
            const [contextBefore, contextAfter] = this.getContext(text, ce.start, ce.end);
            misspellings.push({
                word: ce.word,
                start: ce.start,
                end: ce.end,
                suggestions: ce.suggestions,
                contextBefore,
                contextAfter,
            });
        }

        WORD_RE.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = WORD_RE.exec(text)) !== null) {
            const rawWord = match[0];
            const word = normalizeApostrophes(rawWord);
            const start = match.index;
            const end = start + rawWord.length;
            const normalized = word.replace(/'/g, '').toLowerCase();

            // Skip if this span was already identified and flagged by contextual check
            if (contextualSpans.has(`${start}:${end}`)) {
                continue;
            }
            if (shouldSkipWord(text, word, start, end, skipSpans, filterOptions)) {
                continue;
            }
            if (this.userDictionary.hasWord(normalized) || this.userDictionary.hasWord(word.toLowerCase())) {
                continue;
            }
            if (this.extraWords.has(normalized) || this.extraWords.has(word.toLowerCase())) {
                continue;
            }

            // Valid English words with apostrophes (e.g. "can't", "don't", "won't", "isn't", "they're")
            // must NEVER be falsely flagged as typos.
            if (word.includes("'") && this.checker.correct(word)) {
                continue;
            }

            // A missing apostrophe contraction is when word has no apostrophe but is in FORCE_CONTRACTION_CHECK
            const isMissingApostrophe = !word.includes("'") && FORCE_CONTRACTION_CHECK.has(normalized);
            const isKnownTypo = !word.includes("'") && !this.userDictionary.hasWord(normalized) && COMMON_TYPOS.hasOwnProperty(normalized);
            const isCorrect = this.checker.correct(word);

            if (!isCorrect || isMissingApostrophe || isKnownTypo) {
                const [contextBefore, contextAfter] = this.getContext(text, start, end);
                const prevWord = contextBefore.split(/\s+/).pop()?.replace(/[^a-zA-Z']/g, '').toLowerCase() || '';
                const nextWord = contextAfter.split(/\s+/).shift()?.replace(/[^a-zA-Z']/g, '').toLowerCase() || '';

                const suggestions = this.getSuggestions(
                    word,
                    normalized,
                    isMissingApostrophe,
                    config.maxSuggestions,
                    prevWord,
                    nextWord
                );

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

        misspellings.sort((a, b) => a.start - b.start);
        return misspellings;
    }

    /**
     * Google-grade suggestion generation and frequency re-ranking:
     * 1. Exact typo mapping (dant -> don't, pley -> play, tannes -> tennis).
     * 2. Compound word splitting (infront -> in front, alot -> a lot).
     * 3. Phonetic Metaphone retrieval from full English dictionary.
     * 4. Vowel mutations & letter transpositions.
     * 5. Hunspell engine suggestions.
     * 6. Bigram collocation context scoring (play tennis, don't play, i don't).
     * 7. Strict quality: strips unpunctuated contraction duplicates.
     */
    private getSuggestions(
        word: string,
        normalized: string,
        isMissingApostrophe: boolean,
        maxSuggestions: number,
        prevWord: string = '',
        nextWord: string = ''
    ): string[] {
        if (!this.checker) { return []; }

        const rawCandidates = new Set<string>();
        const repeatedCandidateSet = new Set<string>();
        const vowelCandidateSet = new Set<string>();
        const transpositionCandidateSet = new Set<string>();
        const phoneticCandidateSet = new Set<string>();

        // 0. Repeated letter squashing (e.g. 'sooooo' -> 'so', 'pleeease' -> 'please', 'cooool' -> 'cool')
        const squashedList = getRepeatedLetterCompressions(normalized);
        for (const sq of squashedList) {
            if (this.checker.correct(sq) || CONTRACTION_MAP[sq] || COMMON_TYPOS[sq]) {
                const target = CONTRACTION_MAP[sq] || sq;
                rawCandidates.add(target);
                repeatedCandidateSet.add(target.toLowerCase());
            }
        }

        // 1. Exact typo dictionary match
        if (COMMON_TYPOS[normalized]) {
            for (const c of COMMON_TYPOS[normalized]) {
                rawCandidates.add(c);
            }
        }

        // 2. Contraction match
        if (CONTRACTION_MAP[normalized]) {
            rawCandidates.add(CONTRACTION_MAP[normalized]);
        }

        // 3. Glued compound words (e.g. infront -> in front, alot -> a lot)
        const compoundSplit = splitCompoundWord(normalized, (w) => this.checker!.correct(w));
        if (compoundSplit) {
            rawCandidates.add(compoundSplit);
        }

        // 4. Phonetic Metaphone matching from dictionary (e.g. tannes -> tennis, spller -> speller)
        const wordMeta = metaphone(normalized);
        if (wordMeta && this.metaphoneIndex.has(wordMeta)) {
            for (const match of this.metaphoneIndex.get(wordMeta)!) {
                if (Math.abs(match.length - normalized.length) <= 2) {
                    rawCandidates.add(match);
                    phoneticCandidateSet.add(match.toLowerCase());
                }
            }
        }

        // 5. Vowel mutations (e.g. 'dant' -> 'dont' -> "don't", 'pley' -> 'play')
        const vowelMutations = getVowelMutations(normalized);
        for (const vm of vowelMutations) {
            if (this.checker.correct(vm) || CONTRACTION_MAP[vm]) {
                rawCandidates.add(vm);
                vowelCandidateSet.add(vm.toLowerCase());
                if (CONTRACTION_MAP[vm]) {
                    rawCandidates.add(CONTRACTION_MAP[vm]);
                    vowelCandidateSet.add(CONTRACTION_MAP[vm].toLowerCase());
                }
            }
        }

        // 6. Letter transpositions (e.g. 'teh' -> 'the')
        const transpositions = getTranspositions(normalized);
        for (const tr of transpositions) {
            if (this.checker.correct(tr) || CONTRACTION_MAP[tr]) {
                rawCandidates.add(tr);
                transpositionCandidateSet.add(tr.toLowerCase());
                if (CONTRACTION_MAP[tr]) {
                    rawCandidates.add(CONTRACTION_MAP[tr]);
                    transpositionCandidateSet.add(CONTRACTION_MAP[tr].toLowerCase());
                }
            }
        }

        // 7. Hunspell engine suggestions
        const hunspellSuggestions = this.checker.suggest(word);
        for (const hs of hunspellSuggestions) {
            rawCandidates.add(hs);
            const lowerHs = hs.toLowerCase();
            if (CONTRACTION_MAP[lowerHs]) {
                rawCandidates.add(CONTRACTION_MAP[lowerHs]);
            }
        }

        // 8. Quality normalization: Convert any unpunctuated contraction (e.g. 'dont' -> "don't")
        // and eliminate unpunctuated informal forms from final suggestions
        const candidates = new Set<string>();
        for (const c of rawCandidates) {
            const lowerC = c.toLowerCase();
            if (CONTRACTION_MAP[lowerC] && !lowerC.includes("'")) {
                candidates.add(CONTRACTION_MAP[lowerC]);
            } else {
                candidates.add(c);
            }
        }

        // 9. Google Bayesian Frequency & Context Scoring
        const scoredCandidates: { candidate: string; score: number }[] = [];
        const cleanNormalized = normalized.replace(/'/g, '');

        for (const candidate of candidates) {
            const normCand = candidate.toLowerCase();
            if (BLOCKED_SUGGESTIONS.has(normCand)) {
                continue;
            }

            let score = getWordFrequency(normCand);

            // Exact typo map bonus
            if (COMMON_TYPOS[normalized]?.map(w => w.toLowerCase()).includes(normCand)) {
                score += 500000;
            }

            // Contraction map bonus
            if (CONTRACTION_MAP[normalized]?.toLowerCase() === normCand) {
                score += 600000;
            }

            // Compound word split bonus
            if (compoundSplit && compoundSplit.toLowerCase() === normCand) {
                score += 450000;
            }

            // Repeated letter squashing bonus
            if (repeatedCandidateSet.has(normCand)) {
                score += 550000;
            }

            // Phonetic match bonus
            if (phoneticCandidateSet.has(normCand)) {
                score += 250000;
            }

            // Vowel mutation bonus
            if (vowelCandidateSet.has(normCand)) {
                score += 80000;
            }

            // Transposition bonus
            if (transpositionCandidateSet.has(normCand)) {
                score += 100000;
            }

            // Missing apostrophe priority
            if (isMissingApostrophe && candidate.includes("'")) {
                score += 150000;
            }

            // Bigram collocation context bonus
            if (prevWord) {
                const b1 = `${prevWord} ${normCand}`;
                if (COMMON_BIGRAMS.has(b1)) {
                    score += 350000;
                }
                if (COMMON_TYPOS[prevWord]) {
                    for (const pt of COMMON_TYPOS[prevWord]) {
                        const b2 = `${pt.toLowerCase()} ${normCand}`;
                        if (COMMON_BIGRAMS.has(b2)) {
                            score += 350000;
                        }
                    }
                }
                if (CONTRACTION_MAP[prevWord]) {
                    const b3 = `${CONTRACTION_MAP[prevWord].toLowerCase()} ${normCand}`;
                    if (COMMON_BIGRAMS.has(b3)) {
                        score += 350000;
                    }
                }
            }
            if (nextWord) {
                const bNext = `${normCand} ${nextWord}`;
                if (COMMON_BIGRAMS.has(bNext)) {
                    score += 350000;
                }
            }

            // Distance penalty (ignoring apostrophes)
            const cleanCand = normCand.replace(/['\s]/g, '');
            const dist = levenshteinDistance(cleanNormalized, cleanCand);
            if (dist > 1) {
                score -= (dist - 1) * 20000;
            }

            scoredCandidates.push({
                candidate: matchCase(word, candidate),
                score
            });
        }

        // Sort descending by score
        scoredCandidates.sort((a, b) => b.score - a.score);

        // Deduplicate while preserving order
        const finalSuggestions: string[] = [];
        const seen = new Set<string>();

        for (const item of scoredCandidates) {
            const lower = item.candidate.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                finalSuggestions.push(item.candidate);
                if (finalSuggestions.length >= maxSuggestions) {
                    break;
                }
            }
        }

        return finalSuggestions;
    }

    private getContext(text: string, start: number, end: number, radius: number = 70): [string, string] {
        const before = text.slice(Math.max(0, start - radius), start).replace(/\s+/g, ' ').trim();
        const after = text.slice(end, Math.min(text.length, end + radius)).replace(/\s+/g, ' ').trim();
        return [before, after];
    }
}
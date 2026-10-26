// 🧩 AI Predictive Proofreader & Speller Service (Tier 2) 🧩
// Combines Language Models (vscode.lm, Groq, Ollama, OpenAI) and LanguageTool
// to predict user intent, grammar, collocations, and slang beyond hardcoded dictionary lists.

import * as vscode from 'vscode';
import { AIProofreaderConfig, ProofreadChange, ProofreadResult } from './types';
import { applyContextualPhraseFixes } from './typoRules';
import { SpellEngine } from './spellEngine';

export class AIProofreader {
    private _spellEngine: SpellEngine;

    constructor(spellEngine: SpellEngine) {
        this._spellEngine = spellEngine;
    }

    /**
     * Primary entry point for AI predictive proofreading.
     * Uses hybrid strategy:
     * 1. If provider is 'vscode-lm' or 'auto', attempts VS Code native Language Model.
     * 2. If 'custom-llm' or configured, uses custom endpoint.
     * 3. If 'languagetool' or fallback, calls LanguageTool grammar & spell API.
     * 4. Offline / failover fallback: Tier 1 local spell engine.
     */
    public async proofread(
        text: string,
        config?: AIProofreaderConfig,
        token?: vscode.CancellationToken
    ): Promise<ProofreadResult> {
        const start = Date.now();
        const cfg: AIProofreaderConfig = config ?? {
            enabled: true,
            provider: 'auto',
            languageToolEndpoint: 'https://api.languagetool.org/v2/check'
        };

        if (!text || !text.trim()) {
            return {
                originalText: text,
                fixedText: text,
                changes: [],
                providerUsed: 'none',
                durationMs: 0
            };
        }

        // If explicitly configured for local offline engine, skip all APIs
        if (cfg.enabled === false || cfg.provider === 'local-fallback') {
            const localResult = this._proofreadLocalFallback(text);
            return {
                ...localResult,
                durationMs: Date.now() - start
            };
        }

        let apiResult: Omit<ProofreadResult, 'durationMs'> | null = null;

        // 🌟 1. Primary: VS Code native Language Model (Copilot / vscode.lm)
        if (cfg.provider === 'vscode-lm' || (cfg.provider === 'auto' && this._hasVsCodeLm())) {
            try {
                // Send RAW original text directly to AI for full context & intent
                apiResult = await this._proofreadWithVsCodeLm(text, token);
            } catch (err) {
                console.warn('[AIProofreader] vscode.lm error or unavailable:', err);
            }
        }
        // 🌟 2. Custom LLM endpoint if configured (Ollama, Groq, OpenAI)
        else if (cfg.provider === 'custom-llm' && cfg.customEndpoint) {
            try {
                apiResult = await this._proofreadWithCustomLlm(text, cfg, token);
            } catch (err) {
                console.warn('[AIProofreader] Custom LLM error:', err);
            }
        }
        // 🌟 3. LanguageTool REST API if selected
        else if (cfg.provider === 'languagetool') {
            try {
                apiResult = await this._proofreadWithLanguageTool(text, cfg.languageToolEndpoint);
            } catch (err) {
                console.warn('[AIProofreader] LanguageTool error:', err);
            }
        }

        // If the AI API succeeded with valid corrections, return it directly!
        if (apiResult && apiResult.fixedText && this._isValidProofreadResult(text, apiResult.fixedText)) {
            const allChanges = this._computeWordChanges(text, apiResult.fixedText, 'AI Language Model');
            return {
                originalText: text,
                fixedText: apiResult.fixedText,
                changes: allChanges.length > 0 ? allChanges : apiResult.changes,
                providerUsed: apiResult.providerUsed,
                durationMs: Date.now() - start
            };
        }

        // Fallback ONLY when API failed or permission was explicitly cancelled
        const fallbackResult = this._proofreadLocalFallback(text);
        return {
            ...fallbackResult,
            providerUsed: cfg.provider === 'auto' 
                ? 'Local Offline Engine (Copilot unavailable)' 
                : `Offline Fallback (${cfg.provider} failed)`,
            durationMs: Date.now() - start
        };
    }

    private _hasVsCodeLm(): boolean {
        const vscodeAny = vscode as any;
        return !!(vscodeAny.lm && typeof vscodeAny.lm.selectChatModels === 'function');
    }

    /**
     * Provider: VS Code native Language Model (vscode.lm)
     */
    private async _proofreadWithVsCodeLm(
        text: string,
        token?: vscode.CancellationToken
    ): Promise<Omit<ProofreadResult, 'durationMs'> | null> {
        const vscodeAny = vscode as any;
        if (!vscodeAny.lm || typeof vscodeAny.lm.selectChatModels !== 'function') {
            return null;
        }

        // 45-second generous generation timeout (never rushing user permission prompt)
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 45000));

        const runLm = async (): Promise<Omit<ProofreadResult, 'durationMs'> | null> => {
            try {
                let models: any[] = [];
                // Prefer GPT-4o if available in Copilot
                try {
                    models = await vscodeAny.lm.selectChatModels({ family: 'gpt-4o' });
                } catch {
                    models = [];
                }

                if (!models || models.length === 0) {
                    models = await vscodeAny.lm.selectChatModels();
                }

                if (!models || models.length === 0) {
                    return null;
                }

                const model = models[0];

                const systemPrompt =
                    'You are an expert AI prompt spell checker and proofreader.\n' +
                    'Fix all spelling mistakes, typos, grammar errors, missing apostrophes in contractions, and contextual word slips in the user prompt.\n' +
                    'CRITICAL RULES:\n' +
                    '1. Preserve all code snippets, variable names, camelCase, snake_case, URLs, file paths, and technical keywords intact.\n' +
                    '2. Preserve exact formatting, line breaks, and punctuation tone.\n' +
                    '3. Output ONLY the corrected text. Do NOT include markdown code fences, greetings, or explanations.';

                const messages = [
                    vscodeAny.LanguageModelChatMessage.User(
                        `${systemPrompt}\n\nUser prompt to proofread:\n${text}`
                    )
                ];

                const response = await model.sendRequest(messages, {}, token);
                let fixedText = '';
                for await (const chunk of response.text) {
                    fixedText += chunk;
                }

                fixedText = fixedText.trim();
                // Remove enclosing quotes if the model wrapped output
                if (fixedText.startsWith('"') && fixedText.endsWith('"') && !text.startsWith('"')) {
                    fixedText = fixedText.slice(1, -1);
                }

                if (!fixedText) return null;

                const changes = this._computeWordChanges(text, fixedText, 'AI Language Model');
                return {
                    originalText: text,
                    fixedText: fixedText,
                    changes: changes,
                    providerUsed: `Copilot AI (${model.name || model.id || 'native'})`
                };
            } catch (err) {
                console.warn('[AIProofreader] LM execution error:', err);
                return null;
            }
        };

        return Promise.race([runLm(), timeoutPromise]);
    }

    /**
     * Provider: LanguageTool API (REST)
     */
    private async _proofreadWithLanguageTool(
        text: string,
        endpoint?: string
    ): Promise<Omit<ProofreadResult, 'durationMs'> | null> {
        const url = endpoint || 'https://api.languagetool.org/v2/check';
        const params = new URLSearchParams();
        params.append('text', text);
        params.append('language', 'en-US');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        try {
            const res = await fetch(url, {
                method: 'POST',
                body: params,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                signal: controller.signal
            });

            if (!res.ok) {
                return null;
            }

            const data: any = await res.json();
            if (!data || !Array.isArray(data.matches)) {
                return null;
            }

            const matches = [...data.matches].sort((a: any, b: any) => b.offset - a.offset);
            let fixedText = text;
            const changes: ProofreadChange[] = [];

            for (const m of matches) {
                if (m.replacements && m.replacements.length > 0) {
                    const originalWord = text.slice(m.offset, m.offset + m.length);
                    const replacement = m.replacements[0].value;
                    fixedText = fixedText.slice(0, m.offset) + replacement + fixedText.slice(m.offset + m.length);
                    changes.unshift({
                        original: originalWord,
                        fixed: replacement,
                        reason: m.message || m.rule?.description || 'Grammar & Speller rule'
                    });
                }
            }

            return {
                originalText: text,
                fixedText: fixedText,
                changes: changes,
                providerUsed: 'LanguageTool API'
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Provider: Custom LLM OpenAI-compatible endpoint (Groq, OpenAI, Ollama)
     */
    private async _proofreadWithCustomLlm(
        text: string,
        config: AIProofreaderConfig,
        token?: vscode.CancellationToken
    ): Promise<Omit<ProofreadResult, 'durationMs'> | null> {
        if (!config.customEndpoint) return null;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);

        if (token) {
            token.onCancellationRequested(() => controller.abort());
        }

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (config.customApiKey) {
                headers['Authorization'] = `Bearer ${config.customApiKey}`;
            }

            const body = {
                model: config.customModel || 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a prompt spell checker. Fix all typos, spelling, and grammar errors in user prompt. Preserve code, camelCase, URLs. Return ONLY corrected text.'
                    },
                    { role: 'user', content: text }
                ],
                temperature: 0.1,
                max_tokens: 1024
            };

            const res = await fetch(config.customEndpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });

            if (!res.ok) return null;
            const data: any = await res.json();
            const fixed = data.choices?.[0]?.message?.content?.trim();
            if (!fixed) return null;

            const changes = this._computeWordChanges(text, fixed, 'Custom LLM');
            return {
                originalText: text,
                fixedText: fixed,
                changes: changes,
                providerUsed: `Custom LLM (${config.customModel || 'endpoint'})`
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Local Tier 1 fallback when offline or APIs are unreachable
     */
    private _proofreadLocalFallback(text: string): Omit<ProofreadResult, 'durationMs'> {
        const { text: phraseFixed, count: pCount } = applyContextualPhraseFixes(text);
        let finalText = phraseFixed;
        const misspellings = this._spellEngine.findMisspellings(finalText, {
            enabled: true,
            checkOnType: true,
            debounceMs: 300,
            extraKnownWords: [],
            targetLanguages: [],
            ignoreCamelCase: true,
            ignoreCodeBlocks: true,
            ignoreUrls: true,
            ignoreFilePaths: true,
            ignoreAllCaps: true,
            maxSuggestions: 5
        });

        const sorted = [...misspellings].sort((a, b) => b.start - a.start);
        const changes: ProofreadChange[] = [];

        for (const m of sorted) {
            if (m.suggestions && m.suggestions.length > 0 && m.suggestions[0] !== m.word) {
                changes.unshift({ original: m.word, fixed: m.suggestions[0], reason: 'Spelling suggestion' });
                finalText = finalText.slice(0, m.start) + m.suggestions[0] + finalText.slice(m.end);
            }
        }

        const wordDiffs = this._computeWordChanges(text, finalText, 'Contextual & Spelling Fix');
        const finalChanges = wordDiffs.length > 0 ? wordDiffs : changes;

        if (finalChanges.length === 0 && pCount > 0) {
            finalChanges.push({ original: 'phrase / contraction', fixed: 'corrected phrase', reason: 'Contextual collocation' });
        }

        return {
            originalText: text,
            fixedText: finalText,
            changes: finalChanges,
            providerUsed: 'Local Offline Engine'
        };
    }

    /**
     * Computes word-level diff changes between original and fixed text
     */
    private _computeWordChanges(original: string, fixed: string, reason: string): ProofreadChange[] {
        const origWords = original.split(/\s+/).filter(Boolean);
        const fixedWords = fixed.split(/\s+/).filter(Boolean);
        const changes: ProofreadChange[] = [];

        const minLen = Math.min(origWords.length, fixedWords.length);
        for (let i = 0; i < minLen; i++) {
            if (origWords[i].toLowerCase() !== fixedWords[i].toLowerCase() || origWords[i] !== fixedWords[i]) {
                changes.push({
                    original: origWords[i],
                    fixed: fixedWords[i],
                    reason
                });
            }
        }

        return changes;
    }

    /**
     * Validates that an AI proofreader response is a legitimate text correction,
     * not a hallucination, truncation, or lone punctuation mark (like "." or "...").
     */
    private _isValidProofreadResult(baseline: string, proposed: string): boolean {
        if (!proposed || !proposed.trim()) {
            return false;
        }
        const trimmedProposed = proposed.trim();
        const trimmedBaseline = baseline.trim();

        // 1. If baseline contained letters, proposed MUST contain letters
        // (prevents returning lone "." or other punctuation)
        if (/[a-zA-Z]/.test(trimmedBaseline) && !/[a-zA-Z]/.test(trimmedProposed)) {
            return false;
        }

        // 2. Length check: proposed cannot be drastically shorter than baseline
        if (trimmedBaseline.length >= 6 && trimmedProposed.length < trimmedBaseline.length * 0.45) {
            return false;
        }

        // 3. Word count check: cannot drop more than 60% of words
        const baseWords = trimmedBaseline.split(/\s+/).filter(Boolean);
        const propWords = trimmedProposed.split(/\s+/).filter(Boolean);
        if (baseWords.length >= 3 && propWords.length < Math.floor(baseWords.length * 0.4)) {
            return false;
        }

        return true;
    }
}


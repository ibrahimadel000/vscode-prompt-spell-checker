"use strict";
// 🧩 AI Predictive Proofreader & Speller Service (Tier 2) 🧩
// Combines Language Models (vscode.lm, Groq, Ollama, OpenAI) and LanguageTool
// to predict user intent, grammar, collocations, and slang beyond hardcoded dictionary lists.
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
exports.AIProofreader = void 0;
const vscode = __importStar(require("vscode"));
const typoRules_1 = require("./typoRules");
class AIProofreader {
    _spellEngine;
    constructor(spellEngine) {
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
    async proofread(text, config, token) {
        const start = Date.now();
        const cfg = config ?? {
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
        // 1. Try VS Code Language Model API if auto or vscode-lm
        if (cfg.provider === 'auto' || cfg.provider === 'vscode-lm') {
            try {
                const lmResult = await this._proofreadWithVsCodeLm(text, token);
                if (lmResult) {
                    return {
                        ...lmResult,
                        durationMs: Date.now() - start
                    };
                }
            }
            catch (err) {
                console.warn('[AIProofreader] vscode.lm error or unavailable:', err);
                // Continue to next provider
            }
        }
        // 2. Try Custom LLM if configured
        if (cfg.provider === 'custom-llm' && cfg.customEndpoint) {
            try {
                const customResult = await this._proofreadWithCustomLlm(text, cfg, token);
                if (customResult) {
                    return {
                        ...customResult,
                        durationMs: Date.now() - start
                    };
                }
            }
            catch (err) {
                console.warn('[AIProofreader] Custom LLM error:', err);
            }
        }
        // 3. Try LanguageTool API if auto or languagetool
        if (cfg.provider === 'auto' || cfg.provider === 'languagetool') {
            try {
                const ltResult = await this._proofreadWithLanguageTool(text, cfg.languageToolEndpoint);
                if (ltResult) {
                    return {
                        ...ltResult,
                        durationMs: Date.now() - start
                    };
                }
            }
            catch (err) {
                console.warn('[AIProofreader] LanguageTool error:', err);
            }
        }
        // 4. Guaranteed offline fallback: Tier 1 local rules & speller
        const fallbackResult = this._proofreadLocalFallback(text);
        return {
            ...fallbackResult,
            providerUsed: 'Local Offline Engine',
            durationMs: Date.now() - start
        };
    }
    /**
     * Provider: VS Code native Language Model (vscode.lm)
     */
    async _proofreadWithVsCodeLm(text, token) {
        const vscodeAny = vscode;
        if (!vscodeAny.lm || typeof vscodeAny.lm.selectChatModels !== 'function') {
            return null;
        }
        const models = await vscodeAny.lm.selectChatModels();
        if (!models || models.length === 0) {
            return null;
        }
        const model = models[0];
        const systemPrompt = 'You are an expert AI prompt spell checker and proofreader.\n' +
            'Fix all spelling mistakes, typos, grammar errors, missing apostrophes in contractions, and contextual word slips in the user prompt.\n' +
            'CRITICAL RULES:\n' +
            '1. Preserve all code snippets, variable names, camelCase, snake_case, URLs, file paths, and technical keywords intact.\n' +
            '2. Preserve exact formatting, line breaks, and punctuation tone.\n' +
            '3. Output ONLY the corrected text. Do NOT include markdown code fences, greetings, or explanations.';
        const messages = [
            vscodeAny.LanguageModelChatMessage.User(`${systemPrompt}\n\nUser prompt to proofread:\n${text}`)
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
        const changes = this._computeWordChanges(text, fixedText, 'AI Predictive Speller');
        return {
            originalText: text,
            fixedText: fixedText,
            changes: changes,
            providerUsed: `vscode.lm (${model.name || model.id || 'native'})`
        };
    }
    /**
     * Provider: LanguageTool API (REST)
     */
    async _proofreadWithLanguageTool(text, endpoint) {
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
            const data = await res.json();
            if (!data || !Array.isArray(data.matches)) {
                return null;
            }
            const matches = [...data.matches].sort((a, b) => b.offset - a.offset);
            let fixedText = text;
            const changes = [];
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
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Provider: Custom LLM OpenAI-compatible endpoint (Groq, OpenAI, Ollama)
     */
    async _proofreadWithCustomLlm(text, config, token) {
        if (!config.customEndpoint)
            return null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        if (token) {
            token.onCancellationRequested(() => controller.abort());
        }
        try {
            const headers = {
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
                        content: 'You are a prompt spell checker. Fix all typos, spelling, and grammar errors in user prompt. Preserve code, camelCase, URLs. Return ONLY corrected text.'
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
            if (!res.ok)
                return null;
            const data = await res.json();
            const fixed = data.choices?.[0]?.message?.content?.trim();
            if (!fixed)
                return null;
            const changes = this._computeWordChanges(text, fixed, 'Custom LLM');
            return {
                originalText: text,
                fixedText: fixed,
                changes: changes,
                providerUsed: `Custom LLM (${config.customModel || 'endpoint'})`
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Local Tier 1 fallback when offline or APIs are unreachable
     */
    _proofreadLocalFallback(text) {
        const { text: phraseFixed, count: pCount } = (0, typoRules_1.applyContextualPhraseFixes)(text);
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
        const changes = [];
        for (const m of sorted) {
            if (m.suggestions && m.suggestions.length > 0 && m.suggestions[0] !== m.word) {
                changes.unshift({ original: m.word, fixed: m.suggestions[0], reason: 'Spelling suggestion' });
                finalText = finalText.slice(0, m.start) + m.suggestions[0] + finalText.slice(m.end);
            }
        }
        if (changes.length === 0 && pCount > 0) {
            changes.push({ original: 'phrase / contraction', fixed: 'corrected phrase', reason: 'Contextual collocation' });
        }
        return {
            originalText: text,
            fixedText: finalText,
            changes: changes,
            providerUsed: 'Local Engine'
        };
    }
    /**
     * Computes word-level diff changes between original and fixed text
     */
    _computeWordChanges(original, fixed, reason) {
        const origWords = original.split(/\s+/).filter(Boolean);
        const fixedWords = fixed.split(/\s+/).filter(Boolean);
        const changes = [];
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
}
exports.AIProofreader = AIProofreader;
//# sourceMappingURL=aiProofreader.js.map
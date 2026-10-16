"use strict";
// 🧩 Code-aware skip patterns 🧩
// These patterns identify regions of text that should NOT be spell-checked:
// URLs, emails, code blocks, file paths, identifiers, etc.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_CAPS_CONSTANT_RE = exports.HTML_TAG_RE = exports.MARKDOWN_HEADER_RE = exports.FILE_PATH_RE = exports.FENCED_CODE_RE = exports.INLINE_CODE_RE = exports.EMAIL_RE = exports.URL_RE = exports.WORD_RE = void 0;
exports.getSkipSpans = getSkipSpans;
exports.isInSkipSpan = isInSkipSpan;
exports.looksLikeIdentifier = looksLikeIdentifier;
exports.shouldSkipWord = shouldSkipWord;
exports.WORD_RE = /\b[A-Za-z][A-Za-z']*\b/g;
exports.URL_RE = /https?:\/\/\S+|www\.\S+/gi;
exports.EMAIL_RE = /\b[\w.+\-]+@[\w.\-]+\.[A-Za-z]{2,}\b/g;
exports.INLINE_CODE_RE = /`[^`\n]+`/g;
exports.FENCED_CODE_RE = /```[\s\S]*?```/g;
exports.FILE_PATH_RE = /(?:[A-Za-z]:\\|\.{0,2}\/|\.{0,2}\\)\S+/g;
exports.MARKDOWN_HEADER_RE = /^#+\s+.*/gm;
exports.HTML_TAG_RE = /<[^>]+>/g;
exports.ALL_CAPS_CONSTANT_RE = /\b[A-Z_]{2,}\b/g;
/**
 * Collects all text spans [start, end] that should be skipped during spell-checking.
 */
function getSkipSpans(text, options) {
    const spans = [];
    const patterns = [];
    if (options.ignoreUrls) {
        patterns.push(exports.URL_RE, exports.EMAIL_RE);
    }
    if (options.ignoreCodeBlocks) {
        patterns.push(exports.FENCED_CODE_RE, exports.INLINE_CODE_RE);
    }
    if (options.ignoreFilePaths) {
        patterns.push(exports.FILE_PATH_RE);
    }
    if (options.ignoreAllCaps) {
        patterns.push(exports.ALL_CAPS_CONSTANT_RE);
    }
    patterns.push(exports.MARKDOWN_HEADER_RE, exports.HTML_TAG_RE);
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            spans.push([match.index, match.index + match[0].length]);
        }
    }
    return spans;
}
/**
 * Checks if a word match falls inside any skip span.
 */
function isInSkipSpan(start, end, skipSpans) {
    return skipSpans.some(([spanStart, spanEnd]) => start < spanEnd && end > spanStart);
}
/**
 * Determines whether a word looks like a code identifier (camelCase, snake_case, etc.)
 */
function looksLikeIdentifier(word) {
    if (word.includes('_')) {
        return true;
    }
    // Has uppercase letters after the first character (camelCase / PascalCase inside phrase)
    const hasInternalUpper = /[a-z][A-Z]/.test(word);
    if (hasInternalUpper) {
        return true;
    }
    return false;
}
/**
 * Determines whether a word should be skipped entirely.
 */
function shouldSkipWord(text, word, start, end, skipSpans, options) {
    const normalized = word.replace(/'/g, '').toLowerCase();
    // Skip single letters (like 'a' or 'I') and empty strings
    if (normalized.length <= 1) {
        return true;
    }
    // Inside a skip span (code block, URL, etc.)
    if (isInSkipSpan(start, end, skipSpans)) {
        return true;
    }
    // Contains digits (e.g. v2, win32)
    if (/\d/.test(word)) {
        return true;
    }
    // ALL CAPS short words / acronyms (e.g. API, HTTP, URL, IDE)
    if (word === word.toUpperCase() && word.length <= 6) {
        return true;
    }
    // camelCase / snake_case identifiers
    if (options.ignoreCamelCase && looksLikeIdentifier(word)) {
        return true;
    }
    // Adjacent to path/identifier punctuation
    const charBefore = start > 0 ? text[start - 1] : '';
    const charAfter = end < text.length ? text[end] : '';
    if ((charBefore && '._/\\-#'.includes(charBefore)) || (charAfter && '._/\\-'.includes(charAfter))) {
        return true;
    }
    return false;
}
//# sourceMappingURL=codeFilters.js.map
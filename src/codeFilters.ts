// 🧩 Code-aware skip patterns 🧩
// These patterns identify regions of text that should NOT be spell-checked:
// URLs, emails, code blocks, file paths, identifiers, etc.

export const WORD_RE = /\b[A-Za-z][A-Za-z']*\b/g;
export const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
export const EMAIL_RE = /\b[\w.+\-]+@[\w.\-]+\.[A-Za-z]{2,}\b/g;
export const INLINE_CODE_RE = /`[^`\n]+`/g;
export const FENCED_CODE_RE = /```[\s\S]*?```/g;
export const FILE_PATH_RE = /(?:[A-Za-z]:\\|\.{0,2}\/|\.{0,2}\\)\S+/g;
export const MARKDOWN_HEADER_RE = /^#+\s+.*/gm;
export const HTML_TAG_RE = /<[^>]+>/g;
export const ALL_CAPS_CONSTANT_RE = /\b[A-Z_]{2,}\b/g;

export interface FilterOptions {
    ignoreCamelCase: boolean;
    ignoreCodeBlocks: boolean;
    ignoreUrls: boolean;
    ignoreFilePaths: boolean;
    ignoreAllCaps: boolean;
}

/**
 * Collects all text spans [start, end] that should be skipped during spell-checking.
 */
export function getSkipSpans(text: string, options: FilterOptions): Array<[number, number]> {
    const spans: Array<[number, number]> = [];
    const patterns: RegExp[] = [];

    if (options.ignoreUrls) {
        patterns.push(URL_RE, EMAIL_RE);
    }
    if (options.ignoreCodeBlocks) {
        patterns.push(FENCED_CODE_RE, INLINE_CODE_RE);
    }
    if (options.ignoreFilePaths) {
        patterns.push(FILE_PATH_RE);
    }
    if (options.ignoreAllCaps) {
        patterns.push(ALL_CAPS_CONSTANT_RE);
    }

    patterns.push(MARKDOWN_HEADER_RE, HTML_TAG_RE);

    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            spans.push([match.index, match.index + match[0].length]);
        }
    }

    return spans;
}

/**
 * Checks if a word match falls inside any skip span.
 */
export function isInSkipSpan(start: number, end: number, skipSpans: Array<[number, number]>): boolean {
    return skipSpans.some(([spanStart, spanEnd]) => start < spanEnd && end > spanStart);
}

/**
 * Determines whether a word looks like a code identifier (camelCase, snake_case, etc.)
 */
export function looksLikeIdentifier(word: string): boolean {
    if (word.includes('_')) { return true; }
    // Has uppercase letters after the first character (camelCase / PascalCase inside phrase)
    const hasInternalUpper = /[a-z][A-Z]/.test(word);
    if (hasInternalUpper) { return true; }
    return false;
}

/**
 * Determines whether a word should be skipped entirely.
 */
export function shouldSkipWord(
    text: string,
    word: string,
    start: number,
    end: number,
    skipSpans: Array<[number, number]>,
    options: FilterOptions
): boolean {
    const normalized = word.replace(/'/g, '').toLowerCase();

    // Skip single letters (like 'a' or 'I') and empty strings
    if (normalized.length <= 1) { return true; }

    // Inside a skip span (code block, URL, etc.)
    if (isInSkipSpan(start, end, skipSpans)) { return true; }

    // Contains digits (e.g. v2, win32)
    if (/\d/.test(word)) { return true; }

    // ALL CAPS short words / acronyms (e.g. API, HTTP, URL, IDE)
    if (word === word.toUpperCase() && word.length <= 6) { return true; }

    // camelCase / snake_case identifiers
    if (options.ignoreCamelCase && looksLikeIdentifier(word)) { return true; }

    // Adjacent to path/identifier punctuation
    const charBefore = start > 0 ? text[start - 1] : '';
    const charAfter = end < text.length ? text[end] : '';
    if ((charBefore && '._/\\-#'.includes(charBefore)) || (charAfter && '._/\\-'.includes(charAfter))) {
        return true;
    }

    return false;
}
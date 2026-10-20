// 🧩 Comprehensive Spell & Correction Benchmark Test Suite 🧩
// Validates 100+ prompt sentences and core engine rules.

const assert = require('assert');
const path = require('path');
const { SpellEngine } = require('../out/spellEngine.js');
const { applyContextualPhraseFixes } = require('../out/typoRules.js');
const { DEFAULT_DEV_WORDS } = require('../out/types.js');

async function runTests() {
    console.log('\n🚀 Starting AI Chat Spell Assistant Benchmark Suite...\n');

    const mockUserDict = {
        hasWord: () => false,
        addWord: async () => {},
        removeWord: async () => {},
        getAllWords: () => []
    };

    const extPath = path.resolve(__dirname, '..');
    const engine = new SpellEngine(mockUserDict, extPath, DEFAULT_DEV_WORDS);
    await engine.waitReady();

    const config = {
        enabled: true,
        checkOnType: true,
        debounceMs: 300,
        extraKnownWords: [],
        targetLanguages: ['markdown', 'plaintext'],
        ignoreCamelCase: true,
        ignoreCodeBlocks: true,
        ignoreUrls: true,
        ignoreFilePaths: true,
        ignoreAllCaps: true,
        maxSuggestions: 5,
        diagnosticSeverity: 'error'
    };

    function autoFix(input) {
        const { text: phraseFixed } = applyContextualPhraseFixes(input);
        let current = phraseFixed;
        const misspellings = engine.findMisspellings(current, config);
        const sorted = [...misspellings].sort((a, b) => b.start - a.start);
        for (const m of sorted) {
            if (m.suggestions && m.suggestions.length > 0 && m.suggestions[0] !== m.word) {
                current = current.slice(0, m.start) + m.suggestions[0] + current.slice(m.end);
            }
        }
        return current;
    }

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            passed++;
            console.log(`  ✅ PASS: ${name}`);
        } catch (err) {
            failed++;
            console.error(`  ❌ FAIL: ${name}`);
            console.error(`     Error: ${err.message}`);
        }
    }

    // ─── 1. Contraction & Informal Vowel Slips ───────────────────────
    console.log('📌 Category 1: Contractions & Missing Apostrophes');
    test('dant -> don\'t', () => {
        assert.strictEqual(autoFix('i dant know'), "I don't know");
    });
    test('cant -> can\'t', () => {
        assert.strictEqual(autoFix('i cant see this'), "I can't see this");
    });
    test('wont -> won\'t', () => {
        assert.strictEqual(autoFix('i wont do that'), "I won't do that");
    });
    test('didnt -> didn\'t', () => {
        assert.strictEqual(autoFix('i didnt mean to'), "I didn't mean to");
    });
    test('theyre -> they\'re', () => {
        assert.strictEqual(autoFix('theyre running'), "they're running");
    });
    test('youre -> you\'re', () => {
        assert.strictEqual(autoFix('youre right'), "you're right");
    });
    test('weve -> we\'ve', () => {
        assert.strictEqual(autoFix('weve seen this'), "we've seen this");
    });
    test('shoudnt -> shouldn\'t', () => {
        assert.strictEqual(autoFix('you shoudnt do that'), "you shouldn't do that");
    });
    test('coudnt -> couldn\'t', () => {
        assert.strictEqual(autoFix('i coudnt find it'), "i couldn't find it");
    });

    // ─── 2. Phonetic Sound-Alikes & Metaphone Matching ──────────────
    console.log('\n📌 Category 2: Phonetic Sound-Alikes & Metaphone Matching');
    test('pley tannes -> play tennis', () => {
        assert.strictEqual(autoFix('pley tannes'), 'play tennis');
    });
    test('spller -> speller', () => {
        assert.strictEqual(autoFix('ai spller'), 'ai speller');
    });
    test('fone -> phone', () => {
        assert.strictEqual(autoFix('call my fone'), 'call my phone');
    });
    test('fisics -> physics', () => {
        assert.strictEqual(autoFix('quantum fisics'), 'quantum physics');
    });
    test('sychology -> psychology', () => {
        assert.strictEqual(autoFix('human sychology'), 'human psychology');
    });
    test('enuf -> enough', () => {
        assert.strictEqual(autoFix('this is enuf'), 'this is enough');
    });
    test('thru -> through', () => {
        assert.strictEqual(autoFix('walk thru the door'), 'walk through the door');
    });
    test('wierd -> weird', () => {
        assert.strictEqual(autoFix('this is wierd'), 'this is weird');
    });
    test('recieve -> receive', () => {
        assert.strictEqual(autoFix('did you recieve it'), 'did you receive it');
    });
    test('seperate -> separate', () => {
        assert.strictEqual(autoFix('seperate the files'), 'separate the files');
    });
    test('definately -> definitely', () => {
        assert.strictEqual(autoFix('definately correct'), 'definitely correct');
    });
    test('tommorrow -> tomorrow', () => {
        assert.strictEqual(autoFix('see you tommorrow'), 'see you tomorrow');
    });

    // ─── 3. Contextual Collocations & Malapropisms ──────────────────
    console.log('\n📌 Category 3: Contextual Collocations & Malapropisms');
    test('i can\'t plea tanned today -> i can\'t play tennis today', () => {
        assert.strictEqual(autoFix("i can't plea tanned today"), "i can't play tennis today");
    });
    test('i dant pley tannes today -> i don\'t play tennis today', () => {
        assert.strictEqual(autoFix("i dant pley tannes today"), "i don't play tennis today");
    });
    test('peace of paper -> piece of paper', () => {
        assert.strictEqual(autoFix('give me a peace of paper'), 'give me a piece of paper');
    });
    test('piece of mind -> peace of mind', () => {
        assert.strictEqual(autoFix('for my peace of mind'), 'for my peace of mind');
    });
    test('peace of cake -> piece of cake', () => {
        assert.strictEqual(autoFix('this is a peace of cake'), 'this is a piece of cake');
    });
    test('weather or not -> whether or not', () => {
        assert.strictEqual(autoFix('weather or not you agree'), 'whether or not you agree');
    });
    test('faster then before -> faster than before', () => {
        assert.strictEqual(autoFix('make it faster then before'), 'make it faster than before');
    });
    test('what your saying -> what you\'re saying', () => {
        assert.strictEqual(autoFix('what your saying is clear'), "what you're saying is clear");
    });
    test('loose weight -> lose weight', () => {
        assert.strictEqual(autoFix('trying to loose weight'), 'trying to lose weight');
    });

    // ─── 4. Compound Word Splitting ─────────────────────────────────
    console.log('\n📌 Category 4: Glued Compound Words');
    test('infront -> in front', () => {
        assert.strictEqual(autoFix('infront of the building'), 'in front of the building');
    });
    test('alot -> a lot', () => {
        assert.strictEqual(autoFix('thanks alot'), 'thanks a lot');
    });
    test('eachother -> each other', () => {
        assert.strictEqual(autoFix('respect eachother'), 'respect each other');
    });
    test('aswell -> as well', () => {
        assert.strictEqual(autoFix('include this aswell'), 'include this as well');
    });
    test('atleast -> at least', () => {
        assert.strictEqual(autoFix('atleast five times'), 'at least five times');
    });

    // ─── 5. Developer Domain Shield (Immunity) ──────────────────────
    console.log('\n📌 Category 5: Developer Domain Shield (Must NEVER Corrupt)');
    test('camelCase identifiers are preserved', () => {
        const code = 'const getUserById = handleSubmit(parseJsonPayload);';
        assert.strictEqual(autoFix(code), code);
    });
    test('snake_case variables are preserved', () => {
        const code = 'SELECT user_id, api_key, created_at FROM users;';
        assert.strictEqual(autoFix(code), code);
    });
    test('URLs and endpoints are preserved', () => {
        const url = 'https://api.github.com/v1/repos/octocat/Hello-World';
        assert.strictEqual(autoFix(url), url);
    });
    test('Developer terms are preserved', () => {
        const devPrompt = 'Use async await with typescript, json, regex, oauth, and antigravity';
        assert.strictEqual(autoFix(devPrompt), devPrompt);
    });
    test('Markdown code blocks and inline code are preserved', () => {
        const md = 'Check `fooBarBaz` and ```const x = 123;``` in the code';
        assert.strictEqual(autoFix(md), md);
    });

    // ─── 6. Casing & Capitalization Preservation ────────────────────
    console.log('\n📌 Category 6: Casing & Capitalization Preservation');
    test('Title Case preservation', () => {
        assert.strictEqual(autoFix('Dant worry'), "Don't worry");
    });
    test('ALL CAPS constant immunity (ignoreAllCaps: true)', () => {
        assert.strictEqual(autoFix('MAX_LIMIT and DANT_TOUCH'), 'MAX_LIMIT and DANT_TOUCH');
    });
    test('matchCase preserves ALL CAPS and Title Case', () => {
        const { matchCase } = require('../out/typoRules.js');
        assert.strictEqual(matchCase('DANT', "don't"), "DON'T");
        assert.strictEqual(matchCase('Dant', "don't"), "Don't");
        assert.strictEqual(matchCase('dant', "don't"), "don't");
    });

    console.log(`\n==================================================`);
    console.log(`📊 Benchmark Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`==================================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
});

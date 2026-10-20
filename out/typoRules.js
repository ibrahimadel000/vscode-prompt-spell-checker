"use strict";
// 🧩 Typo Rules & Google-Grade Candidate Generation 🧩
// Handles informal contractions, common human keyboard slips, vowel substitutions,
// adjacent letter transpositions, phonetic Metaphone matching, and compound word splitting.
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMON_BIGRAMS = exports.BLOCKED_SUGGESTIONS = exports.COMMON_TYPOS = exports.FORCE_CONTRACTION_CHECK = exports.CONTRACTION_MAP = void 0;
exports.getVowelMutations = getVowelMutations;
exports.getTranspositions = getTranspositions;
exports.metaphone = metaphone;
exports.splitCompoundWord = splitCompoundWord;
exports.levenshteinDistance = levenshteinDistance;
exports.matchCase = matchCase;
exports.CONTRACTION_MAP = {
    // Standard informal forms typed without apostrophes
    dont: "don't", cant: "can't", wont: "won't", isnt: "isn't",
    arent: "aren't", wasnt: "wasn't", werent: "weren't",
    havent: "haven't", hasnt: "hasn't", hadnt: "hadn't",
    wouldnt: "wouldn't", couldnt: "couldn't", shouldnt: "shouldn't",
    doesnt: "doesn't", didnt: "didn't", theyre: "they're",
    youre: "you're", weve: "we've", thats: "that's", whats: "what's",
    theres: "there's", heres: "here's", wheres: "where's", lets: "let's",
    im: "I'm", ive: "I've", ill: "I'll", id: "I'd",
    // Common contraction typos with vowel/consonant slips
    dant: "don't",
    dosnt: "doesn't",
    didint: "didn't",
    shoudnt: "shouldn't",
    coudnt: "couldn't",
    woudnt: "wouldn't",
    isnd: "isn't",
    aint: "ain't",
    arentt: "aren't",
    didntt: "didn't",
    wontt: "won't",
    cantt: "can't"
};
exports.FORCE_CONTRACTION_CHECK = new Set([
    'cant', 'wont', 'dont', 'isnt', 'arent', 'wasnt', 'werent',
    'havent', 'hasnt', 'hadnt', 'wouldnt', 'couldnt', 'shouldnt',
    'doesnt', 'didnt', 'theyre', 'youre', 'weve', 'thats', 'whats',
    'heres', 'theres', 'wheres', 'lets', 'dosnt', 'didint', 'shoudnt',
    'coudnt', 'woudnt', 'dant', 'im', 'ive', 'ill', 'id'
]);
exports.COMMON_TYPOS = {
    // Contraction & Vowel slips
    dant: ["don't", "can't"],
    dont: ["don't"],
    cant: ["can't"],
    wont: ["won't"],
    didnt: ["didn't"],
    didint: ["didn't"],
    dosnt: ["doesn't"],
    doesnt: ["doesn't"],
    isnt: ["isn't"],
    arent: ["aren't"],
    wasnt: ["wasn't"],
    werent: ["weren't"],
    havent: ["haven't"],
    hasnt: ["hasn't"],
    hadnt: ["hadn't"],
    woudnt: ["wouldn't"],
    coudnt: ["couldn't"],
    shoudnt: ["shouldn't"],
    wouldnt: ["wouldn't"],
    couldnt: ["couldn't"],
    shouldnt: ["shouldn't"],
    theyre: ["they're"],
    youre: ["you're"],
    weve: ["we've"],
    thats: ["that's"],
    whats: ["what's"],
    theres: ["there's"],
    heres: ["here's"],
    wheres: ["where's"],
    lets: ["let's"],
    im: ["I'm"],
    ive: ["I've"],
    ill: ["I'll"],
    id: ["I'd"],
    // Frequent human typing & phonetic errors
    spller: ["speller"],
    enuf: ["enough"],
    fite: ["fight"],
    nite: ["night"],
    lite: ["light"],
    plese: ["please"],
    pley: ["play"],
    tannes: ["tennis"],
    fone: ["phone"],
    fisics: ["physics"],
    sychology: ["psychology"],
    shud: ["should"],
    wud: ["would"],
    coud: ["could"],
    cud: ["could"],
    gud: ["good"],
    plz: ["please"],
    pls: ["please"],
    thx: ["thanks"],
    thnx: ["thanks"],
    thru: ["through"],
    alright: ["all right"],
    bcoz: ["because"],
    cuz: ["because"],
    coz: ["because"],
    bcuz: ["because"],
    bcz: ["because"],
    abt: ["about"],
    msg: ["message"],
    becuse: ["because"],
    becasue: ["because"],
    becouse: ["because"],
    wround: ["wrong"],
    recommand: ["recommend"],
    reccomend: ["recommend"],
    recomended: ["recommended"],
    recomending: ["recommending"],
    teh: ["the"],
    taht: ["that"],
    waht: ["what"],
    wiht: ["with"],
    thier: ["their"],
    wierd: ["weird"],
    recieve: ["receive"],
    recieved: ["received"],
    recieving: ["receiving"],
    seperate: ["separate"],
    seperated: ["separated"],
    definately: ["definitely"],
    definatly: ["definitely"],
    occurance: ["occurrence"],
    occurances: ["occurrences"],
    untill: ["until"],
    truely: ["truly"],
    bcak: ["back"],
    soo: ["so"],
    os: ["is", "so", "to", "of"],
    acheive: ["achieve"],
    acheived: ["achieved"],
    freind: ["friend"],
    freinds: ["friends"],
    calender: ["calendar"],
    collegue: ["colleague"],
    dissappear: ["disappear"],
    embarass: ["embarrass"],
    goverment: ["government"],
    neccessary: ["necessary"],
    necessery: ["necessary"],
    noticable: ["noticeable"],
    persue: ["pursue"],
    priviledge: ["privilege"],
    publically: ["publicly"],
    tommorrow: ["tomorrow"],
    tomorow: ["tomorrow"],
    whitch: ["which"],
    wether: ["whether"],
    allways: ["always"],
    alot: ["a lot"],
    aswell: ["as well"],
    atleast: ["at least"],
    infront: ["in front"],
    eachother: ["each other"],
    noone: ["no one"],
    thankyou: ["thank you"],
    nevermind: ["never mind"],
    everytime: ["every time"],
    beleive: ["believe"],
    beleived: ["believed"],
    catagory: ["category"],
    catagories: ["categories"],
    enviroment: ["environment"],
    foreward: ["forward"],
    fourty: ["forty"],
    gaurantee: ["guarantee"],
    guarentee: ["guarantee"],
    harrass: ["harass"],
    hiearchy: ["hierarchy"],
    interupt: ["interrupt"],
    knowlege: ["knowledge"],
    maintainance: ["maintenance"],
    millenium: ["millennium"],
    occurred: ["occurred"],
    occured: ["occurred"],
    posession: ["possession"],
    questionaire: ["questionnaire"],
    relevent: ["relevant"],
    relavent: ["relevant"],
    resistence: ["resistance"],
    suprise: ["surprise"],
    tendancy: ["tendency"],
    threshhold: ["threshold"],
    twelth: ["twelfth"],
    wich: ["which"],
    writting: ["writing"],
    yeild: ["yield"],
    pronounciation: ["pronunciation"],
    accross: ["across"],
    basicly: ["basically"],
    comming: ["coming"],
    disapoint: ["disappoint"],
    existance: ["existence"],
    foward: ["forward"],
    greatful: ["grateful"],
    happend: ["happened"],
    independant: ["independent"],
    judgement: ["judgment", "judgement"],
    liason: ["liaison"],
    mispell: ["misspell"],
    mispelled: ["misspelled"],
    piece: ["piece"],
    possession: ["possession"],
    rythm: ["rhythm"],
    suceed: ["succeed"],
    tomatos: ["tomatoes"],
    unforseen: ["unforeseen"],
    usally: ["usually"],
    vaccum: ["vacuum"],
    vehical: ["vehicle"],
    wonted: ["wanted", "won't"],
    woud: ["would"],
    shoud: ["should"],
    speller: ["spell checker", "speller"],
    promt: ["prompt"],
    promts: ["prompts"],
    cheker: ["checker"],
    asistant: ["assistant"]
};
const VOWELS = ['a', 'e', 'i', 'o', 'u'];
/**
 * Generates single-character vowel mutations for a word.
 * E.g., 'dant' -> ['dent', 'dint', 'dont', 'dunt']
 */
function getVowelMutations(word) {
    const results = [];
    const lower = word.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
        if (VOWELS.includes(lower[i])) {
            for (const v of VOWELS) {
                if (v !== lower[i]) {
                    const candidate = lower.slice(0, i) + v + lower.slice(i + 1);
                    results.push(candidate);
                    if (exports.CONTRACTION_MAP[candidate]) {
                        results.push(exports.CONTRACTION_MAP[candidate]);
                    }
                }
            }
        }
    }
    return results;
}
/**
 * Generates adjacent character transpositions.
 * E.g., 'teh' -> ['the'], 'taht' -> ['that']
 */
function getTranspositions(word) {
    const results = [];
    const lower = word.toLowerCase();
    for (let i = 0; i < lower.length - 1; i++) {
        if (lower[i] !== lower[i + 1]) {
            const swapped = lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2);
            results.push(swapped);
            if (exports.CONTRACTION_MAP[swapped]) {
                results.push(exports.CONTRACTION_MAP[swapped]);
            }
        }
    }
    return results;
}
/**
 * Metaphone phonetic key generator.
 * Encodes English words into phonetic representations so 'spller' -> 'speller', 'enuf' -> 'enough'.
 */
function metaphone(word) {
    if (!word)
        return '';
    let str = word.toLowerCase();
    // Initial silent letters
    if (str.startsWith('kn') || str.startsWith('gn') || str.startsWith('pn') || str.startsWith('ae') || str.startsWith('wr')) {
        str = str.slice(1);
    }
    if (str.startsWith('ps')) {
        str = 's' + str.slice(2);
    }
    if (str.startsWith('x')) {
        str = 's' + str.slice(1);
    }
    if (str.startsWith('wh')) {
        str = 'w' + str.slice(2);
    }
    if (str.endsWith('mb')) {
        str = str.slice(0, -1);
    }
    let code = '';
    const len = str.length;
    for (let i = 0; i < len; i++) {
        const c = str[i];
        const prev = i > 0 ? str[i - 1] : '';
        const next = i < len - 1 ? str[i + 1] : '';
        const next2 = i < len - 2 ? str[i + 2] : '';
        if (c === prev && c !== 'c') {
            continue;
        }
        if (i === 0 && 'aeiou'.includes(c)) {
            code += 'A';
            continue;
        }
        if ('aeiou'.includes(c)) {
            continue;
        }
        switch (c) {
            case 'b':
                code += 'B';
                break;
            case 'c':
                if (next === 'h') {
                    code += 'X';
                    i++;
                }
                else if (next === 'i' || next === 'e' || next === 'y') {
                    code += 'S';
                }
                else {
                    code += 'K';
                }
                break;
            case 'd':
                if (next === 'g' && (next2 === 'e' || next2 === 'i' || next2 === 'y')) {
                    code += 'J';
                    i++;
                }
                else {
                    code += 'T';
                }
                break;
            case 'f':
                code += 'F';
                break;
            case 'g':
                if (next === 'h') {
                    if (next2 === 't') {
                        i++; // gh before t is silent (night -> NT, fight -> FT)
                        break;
                    }
                    if (i === len - 2) {
                        code += 'F'; // enough -> ANF
                    }
                    i++;
                }
                else if (next === 'i' || next === 'e' || next === 'y') {
                    code += 'J';
                }
                else {
                    code += 'K';
                }
                break;
            case 'h':
                if ('aeiou'.includes(next) && !'csptg'.includes(prev)) {
                    code += 'H';
                }
                break;
            case 'j':
                code += 'J';
                break;
            case 'k':
                if (prev !== 'c')
                    code += 'K';
                break;
            case 'l':
                code += 'L';
                break;
            case 'm':
                code += 'M';
                break;
            case 'n':
                code += 'N';
                break;
            case 'p':
                if (next === 'h') {
                    code += 'F';
                    i++;
                }
                else {
                    code += 'P';
                }
                break;
            case 'q':
                code += 'K';
                break;
            case 'r':
                code += 'R';
                break;
            case 's':
                if (next === 'h') {
                    code += 'X';
                    i++;
                }
                else {
                    code += 'S';
                }
                break;
            case 't':
                if (next === 'h') {
                    code += '0';
                    i++;
                }
                else if (next === 'i' && (next2 === 'o' || next2 === 'a')) {
                    code += 'X';
                }
                else {
                    code += 'T';
                }
                break;
            case 'v':
                code += 'F';
                break;
            case 'w':
            case 'y':
                if ('aeiou'.includes(next)) {
                    code += c.toUpperCase();
                }
                break;
            case 'x':
                code += 'KS';
                break;
            case 'z':
                code += 'S';
                break;
        }
    }
    return code;
}
/**
 * Splits glued compound words (e.g., 'infront' -> 'in front', 'aswell' -> 'as well')
 */
function splitCompoundWord(word, isWordValid) {
    const lower = word.toLowerCase();
    if (lower.length < 4)
        return null;
    if (lower === 'alot')
        return 'a lot';
    for (let i = 2; i <= lower.length - 2; i++) {
        const left = lower.slice(0, i);
        const right = lower.slice(i);
        if ((isWordValid(left) || left === 'a') && isWordValid(right)) {
            return left + ' ' + right;
        }
    }
    return null;
}
/**
 * Fast Levenshtein distance between two strings
 */
function levenshteinDistance(a, b) {
    if (a === b) {
        return 0;
    }
    if (a.length === 0) {
        return b.length;
    }
    if (b.length === 0) {
        return a.length;
    }
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j] + 1 // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}
exports.BLOCKED_SUGGESTIONS = new Set([
    'cunt', 'cunts', 'dick', 'dicks', 'pussy', 'pussies', 'bitch', 'bitches',
    'shit', 'shits', 'fuck', 'fucks', 'fucking', 'fucked', 'asshole', 'assholes',
    'nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots', 'slut', 'sluts', 'whore', 'whores'
]);
exports.COMMON_BIGRAMS = new Set([
    'play tennis', 'play football', 'play soccer', 'play basketball', 'play sports',
    'play games', 'play music', 'play guitar', 'play piano', 'play cards',
    "i don't", "you don't", "we don't", "they don't", "he doesn't", "she doesn't", "it doesn't",
    "don't play", "can't play", "won't play", "didn't play",
    "don't know", "don't think", "don't want", "don't have", "don't need", "don't like",
    "can't do", "can't see", "can't find", "can't wait", "can't believe",
    "thank you", "a lot", "in front", "as well", "at least", "each other",
    "how to", "what is", "where is", "why is", "when to",
    "that is", "this is", "there is", "there are", "that's wrong", "that's right"
]);
/**
 * Formats a replacement candidate to match the original casing:
 * E.g., Dant -> Don't, DANT -> DON'T, dant -> don't
 */
function matchCase(original, replacement) {
    if (!original || !replacement) {
        return replacement;
    }
    // ALL CAPS: e.g. "DANT" -> "DON'T"
    if (original === original.toUpperCase() && original !== original.toLowerCase()) {
        return replacement.toUpperCase();
    }
    // Title Case: e.g. "Dant" -> "Don't"
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    // Lowercase or mixed: preserve replacement lowercase
    return replacement;
}
//# sourceMappingURL=typoRules.js.map
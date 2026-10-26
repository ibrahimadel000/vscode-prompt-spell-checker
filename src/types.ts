// 🧩 Shared type definitions 🧩
// Ported from spell_assistant/models.py and config.py

export interface Misspelling {
    word: string;
    start: number;
    end: number;
    suggestions: string[];
    contextBefore: string;
    contextAfter: string;
}

export interface ProofreadChange {
    original: string;
    fixed: string;
    reason?: string;
}

export interface ProofreadResult {
    originalText: string;
    fixedText: string;
    changes: ProofreadChange[];
    providerUsed: string;
    durationMs: number;
}

export interface AIProofreaderConfig {
    enabled: boolean;
    provider: 'auto' | 'vscode-lm' | 'languagetool' | 'custom-llm' | 'local-fallback';
    customEndpoint?: string;
    customApiKey?: string;
    customModel?: string;
    languageToolEndpoint?: string;
}

export type ChatTarget = 'auto' | 'codex' | 'antigravity' | 'copilot';

export interface ExtensionConfig {
    enabled: boolean;
    checkOnType: boolean;
    debounceMs: number;
    extraKnownWords: string[];
    targetLanguages: string[];
    ignoreCamelCase: boolean;
    ignoreCodeBlocks: boolean;
    ignoreUrls: boolean;
    ignoreFilePaths: boolean;
    ignoreAllCaps: boolean;
    maxSuggestions: number;
    diagnosticSeverity?: 'error' | 'warning' | 'information';
    aiProofreader?: AIProofreaderConfig;
    targetChat?: ChatTarget;
}

export const DEFAULT_DEV_WORDS: string[] = [
    "ai", "api", "chatgpt", "codex", "electron", "github",
    "javascript", "json", "monaco", "npm", "openai",
    "powershell", "python", "typescript", "uiautomation", "vscode",
    "args", "kwargs", "config", "utils", "repo", "init", "dev", "devops",
    "linux", "localhost", "url", "html", "css", "auth", "sudo", "gui",
    "tcp", "udp", "dns", "sql", "backend", "frontend", "ui", "db",
    "yaml", "toml", "dll", "exe", "venv", "src", "lib", "pwd", "cwd",
    "cmd", "os", "env", "dotenv", "docker", "kubernetes", "nginx",
    "apache", "ssl", "tls", "ssh", "rsa", "aes", "md5", "sha", "utf",
    "ascii", "regex", "sdk", "cli", "uuid", "guid", "bool", "int", "str",
    "dict", "dicts", "tuples", "tuple", "func", "req", "params", "res",
    "postgres", "sqlite", "mysql", "mongo", "redis", "aws", "gcp", "azure",
    "ip", "http", "https", "wss", "ws", "graphql", "grpc", "rest", "restful",
    "apis", "rpc", "ux", "oauth", "jwt", "cors", "xss", "csrf", "nosql",
    "xml", "csv", "md", "svg", "png", "jpg", "jpeg", "gif", "mp3", "mp4",
    "wav", "flac", "avi", "mkv", "webm", "rar", "zip", "tar", "gz", "bz",
    "xz", "7z", "pkg", "deb", "rpm", "apk", "msi", "dmg", "iso", "img",
    "bin", "cue", "raw", "vmdk", "vdi", "vhd", "qcow", "ova", "ovf",
    "boolean", "integer", "string", "character", "char", "float", "double",
    "const", "let", "var", "null", "undefined", "true", "false", "async", "await", "return", "def", "fn",
    "copilot", "antigravity", "cursor", "claude", "gemini", "llama", "llm", "llms"
];
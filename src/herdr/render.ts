import type { AgentState } from "../types";

export const STATE_COLORS: Record<AgentState, string> = {
    blocked: "#e5484d",
    working: "#f5a623",
    done: "#4c7dff",
    idle: "#46a758",
    unknown: "#6e7681",
};

const EMPTY_COLOR = "#3a3f45";

/** Brand-inspired accent per herdr agent kind; unknown kinds get a neutral gray. */
export const KIND_COLORS: Record<string, string> = {
    pi: "#d4a24e",
    claude: "#d97757",
    codex: "#10a37f",
    gemini: "#4285f4",
    cursor: "#00b4d8",
    devin: "#8b5cf6",
    agy: "#f25f8a",
    cline: "#3b82f6",
    omp: "#ef4444",
    mastracode: "#a16207",
    opencode: "#f97316",
    copilot: "#57606a",
    kimi: "#06b6d4",
    kiro: "#f59e0b",
    droid: "#22c55e",
    amp: "#ec4899",
    grok: "#374151",
    hermes: "#e11d48",
    kilo: "#7c3aed",
    qodercli: "#0ea5e9",
    qwen: "#6366f1",
    letta: "#f43f5e",
    maki: "#84cc16",
    muse: "#a855f7",
};

/** Two-letter monogram per kind (pi gets the π glyph). */
export const KIND_GLYPHS: Record<string, string> = {
    pi: "π",
    claude: "CL",
    codex: "CX",
    gemini: "GE",
    cursor: "CU",
    devin: "DV",
    agy: "AG",
    cline: "CL",
    omp: "OM",
    mastracode: "MC",
    opencode: "OC",
    copilot: "CP",
    kimi: "KI",
    kiro: "KR",
    droid: "DR",
    amp: "AM",
    grok: "GR",
    hermes: "HE",
    kilo: "KE",
    qodercli: "QC",
    qwen: "QW",
    letta: "LE",
    maki: "MA",
    muse: "MU",
};

export function kindColor(kind: string | null | undefined): string {
    return (kind && KIND_COLORS[kind.toLowerCase()]) || "#6e7681";
}

export function kindGlyph(kind: string | null | undefined): string {
    if (!kind) return "?";
    const lower = kind.toLowerCase();
    return KIND_GLYPHS[lower] ?? lower.slice(0, 2).toUpperCase();
}

function escapeXml(text: string): string {
    return text.replace(/[<>&'"]/g, (c) =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string,
    );
}

export function keySvg(options: { bg: string; headline?: string; sub?: string }): string {
    const { bg, headline, sub } = options;
    const headlineText = headline
        ? `<text x="36" y="${sub ? 33 : 41}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="19" fill="#ffffff" text-anchor="middle">${escapeXml(headline)}</text>`
        : "";
    const subText = sub
        ? `<text x="36" y="52" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#e6e9ec" text-anchor="middle">${escapeXml(sub)}</text>`
        : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" rx="12" fill="${bg}"/>${headlineText}${subText}</svg>`;
}

/**
 * Agent key: state-colored background, the agent kind's monogram tile in the
 * middle, the agent name under it.
 */
export function agentKeySvg(options: { bg: string; kind: string | null | undefined; sub?: string }): string {
    const color = kindColor(options.kind);
    const glyph = kindGlyph(options.kind);
    const mono = escapeXml(glyph);
    const fontSize = mono.length > 1 ? 16 : 22;
    const subText = options.sub
        ? `<text x="36" y="63" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#ffffff" text-anchor="middle">${escapeXml(options.sub)}</text>`
        : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="12" fill="${options.bg}"/>
  <rect x="17" y="8" width="38" height="38" rx="9" fill="#ffffff" opacity="0.94"/>
  <text x="36" y="${mono === "π" ? 36 : 34}" font-family="Consolas, monospace" font-weight="700" font-size="${fontSize}" fill="${color}" text-anchor="middle" dominant-baseline="middle">${mono}</text>
  ${subText}
</svg>`;
}

/** Worst-first ordering so one blocked agent turns the fleet key red. */
export function worstState(counts: Record<AgentState, number>, total: number): { bg: string; label: string } {
    if (total === 0) return { bg: EMPTY_COLOR, label: "empty" };
    for (const state of ["blocked", "working", "done", "idle", "unknown"] as AgentState[]) {
        if (counts[state] > 0) return { bg: STATE_COLORS[state], label: state };
    }
    return { bg: EMPTY_COLOR, label: "empty" };
}

export function toDataUrl(svg: string): string {
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

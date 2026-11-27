import type { AgentState, DeckViewMode } from "../types";
import { AGENT_ICONS } from "./agent-icons";

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
    zcode: "#2563eb",
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
    zcode: "ZC",
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

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function splitTwoLines(text: string, maxPerLine = 10): [string, string | null] {
    if (text.length <= maxPerLine) return [text, null];
    // Prefer splitting on separator (_, -, /, space)
    const sepIdx = text.slice(0, maxPerLine + 1).search(/[_\-\s/][^_\-\s/]*$/);
    if (sepIdx >= 3) {
        const line1 = text.slice(0, sepIdx);
        const rest = text.slice(sepIdx + 1);
        return [truncate(line1, maxPerLine), truncate(rest, maxPerLine)];
    }
    return [text.slice(0, maxPerLine), truncate(text.slice(maxPerLine), maxPerLine)];
}

function renderEmbeddedIcon(
    viewBox: string,
    inner: string,
    tile: { x: number; y: number; size: number; iconSize: number },
): string {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    const minX = Number.isFinite(parts[0]) ? parts[0] : 0;
    const minY = Number.isFinite(parts[1]) ? parts[1] : 0;
    const vbW = Number.isFinite(parts[2]) && parts[2] > 0 ? parts[2] : 24;
    const vbH = Number.isFinite(parts[3]) && parts[3] > 0 ? parts[3] : 24;
    const scale = tile.iconSize / Math.max(vbW, vbH);
    const offsetX = tile.x + (tile.size - vbW * scale) / 2 - minX * scale;
    const offsetY = tile.y + (tile.size - vbH * scale) / 2 - minY * scale;
    // Stream Deck uses Qt SVG (Tiny 1.2), which ignores nested <svg> elements; use <g transform>.
    return `<g transform="translate(${offsetX.toFixed(2)} ${offsetY.toFixed(2)}) scale(${scale.toFixed(4)})" fill="#18181b">${inner}</g>`;
}

/**
 * Agent key: state-colored background, optional remote machine tag at top,
 * official agent SVG icon (or 2-letter monogram fallback) inside a white tile,
 * and the agent name / space-tab label at bottom.
 */
export function agentKeySvg(options: {
    bg: string;
    kind: string | null | undefined;
    sub?: string;
    focused?: boolean;
    tag?: string;
}): string {
    const kindKey = options.kind?.toLowerCase() ?? "";
    const icon = kindKey ? AGENT_ICONS[kindKey] : undefined;
    const color = kindColor(options.kind);
    const glyph = kindGlyph(options.kind);
    const mono = escapeXml(glyph);

    const hasTag = Boolean(options.tag);
    const tile = hasTag
        ? { x: 19, y: 15, size: 34, iconSize: 24, rx: 8 }
        : { x: 17, y: 8, size: 38, iconSize: 26, rx: 9 };
    const fontSize = mono.length > 1 ? (hasTag ? 14 : 16) : (hasTag ? 19 : 22);
    const monoY = tile.y + tile.size / 2 + (mono === "π" ? 2 : 0);

    const iconMarkup = icon
        ? renderEmbeddedIcon(icon.viewBox, icon.inner, tile)
        : `<text x="36" y="${monoY}" font-family="Consolas, monospace" font-weight="700" font-size="${fontSize}" fill="${color}" text-anchor="middle" dominant-baseline="middle">${mono}</text>`;

    const tagMarkup = options.tag
        ? `<rect x="11" y="2" width="50" height="11" rx="4" fill="#0d1117" opacity="0.82"/>
  <text x="36" y="10" font-family="Consolas, monospace" font-weight="700" font-size="8" fill="#e6e9ec" text-anchor="middle">${escapeXml(truncate(options.tag, 9))}</text>`
        : "";

    const subText = options.sub
        ? `<text x="36" y="63" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="11" fill="#ffffff" text-anchor="middle">${escapeXml(truncate(options.sub, 12))}</text>`
        : "";

    const focusRing = options.focused
        ? `<rect x="2" y="2" width="68" height="68" rx="10" fill="none" stroke="#ffffff" stroke-width="3"/>`
        : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="12" fill="${options.bg}"/>
  <rect x="${tile.x}" y="${tile.y}" width="${tile.size}" height="${tile.size}" rx="${tile.rx}" fill="#ffffff" opacity="0.96"/>
  ${iconMarkup}
  ${tagMarkup}
  ${subText}
  ${focusRing}
</svg>`;
}

/** Generic slot key for Machines, Windows (Workspaces), and Tabs views. */
export function slotKeySvg(options: {
    label: string;
    badge?: string;
    active?: boolean;
    accentColor?: string;
    statusDot?: AgentState;
}): string {
    const bg = options.active ? "#1f4b8f" : "#1c2128";
    const border = options.active ? "#7ee2a8" : (options.accentColor ?? "#30363d");
    const borderWidth = options.active ? 2.5 : 1.5;
    const [line1, line2] = splitTwoLines(options.label, 10);

    const badgeMarkup = options.badge
        ? `<text x="10" y="17" font-family="Consolas, monospace" font-weight="700" font-size="10" fill="#8b949e">${escapeXml(truncate(options.badge, 8))}</text>`
        : "";

    const dotMarkup =
        options.statusDot && options.statusDot !== "unknown"
            ? `<circle cx="60" cy="14" r="5" fill="${STATE_COLORS[options.statusDot]}"/>`
            : "";

    const textMarkup = line2
        ? `<text x="36" y="39" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="12" fill="#ffffff" text-anchor="middle">${escapeXml(line1)}</text>
  <text x="36" y="55" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="11" fill="#c9d1d9" text-anchor="middle">${escapeXml(line2)}</text>`
        : `<text x="36" y="45" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="13" fill="#ffffff" text-anchor="middle">${escapeXml(line1)}</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="12" fill="${bg}"/>
  <rect x="1.5" y="1.5" width="69" height="69" rx="11" fill="none" stroke="${border}" stroke-width="${borderWidth}"/>
  ${badgeMarkup}
  ${dotMarkup}
  ${textMarkup}
</svg>`;
}

/** First empty slot in Agents view: '+' button to pick or long-press spawn an agent. */
export function addAgentSlotSvg(defaultKind: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="12" fill="#16221c"/>
  <rect x="1.5" y="1.5" width="69" height="69" rx="11" fill="none" stroke="#2d6a4f" stroke-width="1.5" stroke-dasharray="4 3"/>
  <line x1="36" y1="18" x2="36" y2="44" stroke="#7ee2a8" stroke-width="4" stroke-linecap="round"/>
  <line x1="23" y1="31" x2="49" y2="31" stroke="#7ee2a8" stroke-width="4" stroke-linecap="round"/>
  <text x="36" y="61" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="10" fill="#a7f3d0" text-anchor="middle">${escapeXml(truncate(defaultKind, 10))}</text>
</svg>`;
}

/** Subtle dark tile with a dashed border (matching '+' without text) for empty slots. */
export function emptySlotSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="12" fill="#12161b"/>
  <rect x="1.5" y="1.5" width="69" height="69" rx="11" fill="none" stroke="#30363d" stroke-width="1.5" stroke-dasharray="4 3"/>
</svg>`;
}

export type NavDeckMode = Exclude<DeckViewMode, "pick-agent">;

const MODE_TITLES: Record<NavDeckMode, string> = {
    agents: "Agents",
    machines: "Machines",
    windows: "Windows",
    tabs: "Tabs",
};

/** Bottom-row mode switcher button (two-row layout: title + live detail). */
export function modeButtonSvg(options: { mode: NavDeckMode; active: boolean; sub?: string }): string {
    const title = MODE_TITLES[options.mode];
    const bg = options.active ? "#1c4b35" : "#161b22";
    const border = options.active ? "#7ee2a8" : "#30363d";
    const subColor = options.active ? "#c6f6d5" : "#8b949e";
    const activeBar = options.active ? `<rect x="18" y="4" width="36" height="3" rx="1.5" fill="#7ee2a8"/>` : "";
    const titleY = options.sub ? 30 : 41;
    const subText = options.sub
        ? `<text x="36" y="52" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="12" fill="${subColor}" text-anchor="middle">${escapeXml(truncate(options.sub, 11))}</text>`
        : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="12" fill="${bg}"/>
  <rect x="1.5" y="1.5" width="69" height="69" rx="11" fill="none" stroke="${border}" stroke-width="${options.active ? 2 : 1.5}"/>
  ${activeBar}
  <text x="36" y="${titleY}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="14" fill="#ffffff" text-anchor="middle">${title}</text>
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

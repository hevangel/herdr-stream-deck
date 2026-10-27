import type { AgentState } from "../types";

export const STATE_COLORS: Record<AgentState, string> = {
    blocked: "#e5484d",
    working: "#f5a623",
    done: "#4c7dff",
    idle: "#46a758",
    unknown: "#6e7681",
};

const EMPTY_COLOR = "#3a3f45";

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

function escapeXml(text: string): string {
    return text.replace(/[<>&'"]/g, (c) =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string,
    );
}

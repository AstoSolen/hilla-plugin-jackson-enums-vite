import { existsSync, readFileSync } from "node:fs";

export type EnumMappings = Readonly<Record<string, Readonly<Record<string, string>>>>;

export function loadSidecar(path: string): EnumMappings | null {
    if (!existsSync(path)) return null;

    let raw: string;
    try {
        raw = readFileSync(path, "utf-8");
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!isValidMappings(parsed)) return null;
    return parsed;
}

function isValidMappings(value: unknown): value is EnumMappings {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    for (const inner of Object.values(value as Record<string, unknown>)) {
        if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return false;
        for (const v of Object.values(inner as Record<string, unknown>)) {
            if (typeof v !== "string") return false;
        }
    }
    return true;
}

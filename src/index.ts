import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

import { loadSidecar, type EnumMappings } from "./sidecar.js";

export interface ViteHillaJacksonEnumsOptions {
    /**
     * Path to the sidecar JSON file. Can be absolute or relative.
     * If relative, resolved against several candidate roots (Vite root, its parents, process.cwd()).
     * Defaults to "build/hilla-jackson-enum-mappings.json".
     */
    sidecarPath?: string;

    /**
     * Predicate used to decide whether a given module id should be considered for rewriting.
     * Default matches any `.ts` file whose path contains `/frontend/generated/`.
     */
    isGenerated?: (id: string) => boolean;

    /**
     * Maps a module id to the fully-qualified Java type name used as the sidecar key.
     * Default extracts the path segment after `/frontend/generated/` and replaces `/` with `.`.
     */
    fileIdToFqn?: (id: string) => string;
}

const DEFAULT_SIDECAR = "build/hilla-jackson-enum-mappings.json";

export default hillaJacksonEnums;

export function hillaJacksonEnums(options: ViteHillaJacksonEnumsOptions = {}): Plugin {
    const sidecarRelative = options.sidecarPath ?? DEFAULT_SIDECAR;
    const isGenerated = options.isGenerated ?? defaultIsGenerated;
    const fileIdToFqn = options.fileIdToFqn ?? defaultFileIdToFqn;

    let sidecarAbs = "";
    let mappings: EnumMappings | null = null;

    return {
        name: "hilla-jackson-enums",
        enforce: "pre",
        configResolved(config) {
            sidecarAbs = resolveSidecarPath(sidecarRelative, config.root);
            mappings = loadSidecar(sidecarAbs);
            if (mappings === null) {
                config.logger.warn(
                    `[hilla-jackson-enums] sidecar not found at ${sidecarAbs} — generated enum values will not be rewritten`,
                );
            }
        },
        handleHotUpdate(ctx) {
            if (ctx.file === sidecarAbs) {
                mappings = loadSidecar(sidecarAbs);
                return [...ctx.modules];
            }
            return undefined;
        },
        transform(code, id) {
            if (mappings === null) return null;
            if (!isGenerated(id)) return null;
            const fqn = fileIdToFqn(id);
            const mapping = mappings[fqn];
            if (!mapping) return null;
            const rewritten = rewriteEnumMembersString(code, mapping);
            return rewritten === null ? null : { code: rewritten, map: null };
        },
    };
}

function resolveSidecarPath(sidecarPath: string, viteRoot: string): string {
    if (isAbsolute(sidecarPath)) return sidecarPath;
    const candidates = [
        // Vaadin sets vite root to src/main/frontend; sidecar is at <project-root>/build/...
        resolve(viteRoot, "../../..", sidecarPath),
        resolve(viteRoot, sidecarPath),
        resolve(process.cwd(), sidecarPath),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

function isAbsolute(p: string): boolean {
    return /^([a-zA-Z]:)?[\\/]/.test(p);
}

function defaultIsGenerated(id: string): boolean {
    if (!id.endsWith(".ts")) return false;
    return id.includes("/frontend/generated/") || id.includes("\\frontend\\generated\\");
}

function defaultFileIdToFqn(id: string): string {
    const normalized = id.replace(/\\/g, "/").split("?")[0]!;
    const marker = "/frontend/generated/";
    const idx = normalized.indexOf(marker);
    if (idx < 0) return "";
    const sub = normalized.slice(idx + marker.length);
    const noExt = sub.endsWith(".ts") ? sub.slice(0, -3) : sub;
    return noExt.replace(/\//g, ".");
}

function rewriteEnumMembersString(code: string, mapping: Readonly<Record<string, string>>): string | null {
    let changed = false;
    const result = code.replace(
        /^(\s*)([A-Z_][A-Z_0-9]*)\s*=\s*"\2"\s*(,?)(\s*)$/gm,
        (match, indent, name, comma, trail) => {
            const wire = mapping[name];
            if (wire === undefined) return match;
            changed = true;
            return `${indent}${name} = "${wire}"${comma}${trail}`;
        },
    );
    return changed ? result : null;
}

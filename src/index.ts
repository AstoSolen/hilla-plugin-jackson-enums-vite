import Plugin from "@vaadin/hilla-generator-core/Plugin.js";
import type { SharedStorage } from "@vaadin/hilla-generator-core/SharedStorage.js";
import { resolve } from "node:path";

import { loadSidecar } from "./sidecar.js";
import { rewriteEnumMembers } from "./rewriter.js";

const DEFAULT_SIDECAR_PATH = "build/hilla-jackson-enum-mappings.json";
const SIDECAR_PATH_ENV = "HILLA_JACKSON_ENUM_MAPPINGS";

export default class JacksonEnumsPlugin extends Plugin {
    override get path(): string {
        return import.meta.url;
    }

    override async execute(storage: SharedStorage): Promise<void> {
        const sidecarPath = resolveSidecarPath();
        const mappings = loadSidecar(sidecarPath);

        if (mappings === null) {
            this.logger.warn(
                `[hilla-plugin-jackson-enums] Sidecar mappings not found or invalid at ${sidecarPath} — skipping enum rewrite.`,
            );
            return;
        }

        for (let i = 0; i < storage.sources.length; i++) {
            const source = storage.sources[i];
            if (source === undefined) continue;

            const fqn = filePathToFqn(source.fileName);
            const mapping = mappings[fqn];
            if (mapping === undefined) continue;

            const { source: rewritten, changed } = rewriteEnumMembers(source, mapping);
            if (changed) {
                storage.sources[i] = rewritten;
                this.logger.debug(`[hilla-plugin-jackson-enums] Rewrote enum members in ${fqn}`);
            }
        }
    }
}

function resolveSidecarPath(): string {
    const fromEnv = process.env[SIDECAR_PATH_ENV];
    if (fromEnv && fromEnv.length > 0) return resolve(fromEnv);
    return resolve(process.cwd(), DEFAULT_SIDECAR_PATH);
}

function filePathToFqn(fileName: string): string {
    const normalized = fileName.replace(/\\/g, "/");
    const withoutExt = normalized.endsWith(".ts") ? normalized.slice(0, -3) : normalized;
    const trimmed = withoutExt.replace(/^\/+/, "");
    return trimmed.replace(/\//g, ".");
}

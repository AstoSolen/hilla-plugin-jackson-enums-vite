#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import ts from "typescript";

import { loadSidecar, type EnumMappings } from "./sidecar.js";
import { rewriteEnumMembers } from "./rewriter.js";

function usage(): never {
    console.error("Usage: hilla-plugin-jackson-enums <sidecar.json> <generated-ts-dir>");
    console.error("  Rewrites TypeScript enum members to match @JsonProperty wire values from the sidecar.");
    process.exit(2);
}

function main(): void {
    const args = process.argv.slice(2);
    if (args.length !== 2) usage();

    const sidecarPath = resolve(args[0]!);
    const generatedDir = resolve(args[1]!);

    const mappings = loadSidecar(sidecarPath);
    if (mappings === null) {
        console.warn(`[hilla-plugin-jackson-enums] Sidecar missing or invalid: ${sidecarPath} — nothing to do.`);
        return;
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    let rewrittenCount = 0;

    for (const file of walk(generatedDir)) {
        if (!file.endsWith(".ts")) continue;

        const fqn = pathToFqn(generatedDir, file);
        const mapping = mappings[fqn];
        if (mapping === undefined) continue;

        const source = ts.createSourceFile(file, readFileSync(file, "utf-8"), ts.ScriptTarget.ES2022, false);
        const { source: rewritten, changed } = rewriteEnumMembers(source, mapping);
        if (!changed) continue;

        writeFileSync(file, printer.printFile(rewritten), "utf-8");
        rewrittenCount++;
        console.log(`[hilla-plugin-jackson-enums] Rewrote ${fqn}`);
    }

    console.log(`[hilla-plugin-jackson-enums] Done. Rewrote ${rewrittenCount} file(s).`);
}

function* walk(dir: string): Generator<string> {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = join(dir, entry);
        let stats;
        try {
            stats = statSync(full);
        } catch {
            continue;
        }
        if (stats.isDirectory()) {
            yield* walk(full);
        } else if (stats.isFile()) {
            yield full;
        }
    }
}

function pathToFqn(generatedRoot: string, filePath: string): string {
    const rel = relative(generatedRoot, filePath);
    const noExt = rel.endsWith(".ts") ? rel.slice(0, -3) : rel;
    return noExt.split(sep).join(".");
}

main();

# hilla-plugin-jackson-enums

A Vaadin Hilla generator extension for keeping generated TypeScript enum values aligned with the values used by Jackson at runtime.

Hilla can derive enum values from Java constant names, while Jackson may serialize those constants under different wire values, for example through `@JsonProperty`. This package applies an explicit mapping after, or during, generation so frontend code can use API enum values directly.

## What It Does

Given a Java enum whose runtime JSON values differ from its constant names:

```java
public enum ExampleType {
    @JsonProperty("primary") PRIMARY,
    @JsonProperty("secondary") SECONDARY
}
```

Hilla may generate:

```ts
enum ExampleType {
    PRIMARY = "PRIMARY",
    SECONDARY = "SECONDARY",
}
```

With a mapping file, this package rewrites the generated enum to:

```ts
enum ExampleType {
    PRIMARY = "primary",
    SECONDARY = "secondary",
}
```

## Core Idea

The package does not inspect Java source code. It consumes a sidecar JSON file that describes how Java enum constants map to their JSON wire values:

```json
{
  "com.example.ExampleType": {
    "PRIMARY": "primary",
    "SECONDARY": "secondary"
  }
}
```

The sidecar can be produced by any build process that can inspect the compiled application model, source metadata, generated OpenAPI data, or another trusted source of enum serialization rules.

## Installation

```bash
npm install --save-dev hilla-plugin-jackson-enums
```

## Usage Modes

### Post-Process Generated Files

Use the CLI when Hilla generation is already handled by another tool and you only need to adjust the emitted TypeScript files:

```bash
npx hilla-plugin-jackson-enums ./build/hilla-jackson-enum-mappings.json ./src/main/frontend/generated
```

The command walks the generated TypeScript directory, matches file paths to fully qualified enum names, and rewrites enum member initializers where mappings exist. Files without mappings are left unchanged.

### Hilla Generator Plugin

Use the generator plugin when your build invokes the Hilla generator directly and can pass custom plugins:

```bash
HILLA_JACKSON_ENUM_MAPPINGS=./build/hilla-jackson-enum-mappings.json \
  npx @vaadin/hilla-generator-cli openapi.json \
    -o src/main/frontend/generated \
    -p ./node_modules/hilla-plugin-jackson-enums/dist/index.js
```

In this mode, the plugin reads mappings before generated sources are written and updates matching enum AST nodes in the generator pipeline.

### Library API

Use the rewriter directly when embedding the behavior in custom tooling:

```ts
import ts from "typescript";
import { rewriteEnumMembers } from "hilla-plugin-jackson-enums/rewriter";
import { loadSidecar } from "hilla-plugin-jackson-enums/sidecar";

const mappings = loadSidecar("./build/hilla-jackson-enum-mappings.json");
const source = ts.createSourceFile("ExampleType.ts", code, ts.ScriptTarget.ES2022, false);

const result = rewriteEnumMembers(source, mappings?.["com.example.ExampleType"] ?? {});
```

## Sidecar Format

The sidecar JSON is a nested object:

```json
{
  "fully.qualified.EnumName": {
    "JAVA_CONSTANT": "wire-value"
  }
}
```

- Top-level keys are fully qualified Java enum names.
- Inner keys are Java enum constant names.
- Inner values are the string values expected in JSON.
- Constants omitted from the sidecar are not changed.
- Missing or invalid sidecar files are treated as no-op by the plugin mode.

## Integration Notes

The only hard requirement is that sidecar keys match the generated TypeScript source names seen by the package.

For the CLI, a generated file such as:

```text
src/main/frontend/generated/com/example/ExampleType.ts
```

is matched as:

```text
com.example.ExampleType
```

Typical integrations follow this flow:

1. Generate or collect enum wire-value mappings during the backend build.
2. Write those mappings to a JSON sidecar file.
3. Run Hilla generation.
4. Run this package as either a generator plugin or a post-generation rewrite step.

## Configuration

`HILLA_JACKSON_ENUM_MAPPINGS` sets the sidecar path for generator-plugin mode. If omitted, the plugin looks for:

```text
build/hilla-jackson-enum-mappings.json
```

The CLI receives the sidecar path as its first argument and does not use this environment variable.

## License

MIT

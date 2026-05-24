# hilla-plugin-jackson-enums-vite

Vite plugin that rewrites Hilla-generated TypeScript enum values to match Jackson `@JsonProperty` wire values.

Hilla emits TypeScript enums where each member's value equals the Java constant name. When Jackson serializes those constants under different wire values via `@JsonProperty`, the frontend receives the wire value but looks up the constant name in its registry — every render keyed on that enum silently fails.

This plugin patches the enum source as Vite serves or bundles it. The wire value comes from a sidecar JSON file produced by your build.

## The mismatch

Given a Java enum where the wire form differs from the constant name:

```java
public enum SomeEnum {
    @JsonProperty("...") FIRST_CONSTANT,
    @JsonProperty("...") SECOND_CONSTANT
}
```

Hilla generates:
```ts
enum SomeEnum {
    FIRST_CONSTANT  = "FIRST_CONSTANT",
    SECOND_CONSTANT = "SECOND_CONSTANT",
}
```

This plugin makes Vite serve instead:
```ts
enum SomeEnum {
    FIRST_CONSTANT  = "<wire-value-1>",
    SECOND_CONSTANT = "<wire-value-2>",
}
```

Code that looks up the enum by its API-returned string now finds the right member.

## Why a Vite plugin specifically

In Vaadin dev mode (`frontendHotdeploy = true`), Vaadin regenerates the TypeScript files inside `src/main/frontend/generated/` at application startup. A disk-level post-processor would be overwritten. The Vite plugin transforms files as they leave Vite — after any regeneration, before the browser sees them. The same path is used during a production build (`vaadinBuildFrontend`).

## Install

```bash
npm install --save-dev hilla-plugin-jackson-enums-vite
```

## Usage

```ts
// vite.config.ts
import type { UserConfigFn } from "vite";
import { overrideVaadinConfig } from "./vite.generated";
import { hillaJacksonEnums } from "hilla-plugin-jackson-enums-vite";

const customConfig: UserConfigFn = () => ({
    plugins: [hillaJacksonEnums()],
});

export default overrideVaadinConfig(customConfig);
```

That is the entire integration. The plugin reads the sidecar JSON, finds enum files in the generated tree, and rewrites member initializers in place.

## Options

```ts
hillaJacksonEnums({
    sidecarPath: "build/my-mappings.json",          // default "build/hilla-jackson-enum-mappings.json"
    isGenerated: (id) => /custom-pattern/.test(id), // default: any .ts under /frontend/generated/
    fileIdToFqn: (id) => "...",                     // override file path → Java FQN mapping
});
```

By default the plugin searches for the sidecar at:

1. `<vite-root>/../../../build/hilla-jackson-enum-mappings.json` — matches Vaadin's layout where `config.root` is `src/main/frontend`.
2. `<vite-root>/build/hilla-jackson-enum-mappings.json` — matches standalone Vite projects.
3. `process.cwd()/build/hilla-jackson-enum-mappings.json`

The first existing path wins. A missing sidecar logs a warning; the plugin then no-ops.

The plugin reacts to changes in the sidecar via Vite HMR — if your backend rebuild rewrites it, the next request picks up the new mappings without restarting the dev server.

## Sidecar format

```json
{
  "<fully.qualified.EnumName>": {
    "<JAVA_CONSTANT_NAME>": "<wire-value>"
  }
}
```

- Top-level keys are fully qualified Java enum names.
- Inner keys are Java enum constant names.
- Inner values are the strings Jackson uses on the wire.
- Constants without an entry are left untouched.

## Producing the sidecar

The plugin only reads the sidecar — it never inspects Java sources or compiled classes itself.

The companion Gradle plugin [`io.github.lowsortwizard.hilla-jackson-enums`](https://plugins.gradle.org/plugin/io.github.lowsortwizard.hilla-jackson-enums) generates the sidecar automatically from your project's compiled classes via reflection on `@JsonProperty`. Apply it in your `build.gradle.kts`:

```kotlin
plugins {
    id("io.github.lowsortwizard.hilla-jackson-enums") version "0.1.0"
}
```

For Maven / non-Gradle setups, produce the JSON in the format above by any means you prefer (annotation processor, runtime scan, hand-written) and point the plugin at it via `sidecarPath`.

## Behavior notes

- The transformation matches enum members emitted as `<NAME> = "<NAME>"` (Hilla's default). Already-rewritten files are skipped automatically — idempotent.
- The plugin runs with `enforce: 'pre'`, ahead of Vite's TypeScript transform, so the rewritten code is what TypeScript sees.
- Member names not present in the sidecar are not touched. Files whose path does not resolve to a known FQN are not touched.

## License

MIT.

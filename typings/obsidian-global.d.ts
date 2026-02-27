import { App } from "obsidian";

declare global {
  /**
   * The global Obsidian App instance, available in the plugin runtime environment.
   * Declared as `var` so it is visible on `globalThis` (required for tests that
   * set `global.app = ...` as well as runtime code that reads `app` directly).
   * @see https://docs.obsidian.md/Reference/TypeScript+API/App
   */
  // eslint-disable-next-line no-var
  var app: App;
}

import { Plugin } from "obsidian";
import { toggleExtension } from "./editor_extension";
import { readingModeProcessor } from "./reading_mode_processor";

export default class TogglePlugin extends Plugin {
    async onload() {
        console.log("Loading Toggle Plugin V3.1 (Nested Toggles + Native)");
        this.registerEditorExtension(toggleExtension);
        this.registerMarkdownPostProcessor((el, ctx) => readingModeProcessor(el, ctx));
    }

    onunload() {
        console.log("Unloading Toggle Plugin");
    }
}
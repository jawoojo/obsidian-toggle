import { Plugin } from "obsidian";
import { toggleExtension } from "./editor_extension";

export default class TogglePlugin extends Plugin {
    async onload() {
        console.log("Loading Toggle Plugin V3.1 (Nested Toggles + Native)");
        this.registerEditorExtension(toggleExtension);
    }

    onunload() {
        console.log("Unloading Toggle Plugin");
    }
}
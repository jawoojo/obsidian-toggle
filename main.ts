import { Plugin } from "obsidian";
import { toggleExtension } from "./editor_extension";

export default class TogglePlugin extends Plugin {
    async onload() {
        console.log("Loading Toggle Plugin V3 (Native Folding)");
        this.registerEditorExtension(toggleExtension);
    }

    onunload() {
        console.log("Unloading Toggle Plugin");
    }
}
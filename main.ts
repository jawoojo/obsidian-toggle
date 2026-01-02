import { Plugin } from "obsidian";
import { toggleExtension } from "./editor_extension";
import { readingModeProcessor } from "./reading_mode_processor";

export default class TogglePlugin extends Plugin {
    async onload() {
        console.log("Loading Toggle Plugin V3.1 (Nested Toggles + Native)");
        this.registerEditorExtension(toggleExtension);
        this.registerMarkdownPostProcessor((el, ctx) => readingModeProcessor(el, ctx));

        this.addCommand({
            id: 'insert-toggle',
            name: 'Insert Toggle',
            editorCallback: (editor) => {
                const selection = editor.getSelection();

                if (selection) {
                    // Wrap existing selection
                    editor.replaceSelection(`|> \n${selection}\n<|`);
                    // Optional: Select the wrapped content? Or leave cursor at end.
                    // Let's leave cursor at end for now.
                } else {
                    // Insert empty toggle block
                    const start = "|> ";
                    const body = "\n\n";
                    const end = "<|";

                    const cursorBefore = editor.getCursor();
                    editor.replaceSelection(start + body + end);

                    // Set cursor to: Start Line, Column 3 (After "|> ")
                    // cursorBefore.line is where insertion started.
                    editor.setCursor({
                        line: cursorBefore.line,
                        ch: cursorBefore.ch + 3
                    });
                }
            }
        });
    }

    onunload() {
        console.log("Unloading Toggle Plugin");
    }
}
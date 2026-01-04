import { Plugin } from "obsidian";
import { toggleExtension } from "./editor_extension";
import { readingModeProcessor } from "./reading_mode_processor";

export default class TogglePlugin extends Plugin {
    onload() {
        this.registerEditorExtension(toggleExtension);
        this.registerMarkdownPostProcessor((el, ctx) => readingModeProcessor(el, ctx));

        this.addCommand({
            id: 'insert-toggle',
            name: 'Insert', // [Refactor] Removed 'Toggle' (Redundant)
            editorCallback: (editor) => {
                const selection = editor.getSelection();

                if (selection) {
                    // Wrap existing selection
                    editor.replaceSelection(`|> \n${selection}\n<|`);
                } else {
                    // Insert empty toggle block
                    const start = "|> ";
                    const body = "\n\n";
                    const end = "<|";

                    const cursorBefore = editor.getCursor();
                    editor.replaceSelection(start + body + end);

                    // Set cursor to: Start Line, Column 3 (After "|> ")
                    editor.setCursor({
                        line: cursorBefore.line,
                        ch: cursorBefore.ch + 3
                    });
                }
            }
        });

        this.addCommand({
            id: 'insert-code-toggle',
            name: 'Insert Code Block', // [Refactor] Removed 'Toggle' (Redundant)
            editorCallback: (editor) => {
                const selection = editor.getSelection();

                if (selection) {
                    editor.replaceSelection(`\`\`\`> \n${selection}\n\`\`\``);
                } else {
                    const start = "```> ";
                    const body = "\n\n";
                    const end = "```";

                    const cursorBefore = editor.getCursor();
                    editor.replaceSelection(start + body + end);

                    // Set cursor to: Start Line, Col 5 (After "```> ")
                    editor.setCursor({
                        line: cursorBefore.line,
                        ch: cursorBefore.ch + 5
                    });
                }
            }
        });
    }

    onunload() {
        // Unloading
    }
}
import {
    EditorView,
    Decoration,
    DecorationSet,
    WidgetType,
    ViewPlugin,
    ViewUpdate
} from "@codemirror/view";
import {
    RangeSetBuilder,
    Extension,
    EditorState,
    Text,
    StateEffect
} from "@codemirror/state";
import {
    foldService,
    foldEffect,
    unfoldEffect,
    foldedRanges
} from "@codemirror/language";

// Constants
const START_TAG = "|> ";
const END_TAG = "<|";

// [PRD 3.1.1] Widget
class ToggleWidget extends WidgetType {
    constructor(readonly isFolded: boolean, readonly foldStart: number, readonly foldEnd: number) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "toggle-widget";
        span.textContent = this.isFolded ? "▶" : "▼";

        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.isFolded) {
                view.dispatch({
                    effects: unfoldEffect.of({ from: this.foldStart, to: this.foldEnd })
                });
            } else {
                view.dispatch({
                    effects: foldEffect.of({ from: this.foldStart, to: this.foldEnd })
                });
            }
        };
        return span;
    }

    ignoreEvent(): boolean {
        return true;
    }
}

// Helper: Stack Counting for Nested Toggles
function findMatchingEndLine(doc: Text, startLineNo: number): number {
    let stack = 1;
    for (let i = startLineNo + 1; i <= doc.lines; i++) {
        const lineText = doc.line(i).text;
        if (lineText.startsWith(START_TAG)) {
            stack++;
        } else if (lineText.startsWith(END_TAG)) {
            stack--;
            if (stack === 0) {
                return i;
            }
        }
    }
    return -1;
}

// 1. Fold Service (Defines what can be folded)
const notionFoldService = foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
    const line = state.doc.lineAt(lineStart);
    if (line.text.startsWith(START_TAG)) {
        const endLineNo = findMatchingEndLine(state.doc, line.number);
        if (endLineNo !== -1) {
            const nextLine = state.doc.line(endLineNo);
            // Returns the range that Obsidian will see as "foldable"
            return { from: line.to, to: nextLine.to };
        }
    }
    return null;
});

// 2. ViewPlugin (Renders the widget replacing '|> ')
const toggleWidgetPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            // Rebuild if doc changes or FOLD state changes
            if (update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some((e: StateEffect<any>) => e.is(foldEffect) || e.is(unfoldEffect)))) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            const doc = view.state.doc;
            const ranges = foldedRanges(view.state);

            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);

                if (line.text.startsWith(START_TAG)) {
                    const endLineNo = findMatchingEndLine(doc, i);

                    if (endLineNo !== -1) {
                        const foldStart = line.to;
                        const foldEnd = doc.line(endLineNo).to;

                        // Check if currently folded
                        let isFolded = false;
                        ranges.between(foldStart, foldEnd, (from: number, to: number) => {
                            if (from === foldStart && to === foldEnd) {
                                isFolded = true;
                            }
                        });

                        // Add the replacement widget safely
                        builder.add(
                            line.from,
                            line.from + START_TAG.length,
                            Decoration.replace({
                                widget: new ToggleWidget(isFolded, foldStart, foldEnd),
                                inclusive: true
                            })
                        );
                    }
                }
            }
            return builder.finish();
        }
    }
);

export const toggleExtension: Extension = [
    notionFoldService,
    toggleWidgetPlugin
];

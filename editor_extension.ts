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
        span.style.cursor = "pointer";
        span.style.paddingRight = "5px";
        span.style.userSelect = "none";

        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            console.log(`[Toggle] Click. Folded: ${this.isFolded}`);

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

// 1. Fold Service
const notionFoldService = foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
    const line = state.doc.lineAt(lineStart);
    if (line.text.startsWith(START_TAG)) {
        const endLineNo = findMatchingEndLine(state.doc, line.number);
        if (endLineNo !== -1) {
            const nextLine = state.doc.line(endLineNo);
            return { from: line.to, to: nextLine.to };
        }
    }
    return null;
});

// 2. ViewPlugin with Sorting
const toggleWidgetPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some((e: StateEffect<any>) => e.is(foldEffect) || e.is(unfoldEffect)))) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const doc = view.state.doc;
            const ranges = foldedRanges(view.state);

            // Collect decorations in an array first
            interface DecoSpec {
                from: number;
                to: number;
                deco: Decoration;
            }
            const decos: DecoSpec[] = [];

            const INDENT_PX = 20;

            // Stack logic for indentation
            // To do this efficiently via single pass, we can track "open Start Tags".
            // But strict stack counting requires finding the matching end tag.
            // Let's iterate lines and use a simpler indentation heuristic or the robust calculation?
            // Robust calculation for every line is expensive (O(N^2)). (Calling findMatchingEndLine inside loop)
            // But for now correctness > perf.

            // Actually, Indentation level is just "Current Open Stacks".
            // We can track a running stack count.

            let stackLevel = 0;

            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                const text = line.text;

                // Adjust stack level
                // Logic:
                // If |> matches a valid block, it increases indent for SUBSEQUENT lines.
                // If <| matches a valid block, it decreases indent for THIS line and subsequent?
                // Usually:
                // Header: Level 0
                // Content: Level 1
                // Footer: Level 0

                let lineIndentLevel = stackLevel;

                if (text.startsWith(START_TAG)) {
                    stackLevel++;
                } else if (text.startsWith(END_TAG)) {
                    stackLevel--;
                    if (stackLevel < 0) stackLevel = 0;
                    lineIndentLevel = stackLevel;
                }

                // Add Indentation Decoration
                if (lineIndentLevel > 0) {
                    decos.push({
                        from: line.from,
                        to: line.from,
                        deco: Decoration.line({
                            attributes: { style: `padding-left: ${lineIndentLevel * INDENT_PX}px` }
                        })
                    });
                }

                // Add Widget Decoration for Headers
                if (text.startsWith(START_TAG)) {
                    const endLineNo = findMatchingEndLine(doc, i);
                    if (endLineNo !== -1) {
                        const foldStart = line.to;
                        const foldEnd = doc.line(endLineNo).to;

                        let isFolded = false;
                        ranges.between(foldStart, foldEnd, (from: number, to: number) => {
                            if (from === foldStart && to === foldEnd) {
                                isFolded = true;
                            }
                        });

                        decos.push({
                            from: line.from,
                            to: line.from + START_TAG.length,
                            deco: Decoration.replace({
                                widget: new ToggleWidget(isFolded, foldStart, foldEnd),
                                inclusive: true
                            })
                        });
                    }
                }
            }

            // SORT DECORATIONS
            // RangeSetBuilder requires strict sort.
            decos.sort((a, b) => {
                if (a.from !== b.from) return a.from - b.from;
                // If same start position, order matters?
                // Line decorations are usually attached to line start.
                // Replace decorations are range.
                // startSide default is 0.
                // Let's rely on standard stability.
                return a.to - b.to;
            });

            const builder = new RangeSetBuilder<Decoration>();
            for (const d of decos) {
                builder.add(d.from, d.to, d.deco);
            }
            return builder.finish();
        }
    }
);

export const toggleExtension: Extension = [
    notionFoldService,
    toggleWidgetPlugin
];

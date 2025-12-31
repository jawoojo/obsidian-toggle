import {
    EditorView,
    Decoration,
    DecorationSet,
    WidgetType,
    ViewPlugin,
    ViewUpdate,
    keymap
} from "@codemirror/view";
import {
    RangeSetBuilder,
    Extension,
    EditorState,
    Text,
    StateEffect,
    Prec
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

// [PRD 3.1.1] Widget for Toggle (Triangle)
class ToggleWidget extends WidgetType {
    constructor(readonly isFolded: boolean, readonly foldStart: number, readonly foldEnd: number) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "toggle-widget";
        span.textContent = this.isFolded ? "▶" : "▼"; // User requested: Triangle
        span.style.cursor = "pointer";
        span.style.paddingRight = "5px";
        span.style.userSelect = "none";

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

// Helper: Stack Counting
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

// 2. ViewPlugin (Indentation + Widgets)
const togglePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            // Rebuild if doc OR fold state changes
            if (update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some((e: StateEffect<any>) => e.is(foldEffect) || e.is(unfoldEffect)))) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const doc = view.state.doc;
            const lineCount = doc.lines;
            const ranges = foldedRanges(view.state);

            // Container for all decorations to be sorted
            interface DecoSpec {
                from: number;
                to: number;
                deco: Decoration;
            }
            const decos: DecoSpec[] = [];

            // --- A. Indentation Logic (O(N)) ---
            const openStack: number[] = [];
            const validRanges: { start: number, end: number }[] = [];

            for (let i = 1; i <= lineCount; i++) {
                const lineText = doc.line(i).text;
                if (lineText.startsWith(START_TAG)) {
                    openStack.push(i);
                } else if (lineText.startsWith(END_TAG)) {
                    if (openStack.length > 0) {
                        const start = openStack.pop()!;
                        validRanges.push({ start, end: i });
                    }
                }
            }

            const diff = new Int32Array(lineCount + 2);
            for (const range of validRanges) {
                if (range.end > range.start + 1) {
                    diff[range.start + 1]++;
                    diff[range.end]--;
                }
            }

            // --- B. Build Decorations (Indent + Widget) ---
            let currentLevel = 0;

            for (let i = 1; i <= lineCount; i++) {
                currentLevel += diff[i];
                const line = doc.line(i);

                // 1. Indentation
                if (currentLevel > 0) {
                    const safeLevel = Math.min(currentLevel, 10);
                    decos.push({
                        from: line.from,
                        to: line.from,
                        deco: Decoration.line({
                            attributes: { class: `toggle-indent-${safeLevel}` }
                        })
                    });
                }

                // 2. Widget Replacement for "|> "
                if (line.text.startsWith(START_TAG)) {
                    const endLineNo = findMatchingEndLine(doc, i);
                    if (endLineNo !== -1) {
                        const foldStart = line.to;
                        const foldEnd = doc.line(endLineNo).to;

                        // Check folded state
                        let isFolded = false;
                        ranges.between(foldStart, foldEnd, (from, to) => {
                            if (from === foldStart && to === foldEnd) isFolded = true;
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

            // Sort decorations to satisfy RangeSetBuilder
            decos.sort((a, b) => {
                if (a.from !== b.from) return a.from - b.from;
                return a.to - b.to;
            });

            const builder = new RangeSetBuilder<Decoration>();
            for (const d of decos) {
                builder.add(d.from, d.to, d.deco);
            }

            return builder.finish();
        }
    },
    {
        decorations: v => v.decorations
    }
);

// 3. Auto-Close Keymap
// triggered when user types ">"
const autoCloseKeymap = KeymapListener();

function KeymapListener(): Extension {
    return Prec.highest(keymap.of([{
        key: ">",
        run: (view: EditorView) => {
            const state = view.state;
            const ranges = state.selection.ranges;
            // Only handle single cursor for simplicity
            if (ranges.length !== 1) return false;

            const range = ranges[0];
            if (!range.empty) return false; // Don't handle selections

            const pos = range.head;
            // Check if previous char is "|"
            const prevChar = state.doc.sliceString(pos - 1, pos);

            if (prevChar === "|") {
                // Check if it is at the START of the line (or just |> pattern?)
                // User said "|> 치면". Assuming start of block.
                const line = state.doc.lineAt(pos);
                // Check if we are forming "|>" at start of line
                // line.text up to pos-1 should be empty?? or just check pattern?
                // Let's being robust: Just check if we are typing ">" after "|"

                // Insert ">" then newline then "<|"
                const insertText = ">\n<|";
                view.dispatch({
                    changes: { from: pos, insert: insertText },
                    selection: { anchor: pos + 1 } // Cursor after ">" (before newline)
                });
                return true; // Handled
            }
            return false;
        }
    }]));
}

export const toggleExtension: Extension = [
    notionFoldService,
    togglePlugin,
    autoCloseKeymap
];

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
const INDENT_STEP = 24; // 24px per level

// [PRD 3.1.1] Start Widget (Triangle)
class ToggleWidget extends WidgetType {
    constructor(readonly isFolded: boolean, readonly foldStart: number, readonly foldEnd: number) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "toggle-widget";
        span.textContent = this.isFolded ? "▶" : "▼";
        span.style.cursor = "pointer";

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

    ignoreEvent(): boolean { return true; }
}

// [New] End Widget (Horizontal Line)
class EndTagWidget extends WidgetType {
    toDOM(view: EditorView): HTMLElement {
        const div = document.createElement("div");
        div.className = "toggle-end-widget";
        return div;
    }
    ignoreEvent(): boolean { return true; }
}

// [New] Spacer Widget (For indentation)
class SpacerWidget extends WidgetType {
    constructor(readonly width: number) {
        super();
    }
    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "toggle-spacer";
        span.style.width = `${this.width}px`;
        return span;
    }
    ignoreEvent(): boolean { return true; }
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
            if (update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some((e: StateEffect<any>) => e.is(foldEffect) || e.is(unfoldEffect)))) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const doc = view.state.doc;
            const lineCount = doc.lines;
            const ranges = foldedRanges(view.state);

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

            // --- B. Build Decorations (Spacer + Widget) ---
            let currentLevel = 0;

            for (let i = 1; i <= lineCount; i++) {
                currentLevel += diff[i];
                const line = doc.line(i);
                const text = line.text;

                // 1. Indentation (using SpacerWidget)
                // We inject a widget at the very start of the line content.
                if (currentLevel > 0) {
                    const indentPx = currentLevel * INDENT_STEP;
                    decos.push({
                        from: line.from,
                        to: line.from,
                        deco: Decoration.widget({
                            widget: new SpacerWidget(indentPx),
                            side: -1 // To appear before content
                        })
                    });
                }

                // 2. Start Widget ("|> " -> Triangle)
                if (text.startsWith(START_TAG)) {
                    const endLineNo = findMatchingEndLine(doc, i);
                    if (endLineNo !== -1) {
                        const foldStart = line.to;
                        const foldEnd = doc.line(endLineNo).to;

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

                // 3. End Widget ("<|" -> Horizontal Line)
                if (text.startsWith(END_TAG)) {
                    decos.push({
                        from: line.from,
                        to: line.from + END_TAG.length,
                        deco: Decoration.replace({
                            widget: new EndTagWidget(),
                            inclusive: true
                        })
                    });
                }
            }

            // Sort decorations
            decos.sort((a, b) => {
                if (a.from !== b.from) return a.from - b.from;
                // Widget (side -1) comes before Replace?
                // Both essentially at same position or overlapping.
                // Replace is range [from, from+3]. Spacer is point [from].
                // Point should come before Range if at same start pos.
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

// 3. Auto-Close Keymap (Trigger on Space)
const autoCloseKeymap = Prec.highest(keymap.of([{
    key: "Space",
    run: (view: EditorView) => {
        const state = view.state;
        const ranges = state.selection.ranges;
        if (ranges.length !== 1) return false;

        const range = ranges[0];
        if (!range.empty) return false;

        const pos = range.head;
        const prevChars = state.doc.sliceString(pos - 2, pos);

        if (prevChars === "|>") {
            const insertText = " \n<|";
            view.dispatch({
                changes: { from: pos, insert: insertText },
                selection: { anchor: pos + 1 }
            });
            return true;
        }
        return false;
    }
}]));

export const toggleExtension: Extension = [
    notionFoldService,
    togglePlugin,
    autoCloseKeymap
];

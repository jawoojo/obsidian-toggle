import {
    Decoration,
    DecorationSet,
    EditorView,
    WidgetType
} from "@codemirror/view";
import {
    StateEffect,
    StateField,
    RangeSetBuilder
} from "@codemirror/state";

// ============================================================
// [1] Definitions
// ============================================================
const START_SYNTAX = /^\|>\s/;
const END_SYNTAX = /^<\|/;

// ============================================================
// [2] Actions
// ============================================================
export const toggleEffect = StateEffect.define<{ lineNo: number }>();

// ============================================================
// [3] State Field (Atomic Hiding Strategy)
// ============================================================

interface TogglePluginState {
    decorations: DecorationSet;
    foldedLines: Set<number>;
}

export const togglePlugin = StateField.define<TogglePluginState>({
    create(state) {
        return {
            decorations: Decoration.none,
            foldedLines: new Set()
        };
    },
    update(value, tr) {
        console.log("[Toggle] Update Cycle - V6 Atomic Hiding");

        // 1. Manage Fold State
        const newFolded = new Set(value.foldedLines);

        if (tr.docChanged) {
            const mapped = new Set<number>();
            newFolded.forEach(lineNo => {
                try {
                    if (lineNo >= tr.startState.doc.lines) return;
                    const oldPos = tr.startState.doc.line(lineNo).from;
                    const newPos = tr.changes.mapPos(oldPos);
                    const newLine = tr.newDoc.lineAt(newPos);
                    if (START_SYNTAX.test(newLine.text)) {
                        mapped.add(newLine.number);
                    }
                } catch (e) { }
            });
            newFolded.clear();
            mapped.forEach(n => newFolded.add(n));
        }

        for (const effect of tr.effects) {
            if (effect.is(toggleEffect)) {
                if (newFolded.has(effect.value.lineNo)) newFolded.delete(effect.value.lineNo);
                else newFolded.add(effect.value.lineNo);
            }
        }

        // 2. Build Decorations
        const builder = new RangeSetBuilder<Decoration>();
        const doc = tr.newDoc;
        const hiddenNewLineWidget = new HiddenWidget(); // Reuse singleton

        let i = 1;
        while (i <= doc.lines) {
            const line = doc.line(i);
            if (START_SYNTAX.test(line.text)) {
                const isFolded = newFolded.has(i);

                // A. Render Toggle Triangle
                builder.add(line.from, line.from + 3, Decoration.replace({
                    widget: new ToggleWidget(isFolded, i),
                    inclusive: true
                }));

                // B. Atomic Hiding
                if (isFolded) {
                    let endLineNo = -1;
                    for (let j = i + 1; j <= doc.lines; j++) {
                        if (END_SYNTAX.test(doc.line(j).text)) {
                            endLineNo = j;
                            break;
                        }
                    }
                    if (endLineNo !== -1) {
                        // Loop through lines to hide
                        for (let k = i + 1; k < endLineNo; k++) {
                            const hiddenLine = doc.line(k);

                            // 1. Mark Text Content as Hidden (Inline Decoration)
                            if (hiddenLine.length > 0) {
                                builder.add(
                                    hiddenLine.from,
                                    hiddenLine.to,
                                    Decoration.mark({ class: "notion-toggle-hidden" }) // Uses CSS display:none
                                );
                            }

                            // 2. Replace Newline with Empty Widget (Inline Decoration)
                            // This effectively merges lines, removing vertical space
                            builder.add(
                                hiddenLine.to,
                                hiddenLine.to + 1,
                                Decoration.replace({ widget: hiddenNewLineWidget })
                            );
                        }

                        i = endLineNo - 1;
                    }
                }
            }
            i++;
        }

        return {
            decorations: builder.finish(),
            foldedLines: newFolded
        };
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

// Widgets
class ToggleWidget extends WidgetType {
    constructor(readonly isFolded: boolean, readonly lineNo: number) { super(); }
    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.innerText = this.isFolded ? "▶" : "▼";
        span.style.cursor = "pointer";
        span.style.marginRight = "5px";
        span.onclick = (e) => {
            e.preventDefault();
            view.dispatch({ effects: toggleEffect.of({ lineNo: this.lineNo }) });
        };
        return span;
    }
}

class HiddenWidget extends WidgetType {
    toDOM() {
        const span = document.createElement("span");
        // Zero width/height invisible span
        span.style.display = "inline-block";
        span.style.width = "0";
        span.style.height = "0";
        span.style.overflow = "hidden";
        return span;
    }
}

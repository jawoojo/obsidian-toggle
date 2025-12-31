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
    Extension
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

        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            console.log(`[Toggle] Native Click. Currently Folded: ${this.isFolded}`);

            if (this.isFolded) {
                // Unfold
                view.dispatch({
                    effects: unfoldEffect.of({ from: this.foldStart, to: this.foldEnd })
                });
            } else {
                // Fold
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

// 1. Define what can be folded
const notionFoldService = foldService.of((state, lineStart, lineEnd) => {
    const line = state.doc.lineAt(lineStart);
    // Only handle lines starting with |>
    if (line.text.startsWith(START_TAG)) {
        for (let i = line.number + 1; i <= state.doc.lines; i++) {
            const nextLine = state.doc.line(i);
            if (nextLine.text.startsWith(END_TAG)) {
                // Fold from end of Header Line to end of End Tag Line
                return { from: line.to, to: nextLine.to };
            }
        }
    }
    return null;
});

// 2. Render Widgets using ViewPlugin
const toggleWidgetPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            // Rebuild if doc changes or FOLD state changes
            if (update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some(e => e.is(foldEffect) || e.is(unfoldEffect)))) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            const doc = view.state.doc;
            const ranges = foldedRanges(view.state); // Get current valid folds

            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                if (line.text.startsWith(START_TAG)) {

                    // Find the expected fold range for this line
                    let endLineNo = -1;
                    for (let j = i + 1; j <= doc.lines; j++) {
                        if (doc.line(j).text.startsWith(END_TAG)) {
                            endLineNo = j;
                            break;
                        }
                    }

                    if (endLineNo !== -1) {
                        const foldStart = line.to;
                        const foldEnd = doc.line(endLineNo).to;

                        // Check if this specific range is currently folded?
                        // foldedRanges.iter returns ranges. We check if ours is covered.
                        // Actually, simplified check: is the point immediately after line.to inside a folded range?

                        let isFolded = false;
                        ranges.between(foldStart, foldEnd, (from, to) => {
                            if (from === foldStart && to === foldEnd) {
                                isFolded = true;
                            }
                        });

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

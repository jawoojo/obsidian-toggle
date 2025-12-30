import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { EditorState, StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";

const TOGGLE_SYNTAX = /^\|>\s/;

// Effect to toggle the folded state of a position
export const toggleEffect = StateEffect.define<{ pos: number; on: boolean }>();

// StateField to track folded toggle positions (start of the line)
export const foldState = StateField.define<Set<number>>({
    create() {
        return new Set<number>();
    },
    update(value, tr) {
        // Map existing positions through changes
        const newValue = new Set<number>();
        for (const pos of value) {
            const newPos = tr.changes.mapPos(pos);
            // We might want to verify if the syntax still exists at newPos?
            // For now, just map it. If syntax is gone, it won't be rendered as toggle anyway,
            // but we should probably clean it up eventually.
            newValue.add(newPos);
        }

        // Apply effects
        for (const effect of tr.effects) {
            if (effect.is(toggleEffect)) {
                if (effect.value.on) {
                    newValue.add(effect.value.pos);
                } else {
                    newValue.delete(effect.value.pos);
                }
            }
        }
        return newValue;
    }
});

class ToggleWidget extends WidgetType {
    constructor(readonly isFolded: boolean) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "toggle-widget" + (this.isFolded ? " is-closed" : "");
        // Using a simple unicode triangle for now. 
        // Down pointing triangle for open, Right pointing for closed.
        // We can use CSS rotation. Let's use Down Triangle by default.
        span.innerText = "▼";

        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pos = view.posAtDOM(span);
            // Toggle state
            const effect = toggleEffect.of({ pos, on: !this.isFolded });
            view.dispatch({ effects: effect });
        };
        return span;
    }

    ignoreEvent() {
        return true;
    }

    eq(other: ToggleWidget) {
        return other.isFolded == this.isFolded;
    }
}

export const togglePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.state.field(foldState) !== update.startState.field(foldState)) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            const foldedPositions = view.state.field(foldState);
            const doc = view.state.doc;

            // Iterate lines efficiently
            // Iterate lines efficiently
            // Logic: process line by line to support full document folding correctly.
            // For MVP, we iterate the whole document to ensure folding ranges are calculated properly.

            // Wait, looping whole doc in buildDecorations is bad for performance on every type.
            // But if we only do it on docChange, it might be okay for small docs.
            // For MVP, we'll try this. If slow, we optimize.
            // Actually, we must create a Replace decoration for the folded content.

            // Re-logic:
            // We need to loop line by line.
            // If we encounter a toggle:
            //   Add Widget Decoration.
            //   If it is folded:
            //     Remember start pos.
            //     Continue loop until next toggle found or EOF.
            //     Add Replace Decoration for that range.

            // Code:
            let i = 1;
            while (i <= doc.lines) {
                const line = doc.line(i);
                const match = line.text.match(TOGGLE_SYNTAX);

                if (match) {
                    const isFolded = foldedPositions.has(line.from);
                    builder.add(
                        line.from,
                        line.from + 3,
                        Decoration.replace({
                            widget: new ToggleWidget(isFolded),
                        })
                    );

                    if (isFolded) {
                        // Find end of fold
                        const startFold = line.to + 1; // Start of next line
                        if (startFold > doc.length) {
                            // Toggle at end of file, nothing to fold
                            i++; continue;
                        }

                        let endFold = doc.length;
                        let j = i + 1;
                        while (j <= doc.lines) {
                            const verifyLine = doc.line(j);
                            if (verifyLine.text.match(TOGGLE_SYNTAX)) {
                                endFold = verifyLine.from - 1; // Before the next toggle
                                break;
                            }
                            j++;
                        }

                        // Create replace decoration
                        if (endFold > startFold) {
                            builder.add(startFold, endFold, Decoration.replace({ block: true }));
                        }
                        i = j; // Skip processed lines? 
                        // No, we need to process the next toggle line in the outer loop (which is line j)
                        // So we assume the outer loop will continue.
                        // But we just scanned j lines. 
                        // We should update i to j if we processed them?
                        // If we just scanned, we didn't add decorations for inside lines (which is correct, they are hidden).
                        // BUT what if there are toggles INSIDE a folded block?
                        // PRD says "Until next toggle". So nested toggles are NOT supported yet (flat hierarchy).
                        // Requirements [2.1.2]: "Until next toggle content...".
                        // So yes, strictly flat for now.
                        // Actually, if we hide the lines, we don't need to process them for widgets.
                        // So setting i = j is correct.
                        // BUT, verifyLine was the NEW toggle line. We need to process it.
                        // So i = j (if j <= doc.lines, this will be the start of next iteration? No loop does i++)
                        // Loop is `while (i <= doc.lines)`.
                        // If we set i = j, and don't increment at end of loop, it's fine.
                        continue; // Continue with i = j
                    }
                }
                i++;
            }

            return builder.finish();
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

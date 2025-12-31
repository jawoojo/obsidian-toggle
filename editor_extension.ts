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
const INDENT_STEP = 16.5; // Restored Base Grid (16.5px)

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
    constructor(readonly pos: number, readonly indentPx: number) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        // [Fix] Use 'span' for inline flow
        const span = document.createElement("span");
        span.className = "toggle-end-widget";

        // [Fix] Apply Indentation directly to the widget
        if (this.indentPx > 0) {
            span.style.marginLeft = `${this.indentPx}px`;
        }

        // Allow clicking the line to set cursor
        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch({
                selection: { anchor: this.pos }
            });
            view.focus();
        };
        return span;
    }

    ignoreEvent(): boolean { return false; }
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

// 1. Fold Service (Enhanced for Scoped Headers)
const notionFoldService = foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
    const line = state.doc.lineAt(lineStart);
    const text = line.text;

    // Case 1: Toggle Fold (|> ...)
    if (text.startsWith(START_TAG)) {
        const endLineNo = findMatchingEndLine(state.doc, line.number);
        if (endLineNo !== -1) {
            const nextLine = state.doc.line(endLineNo);
            return { from: line.to, to: nextLine.to };
        }
    }

    // Case 2: Scoped Header Fold (## ... inside |>)
    // Goal: Prevent Header fold from eating the <| tag.
    if (text.trimStart().startsWith("#")) {
        // 1. Identify Header Level
        const match = text.match(/^(#+)\s/);
        if (!match) return null;
        const headerLevel = match[1].length;

        // 2. Scan downwards for the fold end
        const doc = state.doc;
        let endLineNo = -1;

        // We need to track Toggle Depth to know if a <| belongs to our parent toggle
        // Simple heuristic: If we encounter a <| that brings stack to 0 relative to where we started?
        // Actually, we just want to stop at the FIRST <| that closes the Current Scope, 
        // OR the next Header.
        // Wait, simply scanning down:
        // - If we hit a Header <= currentLevel -> Stop (Standard Header behavior)
        // - If we hit a <| -> Check if it closes a toggle started *after* the header? 
        //   No, if the header is inside a toggle, "unmatched" <| means end of parent scope.

        let toggleStack = 0; // Tracks toggles started WITHIN this header block

        for (let i = line.number + 1; i <= doc.lines; i++) {
            const nextLineText = doc.line(i).text;

            // A. Check for nested Toggles
            if (nextLineText.startsWith(START_TAG)) {
                toggleStack++;
            }
            else if (nextLineText.startsWith(END_TAG)) {
                if (toggleStack > 0) {
                    toggleStack--; // Closes a nested toggle, continue
                } else {
                    // B. Found a <| that closes the SURROUNDING context
                    // This is our hard stop. The header must yield to the parent toggle.
                    endLineNo = i - 1; // Stop at the line BEFORE the end tag
                    break;
                }
            }

            // C. Check for Next Header
            // Only relevant if not inside a nested toggle (actually headers don't nest inside toggles usually physically, but logically)
            // CodeMirror standard: Headers stop at next same-level header.
            // Ignore headers inside code blocks? (Simple regex check)
            const nextHeaderMatch = nextLineText.match(/^(#+)\s/);
            if (nextHeaderMatch) {
                const nextLevel = nextHeaderMatch[1].length;
                if (nextLevel <= headerLevel) {
                    endLineNo = i - 1;
                    break;
                }
            }
        }

        // If we found a valid end point (and it's not just the header itself)
        if (endLineNo > line.number) {
            return { from: line.to, to: doc.line(endLineNo).to };
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
            let shouldUpdate = update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some((e: StateEffect<any>) => e.is(foldEffect) || e.is(unfoldEffect)));

            // Optimization: Only update on selection change if we are interacting with an END_TAG
            if (!shouldUpdate && update.selectionSet) {
                const hasOverlap = (state: EditorState) => {
                    for (const range of state.selection.ranges) {
                        const line = state.doc.lineAt(range.head);
                        if (line.text.startsWith(END_TAG)) {
                            // Check intersection with tag: [line.from, line.from + len]
                            if (range.from <= line.from + END_TAG.length && range.to >= line.from) return true;
                        }
                    }
                    return false;
                };

                const prevOverlap = hasOverlap(update.startState);
                const currOverlap = hasOverlap(update.state);

                // If we were on a tag (need to hide) OR are now on a tag (need to reveal), update.
                if (prevOverlap || currOverlap) {
                    shouldUpdate = true;
                }
            }

            if (shouldUpdate) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const doc = view.state.doc;
            const lineCount = doc.lines;
            const ranges = foldedRanges(view.state);
            const selection = view.state.selection;

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

                    // [Fix] User wants the End Tag line to also be indented.
                    // Previously: diff[range.end]-- (End Tag drops back to Parent Level)
                    // Now: diff[range.end + 1]-- (End Tag stays at Content Level, drops AFTER)
                    // Wait, standard coding style: } aligns with { (Parent Level).
                    // But user request: "The <| line starting position is not indented... insert bricks".
                    // If user literally wants the line to start indented, I should include it.
                    // BUT, if I indent it, it aligns with content, not the start tag.
                    // Let's try aligning with Content as requested?
                    // "Until the indentation ends" -> imply covering the whole block.
                    // Actually, let's keep it simple: The END tag should align with the START tag usually.
                    // But user says "it's not indented", maybe they nest deeply and the <| is at root 0?
                    // Ah, my logic `findMatchingEndLine` finds the matching tag.
                    // The levels are cumulative.
                    // Start Tag (L0) -> Content (L1) -> End Tag (L0).
                    // If user wants End Tag to be L1? That's unusual but I will follow "Insert bricks" instruction.

                    // Actually, if I change to diff[range.end + 1]--, the End Tag gets L1.
                    // If I change to diff[range.end]--, the End Tag gets L0.

                    // Let's assume User wants End Tag to align with CONTENT (L1).
                    diff[range.end + 1]--;
                }
            }

            // --- B. Build Decorations (Spacer + Widget) ---
            let currentLevel = 0;

            for (let i = 1; i <= lineCount; i++) {
                currentLevel += diff[i];
                const line = doc.line(i);
                const text = line.text;

                // [Logic Change] User's Specific Measurements
                // Level 1: 12.5px
                // Level 2+: 12.5px + (Level - 1) * 16.5px
                const indentPx = currentLevel > 0
                    ? (currentLevel === 1 ? 12.5 : (12.5 + (currentLevel - 1) * INDENT_STEP))
                    : 0;

                // 1. Indentation (using SpacerWidget)
                // [Logic Change] For END_TAG lines, we handle indent inside the EndTagWidget itself.
                // For all other lines, we use the SpacerWidget.
                if (currentLevel > 0 && !text.startsWith(END_TAG)) {
                    decos.push({
                        from: line.from,
                        to: line.from,
                        deco: Decoration.widget({
                            widget: new SpacerWidget(indentPx),
                            side: -1
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
                    const rangeFrom = line.from;
                    const rangeTo = line.from + END_TAG.length;

                    // [New Logic] Reveal on Click/Selection
                    // Check if any cursor overlaps with this range
                    let isSelected = false;
                    for (const r of selection.ranges) {
                        if (r.to >= rangeFrom && r.from <= rangeTo) {
                            isSelected = true;
                            break;
                        }
                    }

                    // Only replace if NOT selected
                    if (!isSelected) {
                        decos.push({
                            from: rangeFrom,
                            to: rangeTo,
                            deco: Decoration.replace({
                                // Pass indentPx here directly
                                widget: new EndTagWidget(rangeFrom, indentPx),
                                inclusive: true
                            })
                        });
                    } else {
                        // If selected (revealed), we MUST add the SpacerWidget manually 
                        // because we skipped it in step 1.
                        if (currentLevel > 0) {
                            decos.push({
                                from: line.from,
                                to: line.from,
                                deco: Decoration.widget({
                                    widget: new SpacerWidget(indentPx),
                                    side: -1
                                })
                            });
                        }
                    }
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

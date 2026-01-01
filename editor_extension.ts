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
import { getIcon } from "obsidian";

// Constants
const START_TAG = "|> "; // [Reverted] Strict space required
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

// [PRD Example] Copy Widget (Top-Right)
class CopyWidget extends WidgetType {
    constructor(readonly startLineNo: number, readonly endLineNo: number) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        console.log("DEBUG: CopyWidget created for line", this.startLineNo);
        const span = document.createElement("span");
        span.className = "toggle-copy-btn";

        // Use native Obsidian icon
        const iconInfo = getIcon("copy");
        if (iconInfo) {
            span.appendChild(iconInfo);
        } else {
            span.textContent = "Copy";
        }


        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Logic: Copy content BETWEEN start and end tags
            const doc = view.state.doc;

            // Safety check: if empty or immediate close
            if (this.endLineNo <= this.startLineNo + 1) {
                navigator.clipboard.writeText("");
                return;
            }

            // content starts at startLine + 1
            // content ends at endLine - 1
            const fromPos = doc.line(this.startLineNo + 1).from;
            const toPos = doc.line(this.endLineNo - 1).to;

            // Slice preserves newlines
            const text = doc.sliceString(fromPos, toPos);
            navigator.clipboard.writeText(text);
        };
        return span;
    }

    ignoreEvent(): boolean { return true; }
}

// [Updated] End Widget (Horizontal Line or Error)
class EndTagWidget extends WidgetType {
    constructor(readonly pos: number, readonly indentPx: number, readonly isError: boolean = false) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");

        if (this.isError) {
            span.className = "toggle-end-error";
            span.textContent = "<| (Unmatched)";
        } else {
            span.className = "toggle-end-widget";
            // Normal: Invisible (handled by CSS)
        }

        // Allow clicking to set cursor
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

// [Refactor] SpacerWidget Removed
// class SpacerWidget extends WidgetType { ... }

// Helper: Stack Counting
function findMatchingEndLine(doc: Text, startLineNo: number): number {
    let stack = 1;
    for (let i = startLineNo + 1; i <= doc.lines; i++) {
        const lineText = doc.line(i).text.trimStart(); // [Updated] robust
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



// [Simplified] Toggle Plugin (No Indentation Logic)
const togglePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            let shouldUpdate = update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some((e: StateEffect<any>) => e.is(foldEffect) || e.is(unfoldEffect)));

            // [Optimized] Update logic simplified: Only standard triggers needed
            // CSS handles active-line visibility now.

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
                if (range.end >= range.start) {
                    diff[range.start]++;
                    diff[range.end + 1]--;
                }
            }

            // --- B. Build Decorations ---
            let currentLevel = 0;
            let prevLevel = 0; // [New] Track previous line's level
            // Orphan Detection Stack
            let runningStack = 0;

            for (let i = 1; i <= lineCount; i++) {
                currentLevel += diff[i];
                const line = doc.line(i);
                const text = line.text;
                const trimmedText = text.trimStart(); // [Updated] robust check

                // 1. Background Highlight (Notion Callout Style)
                if (currentLevel > 0) {
                    const safeLevel = Math.min(currentLevel, 8); // [Updated] Cap at 8
                    let classNames = `toggle-bg toggle-bg-level-${safeLevel}`;

                    // [New] Tag-Based Rounding Logic
                    // If this line explicitly STARTS a toggle -> Round Top
                    if (trimmedText.startsWith(START_TAG)) {
                        classNames += " toggle-round-top";
                    }

                    // If this line explicitly ENDS a toggle -> Round Bottom
                    if (trimmedText.startsWith(END_TAG)) {
                        classNames += " toggle-round-bot";
                    }

                    decos.push({
                        from: line.from,
                        to: line.from,
                        deco: Decoration.line({
                            class: classNames
                        })
                    });
                }

                // Update prevLevel for next iteration
                prevLevel = currentLevel;

                // 2. Start Widget ("|> " -> Triangle)
                if (trimmedText.startsWith(START_TAG)) {
                    runningStack++; // Push to stack

                    // Use actual index from trim to preserve indentation
                    const indentLen = text.length - trimmedText.length;
                    const rangeFrom = line.from + indentLen;
                    const rangeTo = rangeFrom + START_TAG.length;

                    // Check Reveal
                    let isSelected = false;
                    for (const r of selection.ranges) {
                        // Check if cursor touches the TAG itself (previous logic)
                        // But now we check line selection for CopyWidget, 
                        // For ToggleWidget, we hide it if the TAG range is touched? 
                        // Standard behavior: if cursor is anywhere on line, showing RAW text is usually better for editing.
                        // Let's check entire line intersection for simplicity, or keep specific range?
                        // User said: "When I touch the line, copy button appears". 
                        // User didn't say "When I touch the line, triangle disappears". 
                        // But usually we show raw text when editing. 

                        // Let's keep strict range check for replacing text with widget, 
                        // so we don't annoy user by un-rendering triangle when they are editing END of line.
                        // Wait, if I edit title, I want triangle to stay?
                        // Usually Obsidian toggles: editing title -> triangle stays.
                        // Editing TAG `|>` -> triangle reverts to text.
                        if (r.to >= rangeFrom && r.from <= rangeTo) {
                            isSelected = true;
                            break;
                        }
                    }

                    // Only replace if NOT selected
                    if (!isSelected) {
                        const endLineNo = findMatchingEndLine(doc, i);
                        if (endLineNo !== -1) {
                            const foldStart = line.to;
                            const foldEnd = doc.line(endLineNo).to;

                            let isFolded = false;
                            ranges.between(foldStart, foldEnd, (from, to) => {
                                if (from === foldStart && to === foldEnd) isFolded = true;
                            });

                            decos.push({
                                from: rangeFrom,
                                to: rangeTo,
                                deco: Decoration.replace({
                                    widget: new ToggleWidget(isFolded, foldStart, foldEnd),
                                    inclusive: true
                                })
                            });
                        }
                    }
                }

                // 3. End Widget ("<|" -> Smart Visibility)
                if (trimmedText.startsWith(END_TAG)) {
                    // ... existing end tag logic ...
                    const indentLen = text.length - trimmedText.length;
                    const rangeFrom = line.from + indentLen;
                    const rangeTo = rangeFrom + END_TAG.length;

                    // Orphan Check
                    const isOrphan = (runningStack === 0);
                    if (!isOrphan) {
                        runningStack--;
                    }

                    // Reveal on Click/Selection
                    let isSelected = false;
                    for (const r of selection.ranges) {
                        if (r.to >= rangeFrom && r.from <= rangeTo) {
                            isSelected = true;
                            break;
                        }
                    }

                    if (!isSelected && !isOrphan) {
                        decos.push({
                            from: rangeFrom,
                            to: rangeTo,
                            deco: Decoration.replace({
                                widget: new EndTagWidget(rangeFrom, 0),
                                inclusive: true
                            })
                        });
                    }
                }

                // [Optimized] Copy Widget (Always Inject, CSS handles visibility)
                if (trimmedText.startsWith(START_TAG)) {
                    const endLineNo = findMatchingEndLine(doc, i);

                    if (endLineNo !== -1) {
                        // Always add the widget. CSS will hide it unless .cm-activeLine is present.
                        decos.push({
                            from: line.to, // Append to end of line
                            to: line.to,
                            deco: Decoration.widget({
                                widget: new CopyWidget(i, endLineNo),
                                side: 1
                            })
                        });
                    }
                }
                if (text.startsWith(END_TAG)) {
                    const rangeFrom = line.from;
                    const rangeTo = line.from + END_TAG.length;

                    // Orphan Check
                    const isOrphan = (runningStack === 0);
                    if (!isOrphan) {
                        runningStack--;
                    }

                    // Reveal on Click/Selection
                    let isSelected = false;
                    for (const r of selection.ranges) {
                        if (r.to >= rangeFrom && r.from <= rangeTo) {
                            isSelected = true;
                            break;
                        }
                    }

                    // Simple Logic: 
                    // If Selected OR Orphan -> SHOW RAW TEXT (No Decoration)
                    // If Matched & Not Selected -> HIDE (Invisible Decoration)
                    if (!isSelected && !isOrphan) {
                        decos.push({
                            from: rangeFrom,
                            to: rangeTo,
                            deco: Decoration.replace({
                                widget: new EndTagWidget(rangeFrom, 0),
                                inclusive: true
                            })
                        });
                    }
                }
            }

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
            const insertText = " \n\n<|";
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

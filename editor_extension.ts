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
    Prec,
    RangeSet
} from "@codemirror/state";
import {
    foldService,
    foldEffect,
    unfoldEffect,
    foldedRanges
} from "@codemirror/language";
import { getIcon } from "obsidian";
import { gutterLineClass, GutterMarker } from "@codemirror/view"; // Moved import to top

// Constants
const START_TAG = "|> ";
const END_TAG = "<|";
const INDENT_STEP = 16.5;

// [PRD 3.1.1] Start Widget (Triangle)
class ToggleWidget extends WidgetType {
    constructor(
        readonly isFolded: boolean,
        readonly foldStart: number,
        readonly foldEnd: number,
        readonly invisible: boolean = false
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "toggle-widget";

        if (this.invisible) {
            span.style.display = "none";
        } else {
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
        }
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
        const span = document.createElement("span");
        span.className = "toggle-copy-btn";

        const iconInfo = getIcon("copy");
        if (iconInfo) {
            span.appendChild(iconInfo);
        } else {
            span.textContent = "Copy";
        }


        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const doc = view.state.doc;

            if (this.endLineNo <= this.startLineNo + 1) {
                navigator.clipboard.writeText("");
                return;
            }

            const fromPos = doc.line(this.startLineNo + 1).from;
            const toPos = doc.line(this.endLineNo - 1).to;
            const text = doc.sliceString(fromPos, toPos);
            navigator.clipboard.writeText(text);
        };
        return span;
    }

    ignoreEvent(): boolean { return true; }
}

// [Updated] End Widget
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
        }

        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch({ selection: { anchor: this.pos } });
            view.focus();
        };
        return span;
    }

    ignoreEvent(): boolean { return false; }
}

class HeaderHashWidget extends WidgetType {
    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "toggle-header-hash-widget";
        return span;
    }
}

function findMatchingEndLine(doc: Text, startLineNo: number): number {
    let stack = 1;
    for (let i = startLineNo + 1; i <= doc.lines; i++) {
        const lineText = doc.line(i).text.trimStart();
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
    const text = line.text;

    if (text.startsWith(START_TAG)) {
        return null;
    }

    if (text.trimStart().startsWith("#")) {
        const match = text.match(/^(#+)\s/);
        if (!match) return null;
        const headerLevel = match[1].length;
        const doc = state.doc;
        let endLineNo = -1;
        let toggleStack = 0;

        for (let i = line.number + 1; i <= doc.lines; i++) {
            const nextLineText = doc.line(i).text;
            if (nextLineText.startsWith(START_TAG)) {
                toggleStack++;
            }
            else if (nextLineText.startsWith(END_TAG)) {
                if (toggleStack > 0) {
                    toggleStack--;
                } else {
                    endLineNo = i - 1;
                    break;
                }
            }

            const nextHeaderMatch = nextLineText.match(/^(#+)\s/);
            if (nextHeaderMatch) {
                const nextLevel = nextHeaderMatch[1].length;
                if (nextLevel <= headerLevel) {
                    endLineNo = i - 1;
                    break;
                }
            }
        }

        if (endLineNo > line.number) {
            return { from: line.to, to: doc.line(endLineNo).to };
        }
    }

    const trimmed = text.trimStart();
    const backtickMatch = trimmed.match(/^`{3}.*>$/);
    const tildeMatch = trimmed.match(/^~{3}.*>$/);

    if (backtickMatch || tildeMatch) {
        return null;
    }

    return null;
});



// [Separated] Toggle Plugin (For Decorations Only)
const togglePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            let shouldUpdate = update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some((e: StateEffect<any>) => e.is(foldEffect) || e.is(unfoldEffect)));

            if (!shouldUpdate && update.selectionSet) {
                const hasOverlap = (state: EditorState) => {
                    for (const range of state.selection.ranges) {
                        const line = state.doc.lineAt(range.head);
                        const text = line.text.trimStart();
                        if (text.startsWith(START_TAG)) return true;
                        if (text.startsWith(END_TAG)) return true;
                    }
                    return false;
                };

                const prevOverlap = hasOverlap(update.startState);
                const currOverlap = hasOverlap(update.state);

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

            let currentLevel = 0;
            let runningStack = 0;
            let inCodeBlock = false;

            for (let i = 1; i <= lineCount; i++) {
                currentLevel += diff[i];
                const line = doc.line(i);
                const text = line.text;
                const trimmedText = text.trimStart();

                if (currentLevel > 0) {
                    const safeLevel = Math.min(currentLevel, 8);
                    let classNames = `toggle-bg toggle-bg-level-${safeLevel}`;

                    if (trimmedText.startsWith(START_TAG)) {
                        classNames += " toggle-round-top";
                        try {
                            const contentAfter = trimmedText.slice(START_TAG.length);
                            const headerMatch = contentAfter.match(/^\s*(#{1,6})\s/);

                            if (headerMatch) {
                                const level = headerMatch[1].length;
                                classNames += ` cm-header cm-header-${level} HyperMD-header HyperMD-header-${level}`;

                                let isLineSelected = false;
                                for (const r of selection.ranges) {
                                    if (r.to >= line.from && r.from <= line.to) {
                                        isLineSelected = true;
                                        break;
                                    }
                                }

                                if (!isLineSelected) {
                                    const indentLen = text.length - trimmedText.length;
                                    const hashStart = line.from + indentLen + START_TAG.length + headerMatch.index!;
                                    const hashEnd = hashStart + headerMatch[0].length;
                                    if (hashEnd <= line.to) {
                                        decos.push({
                                            from: hashStart,
                                            to: hashEnd,
                                            deco: Decoration.replace({
                                                widget: new HeaderHashWidget(),
                                                inclusive: true
                                            })
                                        });
                                    }
                                }
                            }
                        } catch (e) { }
                    }

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

                if (trimmedText.startsWith("```") || trimmedText.startsWith("~~~")) {
                    const isCodeBlockToggle = /^(```|~~~).*>\s*$/.test(trimmedText);

                    if (!inCodeBlock && isCodeBlockToggle) {
                        const indentLen = text.length - trimmedText.length;
                        const rangeFrom = line.from + indentLen;
                        const endToken = trimmedText.startsWith("```") ? "```" : "~~~";
                        let codeBlockEndLine = -1;

                        for (let k = i + 1; k <= lineCount; k++) {
                            const nextLineText = doc.line(k).text.trimStart();
                            if (nextLineText.startsWith(endToken)) {
                                codeBlockEndLine = k;
                                break;
                            }
                        }

                        if (codeBlockEndLine !== -1) {
                            const foldStart = line.to;
                            const foldEnd = doc.line(codeBlockEndLine).to;

                            let isFolded = false;
                            ranges.between(foldStart, foldEnd, (from, to) => {
                                if (from === foldStart && to === foldEnd) isFolded = true;
                            });

                            decos.push({
                                from: rangeFrom,
                                to: rangeFrom,
                                deco: Decoration.widget({
                                    widget: new ToggleWidget(isFolded, foldStart, foldEnd, false),
                                    side: -1
                                })
                            });
                        }
                    }

                    inCodeBlock = !inCodeBlock;
                    continue;
                }

                if (inCodeBlock) continue;

                if (trimmedText.startsWith(START_TAG)) {
                    runningStack++;
                    const indentLen = text.length - trimmedText.length;
                    const rangeFrom = line.from + indentLen;
                    const rangeTo = rangeFrom + START_TAG.length;

                    let isSelected = false;
                    for (const r of selection.ranges) {
                        if (r.to >= rangeFrom && r.from <= rangeTo) {
                            isSelected = true;
                            break;
                        }
                    }

                    const contentAfter = trimmedText.slice(START_TAG.length);
                    const isHeader = /^\s*(#{1,6})\s/.test(contentAfter);

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
                                    widget: new ToggleWidget(isFolded, foldStart, foldEnd, isHeader),
                                    inclusive: true
                                })
                            });
                        }
                    }
                }

                if (trimmedText.startsWith(END_TAG)) {
                    const indentLen = text.length - trimmedText.length;
                    const rangeFrom = line.from + indentLen;
                    const rangeTo = rangeFrom + END_TAG.length;

                    const isOrphan = (runningStack === 0);
                    if (!isOrphan) {
                        runningStack--;
                    }

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

                if (trimmedText.startsWith(START_TAG)) {
                    const endLineNo = findMatchingEndLine(doc, i);

                    if (endLineNo !== -1) {
                        decos.push({
                            from: line.to,
                            to: line.to,
                            deco: Decoration.widget({
                                widget: new CopyWidget(i, endLineNo),
                                side: 1
                            })
                        });
                    }
                }

            }

            decos.sort((a, b) => {
                if (a.from !== b.from) return a.from - b.from;
                return 0;
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

// 4. Hide Native Gutter Arrow (State Facet)
const hideFoldMarker = new class extends GutterMarker {
    elementClass = "toggle-hide-native-fold";
}

const hideNativeFoldGutter = gutterLineClass.compute(["doc"], (state: EditorState) => {
    const builder = new RangeSetBuilder<GutterMarker>();
    const doc = state.doc;

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const text = line.text.trimStart();

        // 1. Basic Toggle
        if (text.startsWith(START_TAG)) {
            const contentAfter = text.slice(START_TAG.length);
            const isHeader = /^\s*(#{1,6})\s/.test(contentAfter);
            if (!isHeader) {
                builder.add(line.from, line.from, hideFoldMarker);
            }
        }
        // 2. Code Block Toggle
        else if ((text.startsWith("```") || text.startsWith("~~~")) && /^(```|~~~).*>\s*$/.test(text)) {
            builder.add(line.from, line.from, hideFoldMarker);
        }
    }
    return builder.finish();
});

export const toggleExtension: Extension = [
    notionFoldService,
    togglePlugin,
    autoCloseKeymap,
    hideNativeFoldGutter,
    EditorView.baseTheme({
        ".cm-gutterElement .cm-fold-indicator": {
            // Default (visible)
        }
    })
];

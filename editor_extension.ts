import {
    EditorView,
    Decoration,
    DecorationSet,
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
    unfoldEffect
} from "@codemirror/language";

// Constants
const START_TAG = "|> ";
const END_TAG = "<|";

// Helper: Stack Counting for Nested Toggles (Still used for FoldService logic as it needs specific pairs)
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

// 2. ViewPlugin for Visual Indentation (Optimized O(N))
const indentPlugin = ViewPlugin.fromClass(
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
            const builder = new RangeSetBuilder<Decoration>();
            const doc = view.state.doc;
            const lineCount = doc.lines;

            // --- Algorithm: O(N) Valid Range Detection ---
            // 1. Identify Valid Ranges using a Stack
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

            // 2. Difference Array for Levels (Prefix Sum)
            // diff[i] means "change in indentation level" at line i
            // We need size = lineCount + 2 to safely handle index+1 boundaries
            const diff = new Int32Array(lineCount + 2);

            for (const range of validRanges) {
                // We want to indent lines BETWEEN start and end.
                // Range: [start+1, end-1] inclusive.
                // Logic:
                // At line (start+1), level increases by +1.
                // At line (end), level decreases by -1 (fixing it back to 0 for the end tag itself).

                if (range.end > range.start + 1) {
                    diff[range.start + 1]++;
                    diff[range.end]--;
                }
            }

            // 3. Apply Decorations by running Prefix Sum
            let currentLevel = 0;

            for (let i = 1; i <= lineCount; i++) {
                currentLevel += diff[i];

                if (currentLevel > 0) {
                    const line = doc.line(i);
                    const safeLevel = Math.min(currentLevel, 10);
                    builder.add(
                        line.from,
                        line.from,
                        Decoration.line({
                            attributes: { class: `toggle-indent-${safeLevel}` }
                        })
                    );
                }
            }

            return builder.finish();
        }
    },
    {
        decorations: v => v.decorations
    }
);

export const toggleExtension: Extension = [
    notionFoldService,
    indentPlugin
];

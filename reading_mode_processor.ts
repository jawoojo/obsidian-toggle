import { MarkdownPostProcessorContext, TFile, getIcon, App } from "obsidian";

const START_TAG = "|> ";
const END_TAG = "<|";

// Simple stack-based parsing to get level for every line
function parseLevels(text: string): { levels: number[], rounds: string[] } {
    const lines = text.split(/\r\n|\r|\n/);
    const levels = new Int32Array(lines.length).fill(0);
    const rounds = new Array(lines.length).fill("");

    const openStack: number[] = [];
    const validRanges: { start: number, end: number }[] = [];

    // 1. Identify Ranges
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (lineText.trimStart().startsWith(START_TAG)) {
            openStack.push(i);
        } else if (lineText.trimStart().startsWith(END_TAG)) {
            if (openStack.length > 0) {
                const start = openStack.pop()!;
                validRanges.push({ start, end: i });
            }
        }
    }

    // 2. Accumulate Levels (Correction Array)
    const diff = new Int32Array(lines.length + 1);
    for (const range of validRanges) {
        if (range.end >= range.start) {
            diff[range.start]++;
            diff[range.end + 1]--;
            rounds[range.start] = "top";
            rounds[range.end] = "bot";
        }
    }

    // 3. Apply Difference
    let currentLevel = 0;
    for (let i = 0; i < lines.length; i++) {
        currentLevel += diff[i];
        levels[i] = currentLevel;
    }

    return { levels: Array.from(levels), rounds };
}

declare const app: App;

export async function readingModeProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    // 1. Get Source Text
    const sectionInfo = ctx.getSectionInfo(el);
    if (!sectionInfo) return; // Should not happen usually

    // We need the WHOLE file text to parse nesting context correctly.
    // Optimization: In real plugin, we might cache this parsed result per file revision.
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const fileText = await app.vault.cachedRead(file);
    const { levels, rounds } = parseLevels(fileText);
    const lines = fileText.split(/\r\n|\r|\n/);

    // 2. Map Elements to Lines
    // sectionInfo provides lineStart and lineEnd (inclusive/exclusive?)
    // Obsidian docs: lineStart is inclusive, lineEnd is exclusive in some contexts, or end line index?
    // "lineStart: The line number of the first line of the block."
    // "lineEnd: The line number of the last line of the block."
    // It seems to be inclusive-inclusive or inclusive-exclusive?
    // Let's assume range is [lineStart, lineEnd].

    const startLine = sectionInfo.lineStart;
    const endLine = sectionInfo.lineEnd;

    // Naive Mapping: Iterate children and try to align with source lines
    // Problem: Markdown rendering might merge lines or skip lines.
    // Heuristic: Just use startLine and increment?
    // Text blocks usually map 1:1 if we ignore empty lines?

    let currentLine = startLine;
    const children = Array.from(el.children) as HTMLElement[];

    for (const child of children) {
        if (currentLine > endLine) break;

        // SKIP empty lines in source calculation if child has text?
        // Or assume Obsidian collapses empty lines? 
        // Let's just lookup the level for currentLine.
        // Better: Check text content to sync?

        // Simple Sync: 
        // If child is a <br> or empty?, maybe it's a newline?

        const lineLevel = levels[currentLine];
        const roundType = rounds[currentLine];
        const lineText = fileText.split(/\r\n|\r|\n/)[currentLine];
        // Re-split is inefficient but safest for exact line access without keeping array

        if (lineLevel > 0) {
            const safeLevel = Math.min(lineLevel, 8);
            child.classList.add("toggle-bg", `toggle-bg-level-${safeLevel}`);

            if (roundType === "top") child.classList.add("toggle-round-top");
            if (roundType === "bot") child.classList.add("toggle-round-bot");
        }

        // Handle Toggle Header & Start Tags
        // Check if the current line source corresponds to a Start Tag
        const trimmedSource = lineText.trimStart();
        if (trimmedSource.startsWith(START_TAG)) {
            // Check Header
            const contentAfter = trimmedSource.slice(START_TAG.length);
            const headerMatch = contentAfter.match(/^\s*(#{1,6})\s/);
            const isHeader = !!headerMatch;

            // 1. Hide the |> text in DOM
            // Child innerText usually contains "|> ...". 
            // We need to modify the DOM to hide matching text or wrap it.
            // Safe approach: Wrap the |> in a span with display:none?
            // OR replace text node.

            // Getting the text node that contains "|> "
            // It's likely the first text node.
            const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
            const firstTextNode = walker.nextNode();

            if (firstTextNode && firstTextNode.nodeValue) {
                // Warning: The text in DOM might be rendered markdown.
                // e.g. "|> **Bold**" -> val: "|> ", next node BOLD.
                // We just want to remove the specific prefix pattern from the start.

                // If it's pure text node
                // let processed = false; (Removed unused)
                if (firstTextNode.nodeValue.trimStart().startsWith("|>")) {
                    // Remove |> 
                    // But keep the triangle if NOT header.

                    // Replace "|>" with Triangle Widget or Empty
                    const originalVal = firstTextNode.nodeValue;
                    const triggerIdx = originalVal.indexOf("|>");

                    if (triggerIdx !== -1) {
                        // Split node
                        const afterText = originalVal.substring(triggerIdx + 2); // Remove |>
                        const beforeText = originalVal.substring(0, triggerIdx);

                        firstTextNode.nodeValue = beforeText + (isHeader ? "" : ""); // Remove |> text
                        // (If we want a triangle, we inject an element)

                        // Inject Triangle Span
                        // Only if NOT header (User Requirements)
                        if (!isHeader) {
                            const triangle = document.createElement("span");
                            triangle.className = "toggle-widget";
                            triangle.textContent = "▼"; // Default open in reading mode?
                            // In Reading mode, everything is static. We can't easily toggle state.
                            // So just show "Down Arrow" to indicate it's open.
                            // Margin handled by CSS (.toggle-widget)

                            // Insert before the text we just stripped
                            // child.insertBefore(triangle, ...?) 
                            // firstTextNode is now "beforeText". 
                            // We need to insert after firstTextNode.
                            if (firstTextNode.parentNode) {
                                firstTextNode.parentNode.insertBefore(triangle, firstTextNode.nextSibling);
                                // And then the afterText? 
                                const textNodeAfter = document.createTextNode(afterText);
                                firstTextNode.parentNode.insertBefore(textNodeAfter, triangle.nextSibling);
                            }
                        } else {
                            // Header Case: Just remove |> (already done by setting nodeValue)
                            // Also need to remove Hash # ?
                            // If isHeader, DOM usually renders as <p>|> # Title</p> because # mid-line is not header.
                            // We need to strip the # as well if we want clean look.
                            if (headerMatch) {
                                // afterText is " # Title" or "   # Title"
                                // Remove the hash sequence
                                const cleanTitle = afterText.replace(/^\s*#{1,6}\s/, ""); // Removes " # "

                                if (firstTextNode.parentNode) {
                                    const textNodeAfter = document.createTextNode(cleanTitle);
                                    firstTextNode.parentNode.insertBefore(textNodeAfter, firstTextNode.nextSibling);
                                }

                                // Apply Header Styling to the Container (child)
                                const level = headerMatch[1].length;
                                // Obsidian standard: .markdown-preview-view h1...
                                // Or use cm-header classes? styles.css targets .cm-header.
                                // Let's add them + maybe our own utility class.
                                // Let's add them + maybe our own utility class.
                                child.classList.add(`cm-header`, `cm-header-${level}`, `toggle-header-${level}`);
                                // Styles handled by .toggle-header-{n} classes
                            } else {
                                // Just restore rest of text
                                if (firstTextNode.parentNode) {
                                    const textNodeAfter = document.createTextNode(afterText);
                                    firstTextNode.parentNode.insertBefore(textNodeAfter, firstTextNode.nextSibling);
                                }
                            }
                        }
                    }
                }
            }

            // Inject Copy Button?
            // Reading mode copy button?
            // "When I touch the line, copy button appears"
            // We can inject it hidden, enable via CSS hover on .toggle-bg?
            // Yes.
            const endLineNo = findMatchingEndLine(levels, lines, currentLine);
            if (endLineNo !== -1) {
                const copyBtn = document.createElement("span");
                copyBtn.className = "toggle-copy-btn";
                const icon = getIcon("copy");
                if (icon) copyBtn.appendChild(icon);

                copyBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Calculate text range
                    // lines [currentLine+1 ... endLineNo-1]
                    const contentLines = lines.slice(currentLine + 1, endLineNo);
                    navigator.clipboard.writeText(contentLines.join("\n"));
                };

                child.appendChild(copyBtn);
                child.classList.add("u-relative"); // [Refactor] Use class for positioning
            }
        }

        // [Optimization] Guard Clause: Skip if End Tag is not present at all using fast native property
        if (child.textContent && child.textContent.includes(END_TAG)) {
            // [Modified] Aggressive End Tag Cleanup
            // Scan text nodes for "<|" independently of line mapping
            // This handles cases where Obsidian merges lines (e.g. Content\n<|) into one element
            const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
            let textNode: Node | null;
            while (textNode = walker.nextNode()) {
                if (textNode.nodeValue && textNode.nodeValue.includes(END_TAG)) {
                    // Replace "<|" and preceding newline/spaces if it matches the End Tag pattern
                    // Regex: (Start of node OR Newline) + Optional Whitespace + <|
                    textNode.nodeValue = textNode.nodeValue.replace(/(^|\n)\s*<\|/g, "$1");
                }
            }
        }

        currentLine++;
    }
}

// Helper to find end line using pre-calculated logic or simple search
function findMatchingEndLine(levels: number[], lines: string[], startLine: number): number {
    let stack = 1;
    for (let i = startLine + 1; i < lines.length; i++) {
        const txt = lines[i].trimStart();
        if (txt.startsWith(START_TAG)) stack++;
        else if (txt.startsWith(END_TAG)) {
            stack--;
            if (stack === 0) return i;
        }
    }
    return -1;
}

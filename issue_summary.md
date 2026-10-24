# Obsidian Toggle Plugin - Indentation Issue Summary

## 🎯 Goal
Implement visual indentation for nested toggle content that affects **both text and block-level styling** (background colors, underlines, borders).
- **Requirement:** When a block is indented, the entire visual element (including Header underlines or Code Block backgrounds) should shift right.

## 🛠️ Attempts & Results

### 1. Padding Strategy (`padding-left`)
- **Method:** Applied `padding-left: 24px` to the `.cm-line` element via `Decoration.line`.
- **Result:**
    - Text indented correctly.
    - ❌ **Fail:** Background colors (e.g., Code Blocks) "bled" into the indentation area because CSS `padding` is part of the background.
    - ❌ **Fail:** Header underlines (`border-bottom`) extended through the padding area.

### 2. Padding + Background Clip (`padding-left` + `background-clip: content-box`)
- **Method:** Added `background-clip: content-box` to clip the background painting.
- **Result:**
    - ✅ **Success:** Background color no longer bled into the padding.
    - ❌ **Fail:** Header underlines (`border-bottom`) still extended to the left edge because borders ignore `background-clip`.

### 3. Spacer Widget Strategy (Inline Widget)
- **Method:** Inserted a transparent `<span>` widget with `width: 24px` at the start of the line content.
- **Result:**
    - ✅ **Success:** Text and list markers (`-`, `1.`) pushed right correctly.
    - ❌ **Fail:** Block-level styles (Backgrounds, Underlines) did not move because the line container itself wasn't shifted; only the internal content was pushed.

### 4. Margin Strategy (`margin-left` + `width: calc`)
- **Method:** Applied `margin-left: 24px` and `width: calc(100% - 24px)` to the `.cm-line`.
- **Result:**
    - Intended to shift the entire box ("Box Model").
    - **Current Issue:** In Obsidian/CodeMirror 6, manipulating the `.cm-line` dimensions heavily can conflict with the editor's measuring/layout engine, potentially causing the indentation to be ignored or layout to break.

---

## 📂 Files to Share (Context for AI)

Provide these files to help understand the current implementation:

1.  **`styles.css`**: Defines the indentation classes (`.toggle-indent-N`) and the `ToggleWidget` styling.
2.  **`editor_extension.ts`**: Contains the `ViewPlugin` logic that calculates nesting levels (O(N) algorithm) and applies `Decoration.line` or `Decoration.widget`.
3.  **`manifest.json`**: Basic plugin metadata.

### Specific Question to Ask:
"I am developing an Obsidian Plugin using CodeMirror 6. I need to indent specific lines (using `Decoration.line`) such that **the entire visual block shifts right**, including `border-bottom` (Header underlines) and `background-color` (Code blocks). I tried `padding-left` (borders don't shift) and `margin-left` (layout issues). What is the correct way to strictly indent the full `cm-line` box in CodeMirror 6 context?"

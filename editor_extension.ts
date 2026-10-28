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
    Transaction
} from "@codemirror/state";
import {
    foldService,
    foldEffect,
    unfoldEffect,
    foldedRanges
} from "@codemirror/language";
import { getIcon, Notice } from "obsidian";

// Constants
const START_TAG = "|>"; // [Reverted] 엄격한 공백 요구 제거
const END_TAG = "<|";
// const INDENT_STEP Removed

// [PRD 3.1.1] 시작 위젯 (삼각형)
class ToggleWidget extends WidgetType {
    constructor(
        readonly isFolded: boolean,
        readonly foldStart: number,
        readonly foldEnd: number,
        readonly invisible: boolean = false, // [New] 삼각형 숨김 옵션 (Header Toggle 등)
        readonly isCodeBlock: boolean = false // [New] 코드 블록 전용 확인
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = createSpan({ cls: "toggle-widget" });
        if (this.isCodeBlock) {
            span.classList.add("toggle-codeblock");
        }

        if (this.invisible) {
            span.classList.add("u-hidden"); // [Refactor] 인라인 스타일 대신 클래스 사용
        } else {
            span.textContent = this.isFolded ? "▶" : "▼";
            // 커서 처리는 CSS (.toggle-widget)가 담당

            span.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (this.isFolded) {
                    view.dispatch({
                        effects: unfoldEffect.of({ from: this.foldStart, to: this.foldEnd })
                    });

                    // [Fix] 더미 수정: 공백 삽입 후 즉시 삭제하여 HyperMD 재파싱 유도
                    // Syntax Highlighting 깨짐 방지를 위한 "치트키"
                    window.setTimeout(() => {
                        const pos = this.foldEnd;
                        view.dispatch({
                            changes: { from: pos, insert: " " },
                            annotations: Transaction.addToHistory.of(false)
                        });

                        window.setTimeout(() => {
                            view.dispatch({
                                changes: { from: pos, to: pos + 1, insert: "" },
                                annotations: Transaction.addToHistory.of(false)
                            });
                        }, 5);
                    }, 5);
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

// [PRD 3.1.3] 복사 위젯 (우상단)
// -> 접힘 상태(isFolded)를 받아 접혔을 때는 크기를 줄이고 한 줄 높이 중앙에 정렬
class CopyWidget extends WidgetType {
    constructor(
        readonly startLineNo: number,
        readonly endLineNo: number,
        readonly alwaysVisible: boolean = false,
        readonly language: string = "", // [New] 언어 라벨 (예: "python")
        readonly isFolded: boolean = false // [PRD 3.1.3] 접힘 상태 (컴팩트 복사 버튼 스타일 적용용)
    ) {
        super();
    }

    eq(other: CopyWidget): boolean {
        return this.startLineNo === other.startLineNo &&
            this.endLineNo === other.endLineNo &&
            this.alwaysVisible === other.alwaysVisible &&
            this.language === other.language &&
            this.isFolded === other.isFolded;
    }

    toDOM(view: EditorView): HTMLElement {
        const span = createSpan();

        // [New] 언어 뱃지 스타일링 분기
        if (this.language) {
            span.className = "toggle-lang-badge"; // 네모난 뱃지 스타일
            if (this.isFolded) {
                span.classList.add("is-folded");
            }
            span.textContent = this.language;
            span.title = "Click to copy"; // 툴팁 추가
        } else {
            span.className = "toggle-copy-btn";
            if (this.alwaysVisible) {
                span.classList.add("always-visible");
            }
            if (this.isFolded) {
                span.classList.add("is-folded");
            }

            // Obsidian 네이티브 아이콘 사용
            const iconInfo = getIcon("copy");
            if (iconInfo) {
                span.appendChild(iconInfo);
            } else {
                span.textContent = "Copy";
            }
        }


        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 로직: 시작 태그와 종료 태그 사이의 내용을 복사
            const doc = view.state.doc;

            // 안전 검사: 비어있거나 즉시 닫힌 경우
            if (this.endLineNo <= this.startLineNo + 1) {
                void navigator.clipboard.writeText("");
                return;
            }

            // 내용은 startLine + 1 부터 시작
            // 내용은 endLine - 1 에서 종료
            const fromPos = doc.line(this.startLineNo + 1).from;
            const toPos = doc.line(this.endLineNo - 1).to;

            // sliceString은 줄바꿈을 보존함
            const text = doc.sliceString(fromPos, toPos);
            void navigator.clipboard.writeText(text).then(() => {
                new Notice("Copied to clipboard");
            }).catch((err) => {
                console.error("Failed to copy: ", err);
                new Notice("Copy failed");
            });
        };
        return span;
    }

    ignoreEvent(): boolean { return true; }
}

// [Updated] 종료 위젯 (가로선 또는 에러 표시)
class EndTagWidget extends WidgetType {
    constructor(readonly pos: number, readonly indentPx: number, readonly isError: boolean = false) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = createSpan();

        if (this.isError) {
            span.className = "toggle-end-error";
            span.textContent = "<| (unmatched)";
        } else {
            span.className = "toggle-end-widget";
            // 정상: CSS로 처리되어 보임 (가로선)
        }

        // 클릭 시 커서 위치 설정을 허용
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

class HeaderHashWidget extends WidgetType {
    toDOM(view: EditorView): HTMLElement {
        return createSpan({ cls: "toggle-header-hash-widget" });
    }
}

// [Refactor] SpacerWidget 제거됨
// class SpacerWidget extends WidgetType { ... }

// Helper: 스택 카운팅 (Stack Counting)
function findMatchingEndLine(doc: Text, startLineNo: number): number {
    let stack = 1;
    for (let i = startLineNo + 1; i <= doc.lines; i++) {
        const lineText = doc.line(i).text; // [PRD 2.1.1] 공백 없는 엄격한 줄 시작 검사
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

// [PRD 3.1.3] 특정 줄이 토글 블록 내부에 속하는지 검사
// -> 위쪽으로 스캔하여 닫히지 않은 START_TAG가 있는지 탐색 (Eco-Friendly)
function isLineInsideToggle(state: EditorState, lineNo: number): boolean {
    let stack = 0;
    const minLine = Math.max(1, lineNo - 500);
    for (let i = lineNo; i >= minLine; i--) {
        const text = state.doc.line(i).text; // [PRD 2.1.1] 공백 없는 엄격한 줄 시작 검사
        if (text.startsWith(END_TAG)) {
            if (i !== lineNo) stack++;
        } else if (text.startsWith(START_TAG)) {
            if (stack === 0) return true;
            stack--;
        }
    }
    return false;
}

// 1. 접기 서비스 (Fold Service) - 범위 제한 헤더 지원 강화
const notionFoldService = foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
    const line = state.doc.lineAt(lineStart);
    const text = line.text;

    // Case 1: 토글 접기 (|> ...)
    if (text.startsWith(START_TAG)) {
        const endLineNo = findMatchingEndLine(state.doc, line.number);
        if (endLineNo !== -1) {
            const nextLine = state.doc.line(endLineNo);
            return { from: line.to, to: nextLine.to };
        }
    }

    // Case 2: 제한된 헤더 접기 (|> 내부의 ## ...)
    // 목표: 헤더 접기가 토글의 종료 태그(<|)를 먹어버리지 않도록 방지
    if (text.trimStart().startsWith("#")) {
        // 1. 헤더 레벨 식별
        const match = text.match(/^(#+)\s/);
        if (!match) return null;
        const headerLevel = match[1].length;

        // 2. 접기 끝지점을 찾기 위해 아래로 스캔
        const doc = state.doc;
        let endLineNo = -1;

        // 현재 스코프(토글) 내에서의 짝을 찾기 위해 Stack 추적
        // 단순 스캔:
        // - 같은 레벨 이하의 헤더를 만나면 -> 중단 (기본 헤더 동작)
        // - <| 를 만나면 -> 이 <| 가 현재 헤더 내부에서 열린 토글을 닫는 것이 아니라면, 상위 토글 종료임.

        let toggleStack = 0; // 이 헤더 블록 내부에서 시작된 토글 개수 추적

        for (let i = line.number + 1; i <= doc.lines; i++) {
            const nextLineText = doc.line(i).text;

            // A. 중첩 토글 확인
            if (nextLineText.startsWith(START_TAG)) {
                toggleStack++;
            }
            else if (nextLineText.startsWith(END_TAG)) {
                if (toggleStack > 0) {
                    toggleStack--; // 중첩된 토글 종료, 계속 진행
                } else {
                    // B. 상위 문맥을 종료하는 <| 발견
                    // 하드 스탑. 헤더는 부모 토글을 침범할 수 없음.
                    endLineNo = i - 1; // 종료 태그 바로 윗줄에서 멈춤
                    break;
                }
            }

            // C. 다음 헤더 확인
            // 중첩 토글 내부가 아닐 때만 유효함
            // CodeMirror 표준: 헤더는 동일 레벨 이상의 다음 헤더에서 멈춤
            const nextHeaderMatch = nextLineText.match(/^(#+)\s/);
            if (nextHeaderMatch) {
                const nextLevel = nextHeaderMatch[1].length;
                if (nextLevel <= headerLevel) {
                    endLineNo = i - 1;
                    break;
                }
            }
        }

        // 유효한 끝 지점을 찾았다면 (헤더 자신만이 아닐 경우)
        if (endLineNo > line.number) {
            return { from: line.to, to: doc.line(endLineNo).to };
        }
    }

    // Case 3: 코드 블록 토글 (Toggle Code Block)
    // 요구사항: "```>", "```python>", "```python >" (끝이 >) 지원
    const trimmed = text.trimStart();

    // 정규식: 백틱/틸드 3개 시작, 내용 불문, 끝이 > (공백 허용)
    const backtickMatch = trimmed.match(/^`{3}.*>\s*$/);
    const tildeMatch = trimmed.match(/^~{3}.*>\s*$/);

    if (backtickMatch || tildeMatch) {
        const isBacktick = !!backtickMatch;
        // isTilde 제거됨 (미사용)
        const endToken = isBacktick ? "```" : "~~~";

        let codeBlockEndLine = -1;
        for (let i = line.number + 1; i <= state.doc.lines; i++) {
            const nextLineText = state.doc.line(i).text.trimStart();
            // 닫는 펜스 시작 확인 (주로 ``` 또는 ~~~)
            // 구분자 타입이 일치해야 함
            if (nextLineText.startsWith(endToken)) {
                codeBlockEndLine = i;
                break;
            }
        }

        if (codeBlockEndLine !== -1) {
            const endLine = state.doc.line(codeBlockEndLine);
            return { from: line.to, to: endLine.to };
        }
    }

    return null;
});



// [Simplified] 토글 플러그인 (들여쓰기 로직 제외됨)
const togglePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            let shouldUpdate = update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.effects.some((e: StateEffect<unknown>) => e.is(foldEffect) || e.is(unfoldEffect)));

            // [PRD 3.1.3] 선택 영역 변경 시 토글 및 복사 버튼 상태 업데이트 (네이티브 코드블록 통일)
            // -> 토글 태그 터치 시 원본 텍스트 전환 및 토글 내부 편집/작성 시 복사 버튼 숨김 제어
            if (!shouldUpdate && update.selectionSet) {
                const hasOverlap = (state: EditorState) => {
                    for (const range of state.selection.ranges) {
                        const line = state.doc.lineAt(range.head);
                        const text = line.text;
                        // START_TAG를 터치하면 원본 텍스트를 보여주기 위해 리렌더링 필요
                        if (text.startsWith(START_TAG)) return true;
                        // 코드 블록 토글 확인 (견고성)
                        if ((text.startsWith("```") || text.startsWith("~~~")) && /^(```|~~~).*>\s*$/.test(text.trimStart())) return true;
                        // 종료 태그도 JS 교체를 사용하므로 모니터링 필요
                        if (text.startsWith(END_TAG)) return true;
                        // 토글 내부 편집/작성 감지 -> 복사 버튼 실시간 표시/숨김 반응
                        if (isLineInsideToggle(state, line.number)) return true;
                    }
                    return false;
                };

                const prevOverlap = hasOverlap(update.startState);
                const currOverlap = hasOverlap(update.state);

                if (prevOverlap !== currOverlap || currOverlap) {
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

            // --- A. 들여쓰기 로직 (Indentation Logic O(N)) ---
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

            // --- B. 데코레이션 생성 (Build Decorations) ---
            let currentLevel = 0;
            // prevLevel 제거됨 (미사용)
            // 고아 태그(Orphan) 감지 스택
            let runningStack = 0;
            let inCodeBlock = false; // [New] 코드 블록 상태 추적

            for (let i = 1; i <= lineCount; i++) {
                currentLevel += diff[i];
                const line = doc.line(i);
                const text = line.text;
                const trimmedText = text.trimStart(); // [Updated] 견고한 검사

                // 1. 배경 강조 (Notion Callout 스타일)
                if (currentLevel > 0) {
                    const safeLevel = Math.min(currentLevel, 8); // [Updated] 최대 8레벨 제한
                    let classNames = `toggle-bg toggle-bg-level-${safeLevel}`;

                    // [PRD 2.1.1] 줄 첫 시작에 공백 없이 |> 가 올 때만 토글 상단 라운딩
                    if (text.startsWith(START_TAG)) {
                        classNames += " toggle-round-top";

                        // [PRD 2.4.1] 접힘 상태 시 첫 줄 4면 라운딩 (캡슐 형태)
                        // -> 접혔을 때는 첫 줄만 남으므로 toggle-round-bot을 함께 적용해 아래쪽 모서리도 둥글게 처리
                        const endLineNo = findMatchingEndLine(doc, i);
                        if (endLineNo !== -1) {
                            const foldStart = line.to;
                            const foldEnd = doc.line(endLineNo).to;
                            let isFolded = false;
                            ranges.between(foldStart, foldEnd, (from, to) => {
                                if (from === foldStart && to === foldEnd) isFolded = true;
                            });
                            if (isFolded) {
                                classNames += " toggle-round-bot toggle-folded";
                            }
                        }

                        // [PRD 2.5.1] 헤더 지원 (예: |> # 제목 또는 |># 제목)
                        // -> 헤더 토글은 toggle-header-line, 일반 토글은 toggle-standard-line 부여
                        try {
                            const contentAfter = text.slice(START_TAG.length);
                            // 정규식: 선택적 공백으로 시작, 1-6개 샵, 그 다음 공백 또는 줄 끝
                            const headerMatch = contentAfter.match(/^\s*(#{1,6})(?:\s|$)/);

                            if (headerMatch) {
                                const level = headerMatch[1].length;
                                // 옵시디언 네이티브 헤더 클래스 + 헤더 토글 식별 클래스
                                classNames += ` toggle-header-line cm-header cm-header-${level} HyperMD-header HyperMD-header-${level}`;

                                // [Refined] 선택되지 않았을 때만 샵(#) 숨기기 (줄 단위 검사)
                                // "커서가 다른 곳에 있을 때만 숨김" -> IME 입력 시 안전함
                                let isLineSelected = false;
                                for (const r of selection.ranges) {
                                    // 전체 줄 범위와의 겹침 확인
                                    if (r.to >= line.from && r.from <= line.to) {
                                        isLineSelected = true;
                                        break;
                                    }
                                }

                                if (!isLineSelected) {
                                    // 교체를 위한 정확한 범위 계산 (줄 시작 공백 없음)
                                    const hashStart = line.from + START_TAG.length + headerMatch.index!;
                                    const hashEnd = hashStart + headerMatch[0].length;

                                    // 경계 안전 검사
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
                            } else {
                                // [PRD 3.1.3] 일반 토글 식별 클래스 (자체 삼각형 사용 -> > 및 ... 숨김 대상)
                                classNames += " toggle-standard-line";
                            }
                        } catch {
                            // 에디터 안정성을 위해 조용히 실패
                            classNames += " toggle-standard-line";
                        }
                    }

                    // [PRD 2.1.3] 줄 첫 시작에 공백 없이 <| 가 올 때만 토글 하단 라운딩
                    if (text.startsWith(END_TAG)) {
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

                // 다음 반복을 위해 prevLevel 업데이트 (제거됨)

                // [Modified] 코드 블록 추적 (가드 전용)
                // 코드 블록 내부의 |> 무시를 위해 상태만 추적.
                // 시각화/접기는 옵시디언 네이티브 기능에 맡김.
                // [Modified] 코드 블록 추적 및 토글 위젯
                if (trimmedText.startsWith("```") || trimmedText.startsWith("~~~")) {
                    // [Updated] 정규식: 언어 이름 캡처 그룹 추가 (.*?)
                    const match = trimmedText.match(/^(?:```|~~~)(.*?)>\s*$/);
                    const isCodeBlockToggle = !!match;

                    if (!inCodeBlock && isCodeBlockToggle && match) {
                        // 언어 추출 및 정제
                        const language = match[1].trim();

                        // Key: 접기를 활성화하려면 닫는 펜스를 찾아야 함
                        // foldService와 유사한 로직 재사용
                        const endToken = trimmedText.startsWith("```") ? "```" : "~~~";
                        let codeBlockEndLine = -1;

                        // 닫는 펜스를 찾기 위해 전방 탐색
                        for (let k = i + 1; k <= lineCount; k++) {
                            const nextLineText = doc.line(k).text.trimStart();
                            if (nextLineText.startsWith(endToken)) {
                                codeBlockEndLine = k;
                                break;
                            }
                        }

                        let isFolded = false;
                        if (codeBlockEndLine !== -1) {
                            const foldStart = line.to;
                            const foldEnd = doc.line(codeBlockEndLine).to;
                            ranges.between(foldStart, foldEnd, (from, to) => {
                                if (from === foldStart && to === foldEnd) isFolded = true;
                            });
                        }

                        // [PRD 3.1.3] 코드블록 토글 라인 식별 클래스
                        // [PRD 2.4.1] 접힘 상태일 때 아래쪽 모서리도 둥글게(toggle-round-bot) 처리
                        let codeBlockClass = "toggle-codeblock-line";
                        if (isFolded) {
                            codeBlockClass += " toggle-round-bot toggle-folded";
                        }

                        decos.push({
                            from: line.from,
                            to: line.from,
                            deco: Decoration.line({
                                class: codeBlockClass
                            })
                        });

                        // [New Feature] 코드 블록 토글용 삼각형 렌더링
                        const indentLen = text.length - trimmedText.length;
                        const rangeFrom = line.from + indentLen;
                        const rangeTo = rangeFrom + trimmedText.length; // 태그 범위

                        if (codeBlockEndLine !== -1) {
                            const foldStart = line.to;
                            const foldEnd = doc.line(codeBlockEndLine).to;

                            // [New Feature] 코드 블록 토글용 복사 버튼 추가
                            // 언어(language)가 있으면 전달 -> 뱃지로 렌더링됨
                            // [Fix] Ghost Text: 편집 중인 줄(커서가 있는 줄)에는 표시하지 않음
                            let isLineActive = false;
                            for (const r of selection.ranges) {
                                if (r.head >= line.from && r.head <= line.to) {
                                    isLineActive = true;
                                    break;
                                }
                            }

                            if (!isLineActive || !language) { // 언어가 없으면(아이콘) 항상 표시(CSS 제어), 언어가 있으면 활성 상태 아닐때만 표시
                                decos.push({
                                    from: line.to,
                                    to: line.to,
                                    deco: Decoration.widget({
                                        widget: new CopyWidget(i, codeBlockEndLine, true, language, isFolded),
                                        side: 1
                                    })
                                });
                            }

                            // [PRD 2.5.2] 코드블록 토글 Reveal 체크:
                            // -> 커서가 첫 번째 백틱과 '>' 사이(내부)에 포커스되거나, 드래그 선택 영역이 태그 내부와 겹칠 때만 원본 텍스트 노출
                            // -> 세모 바로 왼쪽(rangeFrom)이나 바로 오른쪽(rangeTo) 클릭/포커스 시에는 세모 모양 유지
                            let isSelected = false;
                            for (const r of selection.ranges) {
                                if (r.empty) {
                                    // 커서(캐럿)인 경우: 첫 번째 백틱(`)과 마지막(>)의 사이 내부를 포커스할 때만 모양 변환
                                    if (r.head > rangeFrom && r.head < rangeTo) {
                                        isSelected = true;
                                        break;
                                    }
                                } else {
                                    // 드래그 선택인 경우: 태그 내부 영역과 겹칠 때 노출
                                    if (r.from < rangeTo && r.to > rangeFrom) {
                                        isSelected = true;
                                        break;
                                    }
                                }
                            }

                            if (!isSelected) {
                                decos.push({
                                    from: rangeFrom,
                                    to: rangeTo,
                                    deco: Decoration.replace({
                                        widget: new ToggleWidget(isFolded, foldStart, foldEnd, false, true), // isCodeBlock = true
                                        inclusive: true
                                    })
                                });
                            }
                        }
                    }

                    inCodeBlock = !inCodeBlock;
                    continue;
                }

                // 코드 블록 내부라면 처리 건너뛰기 (|>가 토글로 작동하는 것 방지)
                if (inCodeBlock) continue;

                // 2. 시작 위젯 ("|>" -> 삼각형, 줄 맨 처음에 공백 없이 시작해야 함)
                if (text.startsWith(START_TAG)) {
                    runningStack++; // 스택 푸시

                    const rangeFrom = line.from;
                    const rangeTo = rangeFrom + START_TAG.length;

                    // [PRD 2.2.1] 세모 위젯 Reveal 체크:
                    // -> 커서가 정확히 '|'와 '>' 사이(중간)에 있거나, 드래그 선택 영역이 태그 내부와 겹칠 때만 원본 |> 노출
                    // -> 세모 바로 왼쪽(line.from)이나 바로 오른쪽(line.from + 2) 클릭 시에는 세모 모양 유지
                    let isSelected = false;
                    for (const r of selection.ranges) {
                        if (r.empty) {
                            // 커서(캐럿)인 경우: 정확히 '|'와 '>' 사이(rangeFrom + 1)에 있을 때만 모양 변환
                            if (r.head === rangeFrom + 1) {
                                isSelected = true;
                                break;
                            }
                        } else {
                            // 드래그 선택인 경우: 태그 내부 영역과 겹칠 때 노출
                            if (r.from < rangeTo && r.to > rangeFrom) {
                                isSelected = true;
                                break;
                            }
                        }
                    }

                    // [New Feature] 헤더 지원: 헤더인 경우 삼각형 숨기기
                    // |> 뒤 내용을 파싱하여 헤더 확인
                    const contentAfter = text.slice(START_TAG.length);
                    const isHeader = /^\s*(#{1,6})(?:\s|$)/.test(contentAfter);

                    // 선택되지 않았을 때만 교체
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
                                    widget: new ToggleWidget(isFolded, foldStart, foldEnd, isHeader, false), // isHeader를 invisible 플래그로 전달, isCodeBlock = false
                                    inclusive: true
                                })
                            });
                        }
                    }
                }

                // 3. 종료 위젯 ("<|" -> 스마트 표시, 줄 맨 처음에 공백 없이 시작해야 함)
                if (text.startsWith(END_TAG)) {
                    const rangeFrom = line.from;
                    const rangeTo = rangeFrom + END_TAG.length;

                    // 고아 확인
                    const isOrphan = (runningStack === 0);
                    if (!isOrphan) {
                        runningStack--;
                    }

                    // 클릭/선택 시 보이기
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

                // [PRD 3.1.3] 복사 위젯: 네이티브 코드블록과 동일한 동작
                // -> 평소(접힘/펼침)에는 보이고, 토글 블록 내부를 편집(작성)할 때는 숨김
                if (text.startsWith(START_TAG)) {
                    const endLineNo = findMatchingEndLine(doc, i);

                    if (endLineNo !== -1) {
                        const foldStart = line.to;
                        const foldEnd = doc.line(endLineNo).to;

                        let isFolded = false;
                        ranges.between(foldStart, foldEnd, (from, to) => {
                            if (from === foldStart && to === foldEnd) isFolded = true;
                        });

                        const toggleFrom = line.from;
                        const toggleTo = doc.line(endLineNo).to;

                        // 사용자가 토글 블록(시작줄~종료줄)을 편집/작성 중인지 확인
                        let isEditing = false;
                        for (const r of selection.ranges) {
                            if (r.to >= toggleFrom && r.from <= toggleTo) {
                                isEditing = true;
                                break;
                            }
                        }

                        // 접혀있을 때는 항상 표시(접힌 상태에서도 복사 가능),
                        // 펼쳐져 있을 때는 편집(작성) 중이 아닐 때만 표시
                        const shouldShowCopy = isFolded || !isEditing;

                        if (shouldShowCopy) {
                            decos.push({
                                from: line.to, // 줄 끝에 추가
                                to: line.to,
                                deco: Decoration.widget({
                                    widget: new CopyWidget(i, endLineNo, true, "", isFolded),
                                    side: 1
                                })
                            });
                        }
                    }
                }

            }

            // [PRD 3.1.3] 데코레이션 정렬 (Line Decoration 우선 정렬로 RangeSetBuilder 오류 방지)
            decos.sort((a, b) => {
                if (a.from !== b.from) return a.from - b.from;
                const aSpec = a.deco.spec as { class?: string } | undefined;
                const bSpec = b.deco.spec as { class?: string } | undefined;
                const aIsLine = a.from === a.to && !!aSpec?.class;
                const bIsLine = b.from === b.to && !!bSpec?.class;
                if (aIsLine && !bIsLine) return -1;
                if (!aIsLine && bIsLine) return 1;
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

// [PRD 2.1.2] Instant Auto-Close Keymap (Trigger on '>')
// -> "Instant Reaction": 완성되는 순간 즉시 발동
const instantToggleKeymap = Prec.highest(keymap.of([{
    key: ">",
    run: (view: EditorView) => {
        const state = view.state;
        const ranges = state.selection.ranges;
        if (ranges.length !== 1) return false;

        const range = ranges[0];
        if (!range.empty) return false;

        const pos = range.head;
        const line = state.doc.lineAt(pos);
        const lineText = line.text;

        // Check 1: Is the character before cursor '|'?
        const prevChar = state.doc.sliceString(pos - 1, pos);
        if (prevChar !== "|") return false;

        // [PRD 2.1.1] 행의 첫 시작 부분에 공백/문자 없이 오직 '|'만 있어야 함 (띄어쓰기 후 |> 발동 방지)
        const textBefore = lineText.slice(0, pos - line.from); // 줄 시작부터 커서까지의 텍스트
        if (textBefore !== "|") return false;

        // Action: Insert ">" manually + expansion
        // Result:
        // |>
        // (cursor)
        // <|
        const insertText = ">\n\n<|";

        // Transaction
        view.dispatch({
            changes: { from: pos, insert: insertText },
            selection: { anchor: pos + 1 }, // Position after ">" (Inside the title)
            scrollIntoView: true
        });

        return true;
    }
}]));

export const toggleExtension: Extension = [
    notionFoldService,
    togglePlugin,
    instantToggleKeymap
];

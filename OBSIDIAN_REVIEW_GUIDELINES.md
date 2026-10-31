# Obsidian 플러그인 심사 가이드라인 및 코딩 체크리스트
> 이 문서는 Obsidian 공식 커뮤니티 플러그인 자동 감사(Scorecards / Automated Scan) 및 공식 코드 리뷰에서 지적받은 사항들을 정리한 가이드라인입니다.  
> 코드 작성 및 AI 협업 시 본 문서를 기준으로 검토하여 동일한 지적을 사전에 방지합니다.

---

## 📌 핵심 6대 원칙 (Quick Checklist)

1. **CSS: `!important` 절대 금지** → 명시도(Selector Specificity) 증가 또는 CSS 변수로 해결
2. **CSS: 인라인 스타일(`el.style`) 금지** → `styles.css` 클래스 정의 후 `addClass()` 사용
3. **DOM: `document.createElement()` 금지** → Obsidian 내장 `createEl()`, `createDiv()`, `createSpan()` 사용
4. **UI: 설정창에서 HTML 헤딩 태그 직접 생성 금지** → `new Setting(containerEl).setName(...).setHeading()` 사용
5. **TS: `any` 타입 지양 및 엄격한 타입 가드 사용** → `unknown` + 타입 좁히기(Type Narrowing)
6. **Window: 전역 `setTimeout()` 금지** → 팝아웃 창 호환성을 위해 `window.setTimeout()` 사용

---

## 1. CSS & 스타일링 (Styling)

### 1.1. `!important` 사용 금지 (Avoid `!important`)
* **지적 사항:** `Avoid !important — override styles by increasing selector specificity or using CSS variables instead.`
* **이유:** 사용자가 설정한 테마(Minimal, AnuPpuccin 등) 및 커스텀 CSS 스니펫의 오버라이드를 깨뜨림.
* **해결 패턴:**
  ```css
  /* ❌ Bad: 강제 덮어쓰기 */
  .toggle-codeblock-line {
      display: block !important;
  }

  /* ✅ Good: 상위 선택자를 조합하여 명시도(Specificity) 높이기 */
  .markdown-source-view.mod-cm6 .cm-line.toggle-codeblock-line {
      display: block;
  }

  /* ✅ Good: Obsidian CSS 변수 활용 */
  .toggle-widget {
      color: var(--text-normal);
  }
  ```

### 1.2. 인라인 스타일 직접 지정 금지 (No Direct Inline Styles)
* **지적 사항:** `Sets styles directly instead of using CSS classes, setCssProps, or setCssStyles`
* **이유:** 코드 가독성을 저해하고 테마 전환 시 동적 반응이 어려움.
* **해결 패턴:**
  ```typescript
  // ❌ Bad: element.style 직접 조작
  el.style.display = "none";
  el.style.backgroundColor = "red";

  // ✅ Good: CSS 클래스 부여 (가장 권장)
  el.addClass("u-hidden");
  el.classList.add("toggle-active");

  // ✅ Good: 동적 계산값이 불가피할 경우 Obsidian 전용 헬퍼 사용
  setCssStyles(el, { opacity: "0.5" });
  setCssProps(el, { "--toggle-custom-offset": `${offset}px` });
  ```

---

## 2. DOM 생성 및 조작 (DOM Manipulation)

### 2.1. Obsidian 헬퍼 함수 사용 (Use createEl helpers)
* **지적 사항:** `Uses document.createElement instead of Obsidian's createEl helpers`
* **이유:** 옵시디언 환경에 최적화된 헬퍼를 사용하면 코드가 간결해지고 속성/클래스 주입이 안전함.
* **해결 패턴:**
  ```typescript
  // ❌ Bad: 브라우저 기본 DOM API
  const span = document.createElement("span");
  span.className = "toggle-widget";
  container.appendChild(span);

  // ✅ Good: 옵시디언 전용 헬퍼 함수
  const span = createSpan({ cls: "toggle-widget", text: "▶" });
  const div = createDiv({ cls: "toggle-container" });
  const btn = container.createEl("button", { text: "Copy", cls: "toggle-btn" });
  ```

### 2.2. 설정 화면(SettingTab) 헤딩 생성 표준
* **지적 사항:** `For a consistent UI use new Setting(containerEl).setName(...).setHeading() instead of creating HTML heading elements directly.`
* **이유:** 사용자의 테마 및 Obsidian 설정 UI와의 시각적 일관성 유지.
* **해결 패턴:**
  ```typescript
  // ❌ Bad: h2, h3 태그 직접 생성
  containerEl.createEl("h2", { text: "Toggle Settings" });

  // ✅ Good: Obsidian Setting API의 setHeading() 사용
  new Setting(containerEl)
      .setName("Toggle Settings")
      .setHeading();
  ```

---

## 3. TypeScript & 타입 안정성 (Type Safety)

### 3.1. `any` 타입 지양 및 안전한 멤버 접근/호출
* **지적 사항:**
  * `Unsafe call of an error or any typed value`
  * `Unsafe member access on an error or any typed value`
  * `Unsafe assignment of an error or any typed value`
  * `Unexpected any. Specify a different type.`
* **이유:** 런타임 TypeError 방지 및 타입스크립트의 정적 분석 보장.
* **해결 패턴:**
  ```typescript
  // ❌ Bad: any 캐스팅 및 비안전 접근
  const spec = (deco.spec as any).class;
  try { ... } catch (e) {
      console.log(e.message); // e가 any로 추론됨
  }

  // ✅ Good: 명시적 인터페이스 선언 및 타입 좁히기
  interface CustomDecoSpec {
      class?: string;
  }
  const spec = deco.spec as CustomDecoSpec | undefined;
  const className = spec?.class;

  // ✅ Good: 에러 객체 안전 처리
  try { ... } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
  }
  ```

### 3.2. 불필요한 타입 단언 지양 (No Unnecessary Assertions)
* **지적 사항:** `This assertion is unnecessary since it does not change the type of the expression.`
* **해결 패턴:**
  ```typescript
  // ❌ Bad: 이미 boolean인 값에 불필요한 단언
  const isFolded = Boolean(folded) as boolean;

  // ✅ Good: 단순 할당
  const isFolded = Boolean(folded);
  ```

---

## 4. 멀티 윈도우 및 최신 API 호환성 (Compatibility)

### 4.1. 팝아웃 창(Popout Window) 타이머 호환성
* **지적 사항:** `Use 'window.setTimeout()' instead of 'setTimeout()' for popout window compatibility.`
* **이유:** 옵시디언은 노트를 별도 팝아웃 창(분리 윈도우)으로 띄울 수 있음. 전역 `setTimeout`은 메인 창의 타이머에 묶여 창 분리 시 누수/오작동 유발 가능.
* **해결 패턴:**
  ```typescript
  // ❌ Bad: 전역 setTimeout
  setTimeout(() => { ... }, 100);

  // ✅ Good: 명시적 window.setTimeout 또는 Plugin.registerInterval 사용
  window.setTimeout(() => { ... }, 100);
  ```

### 4.2. 설정 검색 API 대응 (Obsidian 1.13.0+)
* **지적 사항:** `This PluginSettingTab does not implement getSettingDefinitions(); its settings will not appear in Obsidian's settings search`
* **해결 패턴:**
  * 설정 탭에서 검색을 지원하도록 `getSettingDefinitions()` API 구현 고려.

---

## 5. 빌드 및 배포 무결성 (Build & Release Integrity)

1. **빌드 산출물 일치 (`main.js`):**
   * GitHub Release에 업로드되는 `main.js`는 저장소의 최신 커밋에서 `npm run build`로 빌드된 결과물과 바이너리 단위로 일치해야 합니다.
2. **레거시 패키지 정리:**
   * `"builtin-modules"` 등 오래된 패키지는 최신 대체 패키지로 교체하거나 번들러 설정으로 정리합니다.
3. **권한 고지 (Disclosures):**
   * 클립보드 접근(`navigator.clipboard.writeText`) 기능은 사용자 편의를 위한 복사 기능에만 안전하게 사용합니다.


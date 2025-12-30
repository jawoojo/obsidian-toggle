import { Plugin } from 'obsidian';
// 방금 만든 스크립트 파일에서 3가지를 다 가져와야 합니다.
import { toggleRangeField, foldStateField, toggleViewPlugin } from './togglePlugin'; 

export default class MyPlugin extends Plugin {
    async onload() {
        console.log("노션 토글 플러그인 로딩됨!");

        // 여기가 제일 중요합니다! 3가지를 배열로 묶어서 등록해야 합니다.
        this.registerEditorExtension([
            toggleRangeField, // 1. 지도 제작자 (ToggleRangeMap)
            foldStateField,   // 2. 상태 관리자 (Set<number>)
            toggleViewPlugin  // 3. 화면 그리는 화가 (ViewPlugin)
        ]);
    }

    onunload() {
        // 플러그인 꺼질 때 정리할 것들 (보통은 비워둬도 됨)
    }
}
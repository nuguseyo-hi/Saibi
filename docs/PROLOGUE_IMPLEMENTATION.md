# 최초의 사도 — 프롤로그 구현 계약

사용자 원문은 [PROLOGUE_BRIEF.md](PROLOGUE_BRIEF.md)다. 최신 변경은 프롤로그의 세 구역을 횡스크롤과 직접 단어 삽입 방식으로 전환한 것이다. 상세 내용은 [SIDE_SCROLL_DUNGEON.md](SIDE_SCROLL_DUNGEON.md)를 따른다.

## 이야기와 유지되는 기능

태양신과 니알라토텝은 별개의 신이다. 금발 인물은 원래 태양신의 이단심문관이며, 프롤로그에서 정체성을 바꾼 뒤 플레이어가 조작하는 최초의 사도가 된다. 검은 로브는 프롤로그의 임시 역할이며 나레이터의 정체는 밝히지 않는다. 태양신이 밤에 응답하지 않는다는 말은 인물과 나레이터의 주장이다.

인형극 창세 신화 → 거절 선택의 강제 수정 → 폐허의 경계도 90/100/0 연출 → 세 질문과 다섯 키워드 → 세 구역 심상던전 → 최종 신념 → 새 이름 → 조작 인물 전환 → 세루스 순서를 유지한다. 세루스는 세 장소 조사와 기존 에밀리아 교회 연결만 구현되어 있다.

## 현재 구조

| 파일 | 책임 |
| --- | --- |
| `src/content/prologue/story.json` | 대화 노드, 메타데이터, 질문, 키워드, 최종 MindEvent, 마을 문구 |
| `src/content/prologue/world.json` | 구역, 오브젝트, 안정적인 편집/결과 ID, 규칙, 나레이션 |
| `src/content/prologue/sideScroll.json` | 발판, 다리, 벽, 직접 조작 슬롯, 이동 수치, 메시지 |
| `src/prologue/content.ts` | 시나리오와 환경 데이터 런타임 검증 |
| `src/prologue/environment.ts` | 기존 환경 규칙과 방 이동 조건 |
| `src/prologue/sideScroll.ts` | 횡스크롤 지형, 직접 편집 해석, 안전 좌표 계산, 데이터 검증 |
| `src/prologue/store.ts` | 진행, 직접 편집, 키워드, 정체성, 저장과 마이그레이션 |
| `src/prologue/SideScrollScene.ts` | Phaser 좌우 이동, 중력, 점프, 카메라, 충돌, 종이 무대 |
| `src/prologue/PrologueDungeon.tsx` | React–Phaser 연결, 단어 띠, 현장 조작 안내, 나레이션, 일시정지 |
| `src/prologue/PrologueApp.tsx` | 타이틀, 인형극, 폐허, 질문, 이름, 역할 전환, 세루스 |
| `src/prologue/prologue.css` | 인형극 및 횡스크롤 UI, 반응형, 연출 감소 |
| `tests/prologue.test.ts`, `tests/sideScroll.test.ts` | 원래 프롤로그 계약 회귀 및 직접 편집/저장/지형 검사 |

`parseScenario`, `getDialogue`, `getNextNode`, 기존 대화 컴포넌트와 `commitDraft`를 재사용한다. 프롤로그는 `MindEditScreen`을 사용하지 않는다. 기존 에밀리아는 `App`, `DungeonScene`, 기존 편집창을 계속 사용한다. 이전 프롤로그 `TextWorld`와 `texts`의 서식 규칙은 과거 계약용으로 남아 있지만 현재 프롤로그 렌더링과 충돌에는 사용하지 않는다.

## 저장과 검증

프롤로그 저장 키는 `saibi.prologue.v1`, 스키마 버전은 1, 현재 콘텐츠 버전은 `first-act-side-2`다. 기존 `first-act-1`은 대화·이벤트·키워드·편집·이름을 유지하고 던전 좌표만 해당 방의 안전한 입구로 옮긴다. 손상·알 수 없는 저장은 읽기 오류를 표시하고 원본을 보존한다. 읽기만으로 저장을 덮어쓰지 않는다. 에밀리아 저장 키는 별도다.

검증 명령은 `npm test`, `npm run build`다. 기존 테스트 45개와 신규 횡스크롤 테스트 7개가 통과했다. 실제 브라우저 조작 도구가 제공되지 않아 점프감·Canvas 화면·포커스 전환의 실플레이 검수는 수행하지 못했다. 기존 Phaser 청크 크기 경고는 빌드를 막지 않는다.

아트는 교체 가능한 임시 SVG와 기존 콜라주 에셋이다. 음악, 완성 일러스트, 전체 마을 경영, 장기 일과 및 다중 엔딩은 이번 변경에 포함하지 않는다.

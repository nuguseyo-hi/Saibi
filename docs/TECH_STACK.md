# 기술 스택과 아키텍처

상태: 전체 아키텍처 설계 제안. React, TypeScript, Vite, Tailwind CSS, Zustand, JSON 시나리오, localStorage 및 서버 없는 싱글플레이는 전체 프로젝트 요구사항이다. 후속 요청으로 타이틀·대화 초기 구현을 추가했다. 아래는 미래 확장을 포함한 제안이며 모든 구조가 현재 구현된 것은 아니다.

## 현재 구현 — 고해성사·사고 편집

실제 작업 저장소는 `/workspace/sites/vespers-play`이며 사이트 프로젝트 ID는 `.openai/hosting.json`에 있다. React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Zustand 5를 유지한다. 추가 런타임 의존성은 없다.

| 파일 | 책임 |
| --- | --- |
| `src/domain/scenario.ts` | 대화/자동 분기 검증, 노드 해석, 고해성사·편집 진입 계약 |
| `src/domain/flags.ts` | 등록된 캐릭터별 불리언 플래그 조건과 setFlag 효과 |
| `src/domain/mind/editing.ts` | 독립적인 편집 데이터 검증, 초안 생성, ID 기반 결과 계산 |
| `src/domain/progress.ts` | 저장 가능한 진행·편집 세션·로그 타입 |
| `src/domain/validation.ts` | JSON 검증 공통 함수 |
| `src/store/gameStore.ts` | 진행 전이, 원자적 확정, 중복 확정 방지, 취소·이어하기 |
| `src/services/storage.ts` | 버전 envelope, localStorage 예외 처리, 저장 데이터·참조 검증 |
| `src/screens/MindEditScreen.tsx` | 초안만 보유하는 정신 침투 화면 |
| `src/components/MemoryRecord.tsx` | 확정된 기억과 원문 비교 |
| `src/content/scenarios/intro.json` | 방문·고해성사·후속 대화 및 선택 효과·플래그 분기 |
| `src/content/mind-scenes/bells.json` | 사고 편집 이벤트, 문장·구간·옵션·결과 ID와 효과 |

### 실제 대화 계약

기존 노드는 그대로 사용할 수 있다. `type` 생략 또는 `dialogue`인 노드는 기존 `next / choices / ending` 중 하나를 갖는다. `presentation: confession`은 고해성사 표시를 정한다. `mindEventId`가 있는 대화 노드에서 진행하면 정신 침투로 전환하고, 확정하면 해당 노드의 `next`로 이동한다. 취소는 같은 진입 대화 노드로 복귀한다.

선택지의 `effects`는 `setFlag(characterId, key, value)` 배열이다. 캐릭터의 `flagKeys`에 등록한 키만 허용한다. `type: branch` 노드는 `branches[{condition, next}]`와 필수 `fallbackNext`를 가진다. 현재 조건은 `flag(characterId, key, equals)`이며 첫 번째 참 조건이 우선이다. 자동 분기 순환을 검증 시 거부한다.

### 실제 편집 계약

이벤트는 `id, characterId, title, description, originalText, sentences, regions`를 갖는다. 문장은 `id, segments[{id,text}]`로 나눈다. 각 region은 `id, type, targetId, originalText, defaultOptionId, options`를 갖는다.

- `replace`는 segment ID를 대상으로 한다. 옵션에는 `id, label, text, resultId, effects`가 있다. `label`은 선택어(계시), `text`는 문장에 삽입할 활용형(계시였)이다. 단순 문자열 전체 치환이나 자동 조사 추론을 사용하지 않는다.
- `delete`는 sentence ID를 대상으로 한다. 유지 옵션의 text는 원문, 삭제 옵션의 text는 빈 문자열이다. 편집 중에는 취소선 흔적을 표시하고 결과의 sentences/afterText에서는 삭제 문장을 제외한다. beforeText는 비교용 원문으로 보존한다.
- 각 구간의 옵션들은 동일한 플래그 집합을 명시적으로 true/false 설정한다. 다른 구간과 효과 키 충돌, 다른 캐릭터에 대한 효과, 중첩 편집 대상을 거부한다.
- 원문·계시·착각은 각각 `bells_coincidence / bells_revelation / bells_illusion`, 문장 유지·삭제는 `fear_retained / fear_erased`다. 이벤트별 결과 ID는 유일하다.

### 실행 상태와 저장

`screen, nodeId, activeCharacterId, characterFlags, editResults, log, activeMind, revision`을 관리한다. `activeMind`에는 session ID, event ID, sourceNodeId가 있다. 편집 초안은 MindEditScreen의 useState에만 존재한다. 확정 액션이 세션·옵션을 재검증하고, 결과/효과/후속 위치를 한 번에 계산해 갱신한다. 오래된 세션 입력과 중복 확정을 무시한다.

localStorage 키는 `nyarlathotep-vn.save.v1`. envelope는 `schemaVersion: 1`, `contentVersion: confession-1`, scenarioId, savedAt, state다. 이전 공개 버전에는 저장 기능이 없어 이전 세이브 마이그레이션은 없다. 지원하지 않는 버전·손상 데이터는 보존하고 이어하기를 막는다. 새 게임으로 교체하기 전 UI에서 확인한다.

새로고침 시 마지막 저장 화면을 자동 복원한다. 편집 화면은 세션만 복원하고 원문 초안을 새로 만든다. 타이틀 이동은 진행 체크포인트를 덮어쓰지 않으며 이어하기로 복귀한다. 쓰기 실패는 메모리 내 진행을 보존하고 재시도 버튼을 제공한다. 저장 성공 전에는 성공 안내를 하지 않는다. 저장소와 origin은 브라우저별로 독립적이다. 여러 탭의 동시 플레이 병합은 지원하지 않는다.

### 초기 설계와의 차이

아래 장기 구조 및 죄책감 JSON은 초기 설계 자료다. 현재 로더에 그대로 넣을 수 있는 예제는 실제 `src/content/` JSON이다. stats, 개인 루트, AND/OR 조건, 별도 결과 화면, 다중 엔딩은 아직 구현하지 않았다.

## 1. 기술 선택

| 기술 | 역할 | 적용 원칙 |
| --- | --- | --- |
| React | 화면과 입력 UI | 게임 규칙을 JSX 내부에 두지 않는다. |
| TypeScript | 노드·조건·편집 연산·상태 계약 | strict 사용 제안. JSON 런타임 검증을 대신하지 않는다. |
| Vite | 개발 서버, 번들, 정적 배포 빌드 | 구현 단계에서 설치한다. |
| Tailwind CSS | 레이아웃·테마·반응형 | 색상·간격·글꼴을 공통 토큰으로 정리한다. |
| Zustand | 실행 중 게임 상태와 명령 | 한 저장소와 선택적 구독으로 시작한다. |
| JSON | 캐릭터 정의, 시나리오, 사고 편집 | 실행 함수·임의 JavaScript를 포함하지 않는다. |
| localStorage | 로컬 세이브 | JSON 직렬화 가능한 게임 상태만 저장한다. |

구현 시점에 호환되는 안정 버전을 선택하고 lockfile에 고정한다. Tailwind와 Vite 연결 방법은 선택한 버전의 공식 방식으로 확인한다. 초기 구현 패키지와 버전은 package-lock.json에 고정되어 있다. 초기에는 라우터, 별도 게임 엔진, 대형 상태 머신, 추가 검증 라이브러리 없이 시작하는 방식을 제안한다. URL을 게임 진행 상태로 사용하지 않는다.

## 2. 제안 폴더 구조

아래는 **향후 구현 구조**다. 현재 구현 파일은 위의 표를 참고한다.

```text
project/
├── AGENTS.md
├── docs/
│   ├── GAME_DESIGN.md
│   ├── TECH_STACK.md
│   └── IMPLEMENTATION_PLAN.md
├── public/assets/
│   ├── backgrounds/
│   └── characters/
├── src/
│   ├── app/                 # App, 화면 선택, 초기 데이터 로딩
│   ├── screens/             # Title, Church, Confession, MindEdit, Result
│   ├── components/
│   │   ├── layout/          # GameViewport, SceneLayout
│   │   ├── scene/           # BackgroundLayer, CharacterSprite, Portrait
│   │   ├── dialogue/        # DialogueBox, SpeakerName, ChoiceList, DialogueLog
│   │   └── mind/            # ThoughtText, EditableRegion, EditActions, EditPreview
│   ├── domain/
│   │   ├── types/           # 콘텐츠와 실행 상태 타입
│   │   ├── conditions/      # 순수 조건 판정
│   │   ├── effects/         # 순수 상태 변화 계산
│   │   ├── dialogue/        # 노드·선택·분기 해석
│   │   ├── mind/            # 편집 검증, 적용, 결과 계산
│   │   └── validation/      # JSON 및 참조 검증
│   ├── store/               # Zustand 상태, 액션, selector
│   ├── services/storage/   # 저장, 불러오기, 버전 처리
│   ├── content/
│   │   ├── manifest.json
│   │   ├── characters/
│   │   ├── scenarios/
│   │   └── mind-scenes/
│   └── styles/              # 전역 스타일과 테마 토큰
└── tests/                   # 구현 단계의 핵심 규칙 검증
```

의존 방향은 `UI → store → domain`, `store → storage`로 제한한다. 콘텐츠 로더는 JSON을 검증한 뒤 읽기 전용 정의를 전달한다. domain은 React, Zustand, 브라우저 저장소를 import하지 않는다. services는 React 컴포넌트를 참조하지 않는다.

캐릭터 추가는 캐릭터 JSON, 시나리오 JSON, 사고 장면 JSON과 에셋을 추가하고 manifest에 등록하는 방식이다. 동일 기능의 새 콘텐츠를 위해 화면 컴포넌트나 공통 엔진을 수정할 필요가 없어야 한다.

## 3. React 구성

| 구성 | 책임 |
| --- | --- |
| `App` / 화면 선택기 | 검증된 상태의 현재 화면 렌더링, 로드 실패 안내 |
| `GameViewport` / `SceneLayout` | 16:9 무대, 레이어, 해상도별 배치 |
| `TitleScreen` | 새 게임·유효한 세이브 이어하기 |
| `ChurchScreen` / `ConfessionScreen` | 같은 대화 구성 재사용, 장면 연출 차이 |
| `BackgroundLayer` / `CharacterSprite` / `Portrait` | 에셋 표시, 누락 시 대체 표현 |
| `DialogueBox` / `SpeakerName` | 대사·화자 표시, 진행 입력 |
| `ChoiceList` | 조건을 만족한 선택지와 입력 처리 |
| `DialogueLog` | 실제 출력된 대화와 선택의 기록 표시 |
| `MindEditScreen` | 편집 세션, 영역 선택, 확정 요청 |
| `ThoughtText` / `EditableRegion` | 문장 조각을 순서대로 렌더링, 지정 영역 선택 |
| `EditActions` / `EditPreview` | 허용 연산·대체어, 확정 전 결과 비교 |
| `ResultScreen` | 확정 결과 표시, 후속 대화 이동 |

콘텐츠의 상태 조건 판정과 증감 계산은 컴포넌트에서 수행하지 않는다. 컴포넌트는 selector가 제공한 표시 모델을 읽고 store 액션을 호출한다. JSON 텍스트는 일반 React 문자열로 출력하고 HTML로 삽입하지 않는다.

## 4. 상태 관리 제안

### 4.1 정의와 실행 상태의 분리

`CharacterDefinition`에는 고유 ID, 이름, 이미지 경로와 초기 상태를 둔다. `CharacterState`에는 실제 상태값, 플래그, 진행과 편집 이력을 둔다. 따라서 '캐릭터 데이터'는 정의와 실행 상태를 합쳐 조회하지만 JSON 원본을 직접 변이시키지 않는다.

| 객체 | 주요 필드 | 저장 여부 |
| --- | --- | --- |
| 콘텐츠 정의 | manifest, characters, scenarios, mindScenes | 세이브에 중복 저장하지 않음 |
| `GameState` | runId, revision, activeCharacterId, characters, flow, dialogueLog | 저장 |
| `CharacterState` | stats, flags, events, route, editHistory, seenEndingIds | 저장 |
| `flow` | 화면/단계별 판별 필드, scenarioId, nodeId, visitId | 저장 |
| `editDraft` | 선택 영역, 연산, 대체어, 미리보기 | 저장하지 않음 제안 |
| UI 상태 | 로그 열림, 포커스, 애니메이션 진행 | 저장하지 않음 |
| 파생 정보 | 선택지 활성 여부, 현재 표시 문장, 엔딩 후보 | 매번 계산 |

`flow`는 화면 이름과 임의의 nullable 필드 묶음 대신 단계별 구분 타입으로 설계한다. 대화에는 현재 노드, 사고 편집에는 세션과 복귀 지점, 결과에는 확정된 결과 스냅샷, 엔딩에는 endingId가 필요하다. 고해성사 화면은 대화 노드의 `presentation`에서 정한다.

`CharacterState` 필드 제안:

- `stats`: affinity, faith, suspicion, egoFracture의 유한 숫자.
- `flags`: 캐릭터 범위의 사전 등록된 불리언 키. 없는 플래그는 false로 해석한다.
- `events`: eventId별 `locked | available | completed`.
- `route`: routeId, scenarioId, currentNodeId, completedScenarioIds. 단순 퍼센트보다 실제 진행 지점을 보관한다.
- `editHistory`: commitId, sessionId, sceneId, operation, targetRegionId, replacementId(치환 시), beforeText, afterText, 실제 적용 효과, contentVersion.
- `seenEndingIds`: 해당 실행에서 확인한 엔딩 ID. 새 게임 간 수집 유지 여부는 미정이다.

이벤트와 루트의 가능한 ID는 콘텐츠에서 선언하고 참조 검증한다. 첫 프로토타입에서는 한 캐릭터만 활성화하지만 `characters[characterId]` 맵을 사용한다.

### 4.2 액션과 진행

제안 액션은 `startNewGame`, `advanceDialogue`, `chooseOption`, `beginMindEdit`, `updateEditDraft`, `confirmEdit`, `continueFromResult`, `loadGame`, `returnToTitle`이다. 화면에서 직접 stats를 set하지 않는다.

전이 흐름:

```text
title → dialogue(church) → dialogue(confession) → mindEdit
                                                   ↓ 확정
ending ← dialogue(afterEdit) ← result(확정 스냅샷)
```

노드 진입 효과는 해당 방문의 전이에서만 한 번 적용한다. React 렌더링이나 마운트 효과에서 적용하지 않는다. `visitId`는 같은 노드를 다시 방문하는 경우와 재렌더링을 구별한다. 복원은 이미 확정된 상태를 읽는 작업이며 진입 효과를 재실행하지 않는다.

`confirmEdit`는 현재 세션, 현재 단계, 대상 영역과 연산·대체어 허용 여부를 다시 확인한다. 순수 도메인 함수가 계산한 상태·플래그·이력·결과·진행 위치를 한 번의 store 갱신으로 반영하고 revision을 증가시킨다. 처리된 sessionId와 현재 flow를 확인하여 더블 클릭·반복 호출 시 효과를 중복 적용하지 않는다. 저장은 이 갱신 뒤 수행한다. 저장 실패가 게임 효과를 재실행하게 해서는 안 된다.

### 4.3 저장 제안

단일 슬롯, 키 `nyarlathotep-vn.save.v1`, 확정된 전이 후 자동 저장을 제안한다. envelope는 `schemaVersion`, `contentVersion`, `savedAt`, `state`로 구성한다. `schemaVersion`은 저장 구조, `contentVersion`은 콘텐츠 ID·규칙 호환성을 뜻한다. 정확한 버전 정책은 저장 단계에서 확정한다.

저장 대상은 대화 진행 위치, 캐릭터 상태·기록, 로그, 현재 단계다. 편집 중 새로고침하면 편집 초안은 버리고 같은 세션의 원문으로 돌아가는 방식을 제안한다. 결과 화면에서 저장되면 확정 스냅샷을 그대로 복원하고 효과를 다시 적용하지 않는다.

불러오기 시 JSON 파싱, 구조·수치·열거값 검사, 캐릭터·노드·장면 ID 참조, schema/content 버전 호환을 검사한다. 지원하는 이전 버전만 명시적으로 변환하고 지원하지 않거나 손상된 세이브는 이어하기를 막고 이유를 알린다. 원본을 조용히 덮어쓰거나 자동 초기화하지 않는다. 새 게임이 기존 슬롯을 교체한다면 UI에서 이를 명확히 안내한다.

localStorage 접근 예외·용량 초과는 저장 실패 상태로 표시하고 메모리 내 플레이는 유지한다. 저장 실패 상태에서 저장되었다고 표시하지 않는다. 자동 저장 중 로그가 길어지는 장기 버전의 보관 상한은 별도 결정한다. 여러 탭의 동시 플레이는 충돌을 알리는 정책을 제안하며 초기 지원 범위는 미정이다.

## 5. 데이터 계약 제안

### 5.1 조건과 효과

조건은 허용 목록 기반 판별 객체로 표현한다.

| `type` | 필드 | 의미 |
| --- | --- | --- |
| `stat` | characterId, key, op, value | 수치 비교. op는 eq/ne/gt/gte/lt/lte |
| `flag` | characterId, key, equals | 기억 플래그 비교 |
| `all` / `any` | conditions | AND / OR |
| `not` | condition | 부정 |
| `event` | characterId, eventId, status | 이벤트 상태 비교 |
| `route` | characterId, routeId | 개인 루트 비교 |

조건 생략은 참으로 정의하는 방식을 제안한다. 빈 all/any는 저작 실수 방지를 위해 거부한다. 임의 문자열 식, eval, Function 생성은 사용하지 않는다.

효과는 `statDelta(characterId, key, amount)`, `setFlag(characterId, key, value)`, `setEvent(characterId, eventId, status)`, `setRoute(characterId, routeId)`를 제안한다. JSON에서는 아래 예시처럼 type과 필드를 가진 객체로 표현한다. 모든 효과는 공통 적용기에서 검증·적용하며 수치 범위 정책은 한 곳에서 처리한다. 편집 이력의 actual 효과는 범위 제한까지 적용한 실제 변화량을 기록한다.

### 5.2 대화 노드

공통 ID는 시나리오 내부에서 유일하고, 외부 참조는 scenarioId와 nodeId를 함께 사용한다. choiceId와 regionId 등도 각 부모 안에서 유일해야 한다.

| 노드 `type` | 주요 필드 | 전이 규칙 |
| --- | --- | --- |
| `dialogue` | id, speaker, text, presentation, choices 또는 next, onEnter | 선택지 또는 다음 노드 |
| `branch` | id, branches[{condition,next}], fallbackNext | 배열 순서상 첫 참 조건, 없으면 fallback |
| `mindEdit` | id, sceneId, next | 편집 확정·결과 확인 후 next |
| `ending` | id, endingId, text | 종료, 엔딩 기록 |

speaker는 characterId 또는 `narrator`, `player` 같은 예약 ID를 사용한다. 선택지는 id, text, condition(선택), effects, next를 갖는다. `choices`와 `next`는 동시에 사용하지 않는다. 조건부 선택지가 전부 사라지는 상태는 검증 오류로 잡거나 무조건 선택지 하나를 둔다. 자동 분기는 명시적 fallback을 필수로 한다. 자동 노드 순환은 검증하고 런타임 전이 횟수에도 제한을 두어 화면이 멈추지 않게 한다.

### 5.3 사고 장면

원문을 문자열 오프셋으로 자르지 않고 `segments` 배열로 관리한다. `text` 세그먼트는 읽기 전용이고 `region` 세그먼트는 regionId와 표시 문자열을 가진다. 삭제 대상은 그 region의 세그먼트 전체다. 문장 삭제는 문장 전체를 region으로 구성한다. 공백·문장부호도 명시적인 텍스트이므로 삭제 후 문장이 자연스러운지는 저작 검수한다.

`regions`는 허용 연산, 치환 옵션과 각 연산의 효과를 선언한다. 삭제 효과는 delete 정의에, 치환 효과는 해당 replacement에 둔다. 클라이언트가 임의 효과나 단어를 만들어 확정하지 못하도록 ID로 정의를 조회한다.

향후 `move`, `connect`, `insert`는 연산 구분 타입과 처리기를 추가한다. 중첩·겹치는 영역, 다중 편집 충돌·순서 규칙은 해당 확장 단계에서 설계하며 현재 지원한다고 가정하지 않는다.

## 6. JSON 예시 — 모두 임시 콘텐츠

아래 블록은 각각 유효한 JSON이며 제안 계약을 설명한다. 이 절은 초기 제안 예시이며 현재 실제 콘텐츠는 별도 JSON 파일에서 관리한다. 0~100 범위, 한 건 편집, 대사, 효과, 엔딩은 승인된 게임 규칙이 아니다.

### 6.1 캐릭터 정의

```json
{
  "id": "elin",
  "name": "엘린",
  "images": {
    "portrait": "/assets/characters/elin-portrait-placeholder.svg",
    "standing": "/assets/characters/elin-standing-placeholder.svg"
  },
  "initialState": {
    "stats": { "affinity": 10, "faith": 0, "suspicion": 10, "egoFracture": 0 },
    "flags": { "blameShifted": false, "blameErased": false },
    "events": { "firstConfession": "available" },
    "route": {
      "routeId": "elin_intro",
      "scenarioId": "elin_01",
      "currentNodeId": "arrival",
      "completedScenarioIds": []
    },
    "editHistory": [],
    "seenEndingIds": []
  }
}
```

### 6.2 시나리오 — 시작부터 두 임시 엔딩까지

```json
{
  "id": "elin_01",
  "characterId": "elin",
  "startNodeId": "arrival",
  "nodes": [
    {
      "id": "arrival",
      "type": "dialogue",
      "presentation": "church",
      "speaker": "elin",
      "text": "잠시 이야기해도 될까요?",
      "next": "confession"
    },
    {
      "id": "confession",
      "type": "dialogue",
      "presentation": "confession",
      "speaker": "elin",
      "text": "그날의 일이 자꾸 떠올라요.",
      "choices": [
        {
          "id": "listen",
          "text": "천천히 말해 보세요.",
          "effects": [
            { "type": "statDelta", "characterId": "elin", "key": "affinity", "amount": 2 }
          ],
          "next": "enter_mind"
        },
        {
          "id": "reassure",
          "text": "이곳에서 잠시 쉬어 가세요.",
          "condition": { "type": "stat", "characterId": "elin", "key": "suspicion", "op": "lte", "value": 20 },
          "effects": [],
          "next": "enter_mind"
        }
      ]
    },
    { "id": "enter_mind", "type": "mindEdit", "sceneId": "elin_guilt", "next": "after_edit" },
    {
      "id": "after_edit",
      "type": "branch",
      "branches": [
        {
          "condition": { "type": "flag", "characterId": "elin", "key": "blameShifted", "equals": true },
          "next": "shifted"
        },
        {
          "condition": { "type": "flag", "characterId": "elin", "key": "blameErased", "equals": true },
          "next": "erased"
        }
      ],
      "fallbackNext": "unchanged"
    },
    {
      "id": "shifted",
      "type": "dialogue",
      "presentation": "church",
      "speaker": "elin",
      "text": "운명이었다면… 이곳에서 그 뜻을 찾을 수 있을까요?",
      "onEnter": [{ "type": "setEvent", "characterId": "elin", "eventId": "firstConfession", "status": "completed" }],
      "next": "end_shifted"
    },
    {
      "id": "erased",
      "type": "dialogue",
      "presentation": "church",
      "speaker": "elin",
      "text": "잘못은 있었어요. 그런데 누구의 잘못이었죠?",
      "onEnter": [{ "type": "setEvent", "characterId": "elin", "eventId": "firstConfession", "status": "completed" }],
      "next": "end_erased"
    },
    {
      "id": "unchanged",
      "type": "dialogue",
      "presentation": "church",
      "speaker": "elin",
      "text": "아직 마음이 무겁네요.",
      "next": "end_unchanged"
    },
    { "id": "end_shifted", "type": "ending", "endingId": "elin_fate", "text": "임시 결말: 운명의 이름" },
    { "id": "end_erased", "type": "ending", "endingId": "elin_blank", "text": "임시 결말: 비어 버린 주어" },
    { "id": "end_unchanged", "type": "ending", "endingId": "elin_unchanged", "text": "임시 기본 경로: 남은 고백" }
  ]
}
```

fallback은 조건에 맞지 않는 상태의 기본 경로 예시다. 무편집 통과를 허용하는 설계 결정은 아니며, 정상적인 최초 편집 흐름에서는 두 편집 결과 중 하나로 이동한다. ending 진입 시 공통 엔진이 endingId와 완료한 scenarioId를 기록하는 방식을 제안한다.

### 6.3 사고 편집 장면

```json
{
  "id": "elin_guilt",
  "characterId": "elin",
  "editLimit": 1,
  "segments": [
    { "type": "text", "text": "그날의 잘못은 " },
    { "type": "region", "regionId": "blame_owner", "text": "나의 " },
    { "type": "text", "text": "탓이다." }
  ],
  "regions": [
    {
      "id": "blame_owner",
      "allowedOperations": ["delete", "replace"],
      "delete": {
        "effects": [
          { "type": "statDelta", "characterId": "elin", "key": "egoFracture", "amount": 10 },
          { "type": "setFlag", "characterId": "elin", "key": "blameErased", "value": true },
          { "type": "setFlag", "characterId": "elin", "key": "blameShifted", "value": false }
        ]
      },
      "replacements": [
        {
          "id": "fate",
          "text": "운명의 ",
          "effects": [
            { "type": "statDelta", "characterId": "elin", "key": "faith", "amount": 10 },
            { "type": "statDelta", "characterId": "elin", "key": "suspicion", "amount": 5 },
            { "type": "setFlag", "characterId": "elin", "key": "blameShifted", "value": true },
            { "type": "setFlag", "characterId": "elin", "key": "blameErased", "value": false }
          ]
        }
      ]
    }
  ]
}
```

예상 결과: 치환은 '그날의 잘못은 운명의 탓이다.'와 `elin_fate`, 삭제는 '그날의 잘못은 탓이다.'와 `elin_blank`로 이어진다. 삭제 후 부자연스러운 문장은 이 예시에서 의도한 공백의 표현이며 정식 대사 검수가 필요하다. 친밀도 선택 후 치환하면 예시 최종 수치는 12/10/15/0, 삭제하면 12/0/10/10이다(친밀도/신앙도/의심도/자아 균열도 순서).

## 7. 데이터·저장 검증과 확장 경계

콘텐츠 로딩 시 필수 필드, ID 중복, 모든 next/start/fallback 참조, speaker/character/scene 참조, region 연결, 연산-옵션 일치, 등록된 플래그·상태 키, 유한 수치, 기본 분기 존재를 검사한다. 에러는 파일·노드·필드 위치를 포함해 개발자가 고칠 수 있게 표시한다. 모든 조건의 도달 가능성을 정적으로 증명할 수는 없으므로 주요 분기는 시나리오 실행 검증을 병행한다.

편집·분기·효과는 순수 함수 단위 검증, 저장 복원은 왕복 검증, 실제 플레이는 브라우저 검증으로 나눈다. 세부 완료 기준은 [개발 계획](IMPLEMENTATION_PLAN.md)에 둔다. 새 기능 추가 시 데이터 버전과 구형 세이브 호환 여부를 함께 검토한다.

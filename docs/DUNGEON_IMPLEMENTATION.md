# 심상던전 구현 계약

사용자 원본 요구는 [DUNGEON_BRIEF.md](DUNGEON_BRIEF.md), 실행 안내는 [README](../README.md)를 참고한다. 이 문서가 이전 단계의 Phaser 제외, 직접 사고 편집 진입, 결과 화면 생략 정책을 대체한다.

## 현재 흐름

기존 타이틀 → 교회 대화와 선택 → 고해성사 `bell_memory` → 경계도/횟수 검사 → `dungeon` → 기억의 입구 → 부정의 복도 → 찢어진 편지의 방 → 종소리의 중심 → 기존 `MindEditScreen` → `dungeonResult` → 결과별 고해성사.

최신 표시는 에밀리아이며 기존 세이브의 캐릭터 키 `elin`을 유지했다. 기존 `elin_bells` 치환·문장 삭제 이벤트와 검증 코드는 남겨 이전 저장/진행을 복원한다. 새로운 핵심 이벤트 `emilia_core`는 요청대로 단어 하나만 치환한다.

## 파일과 책임

| 파일 | 책임 |
| --- | --- |
| `src/dungeon/model.ts` | Phaser/React 없는 타입, 런타임 데이터 검사, 진입 조건, 충돌 가능 위치, 퍼즐 효과, 피격·무적, 저장 검증 |
| `src/dungeon/DungeonScene.ts` | Phaser Scene, 카메라·충돌·이동·문자 적·페이드·콜라주 |
| `src/screens/DungeonScreen.tsx` | Game 생성/해제, HUD·조사·퍼즐·기억 목록·일시정지·결과 |
| `src/content/dungeons/emilia.json` | 네 방, 연결, 적·파편·퍼즐·조건·후속 결과·테스트 수치 |
| `public/assets/dungeon/*.svg` | 종이·스크랩·눈·종·편지·여행자, 원본 임시 아트 |
| `tests/dungeon.test.ts` | 데이터·경로·진입·퍼즐·편집 결과·실패·복원·이관 테스트 |

기존 App/Dialogue는 화면 분기와 진입 활성 상태만 확장했다. `gameStore`, `progress`, `storage`는 던전 진행과 schema-1 마이그레이션을 추가했다. `intro.json`, `bells.json`은 고해성사 연결과 새 핵심 이벤트를 추가했다. Phaser 3.90은 동적 import하므로 타이틀에서 엔진을 먼저 불러오지 않는다.

## React–Phaser 연결

`DungeonBridge`의 read/paused/interact/hit/nearby/checkpoint/sound 콜백을 Scene에 전달한다. React ref가 최신 action/모달 상태를 제공한다. 매 프레임 좌표·적 AI는 Phaser 내부에만 있으며 방 이동, 조사, 파편 획득, 퍼즐 확정, 피격, 결과 확정에만 Zustand를 갱신한다. E 상호작용·일시정지·창 blur/pagehide에도 플레이어 위치를 체크포인트로 기록한다.

비동기 import가 끝나기 전에 언마운트되면 Game을 만들지 않는다. 정상 해제는 `destroy(true)`와 창 리스너 제거, 호스트 정리를 수행한다. Scene 종료는 BLUR 리스너를 해제한다. 방 전환에서는 하나의 Scene을 재시작한다. 모달, 비활성 탭, 캔버스 밖의 포커스에서 physics와 tween·AI를 멈춘다. 키보드 캡처는 전역 스크롤을 차단하지 않고 호스트 포커스 범위에서 방향키 기본 동작을 막는다.

## 데이터 계약

안정적인 문자열 ID로 방·오브젝트·파편·퍼즐·구간을 참조한다. 픽셀 좌표는 각 1600×960 방의 월드 좌표이고 화면은 1280×720 FIT이다. 아래는 실제 데이터에서 발췌한 유효한 JSON 예시다.

```json
{
  "id": "door_rule",
  "title": "문이 믿고 있는 문장",
  "prefix": "이 문은 ",
  "regionId": "door_adverb",
  "original": "절대로",
  "suffix": " 열리지 않는다.",
  "hint": "문장의 시제가 문을 움직인다.",
  "defaultOption": "never",
  "options": [
    {"id":"never","label":"절대로","replacement":"절대로","suffix":" 열리지 않는다.","effect":"closed","delayMs":0},
    {"id":"someday","label":"언젠가는","replacement":"언젠가는","suffix":" 열린다.","effect":"delayed","delayMs":4000},
    {"id":"already","label":"이미","replacement":"이미","suffix":" 열려 있다.","effect":"open","delayMs":0}
  ]
}
```

전체 문자열 검색/치환이 아닌 해당 region의 선택만 변경한다. 활용형을 suffix로 지정하므로 문장이 자연스럽게 변한다. 환경 퍼즐은 이 독립 계약으로 문 상태를 변경하고 최심부 편집은 기존 MindEvent/commitDraft를 재사용한다. 임의 코드나 eval은 없다.

- `rules`: initialGuard/maxGuard/maxAttempts/guardPenalty/stability/immunityMs/playerSpeed/interactionRadius.
- `rooms`: start, obstacles, palette, whispers, objects, enemies. door의 targetRoom/spawn으로 연결한다.
- `objects`: inspect/fragment/puzzle/door/core. requiresPuzzle과 requiresFragments는 AND 조건이다.
- `enemyTypes`: chase/charge, 탐지·속도·충돌 반경·피해·예고·돌진·대기 시간. 복잡한 경로 탐색은 없다.
- `fragments`: 고유 ID·제목·원문. 획득 배열은 중복을 허용하지 않는다.
- `outcome`: resultId에 대응하는 제목·문장·revelation/illusion/unchanged 연출.

## 상태·저장

`Progress.screen`: dialogue/mindEdit/dungeon/dungeonResult. `dungeon`은 ID, 현재 방/위치, 안정도, fragments, inspected, puzzles, status, lastHitAt, outcomeId를 갖는다. `infiltration[characterId]`는 guard/night/attempts를 저장한다. 기존 activeMind 세션과 editResults·characterFlags를 재사용한다. 확정 시 결과·플래그·화면을 한 번 갱신하고 중복 세션 확정을 거부한다.

localStorage 키는 `nyarlathotep-vn.save.v1`을 유지하되 envelope schemaVersion은 2, contentVersion은 `dungeon-1`이다. 이전 schema 1 / `confession-1`의 기록과 플래그를 보존하고 신규 필드만 채운다. 알 수 없는 콘텐츠 버전·잘못된 참조·결과는 거부하며 저장을 덮어쓰지 않는다. 복원할 때 효과를 다시 적용하지 않는다.

임시 퍼즐·핵심 편집 선택은 저장하지 않는다. 새로고침은 마지막 확정 상태로 복원한다. 지연 문은 절대 시각 opensAt을 저장하므로 페이지가 닫힌 동안에도 시간이 흐르며, 탐험 화면 복원 시 만료를 반영한다. 플레이어 위치는 마지막 체크포인트를 사용한다. 단순 이동을 매 프레임 저장하지 않는다.

## 프로토타입의 조정 가능한 기본값

경계도 초기10, 진입20 이하, 밤당2회, 실패+10, 안정도3, 피해1, 무적1000ms. 다음 밤은 테스트용 버튼으로 진행하며 경계도를 초기값과 시도0으로 회복한다. 장기 일정 시스템은 아니다. 파편·확정 퍼즐은 실패/중단/다음 밤에도 유지하고 새 진입은 입구·안정도3에서 시작한다. 중단은 추가 경계도 페널티 없이 이미 사용한 시도를 유지한다. 이 수치와 재도전 정책은 밸런스 확정이 아닌 조정 가능한 프로토타입 기본값이다.

## 아트와 연출

제공된 이미지의 서로 다른 재질, 찢긴 종이, 검붉은색과 청록색 대비, 이질적 원근을 참고했다. 기존 작품 이미지·캐릭터·문양은 사용하지 않고 SVG와 도형으로 구성했다. 서로 다른 scrollFactor의 종이/눈/문장 레이어, 종이 흔들림, 문자 확대·돌진 예고, 방 페이드, 결과의 순간 skew·검은 문장·종 반응을 사용한다. reduced-motion에서는 흔들림·반복 tween·왜곡을 줄인다. 이미지 key와 배치를 분리해 PNG/WebP로 교체할 수 있다. 실제 음원 대신 `vespers:sound` DOM 이벤트 훅만 제공한다.

## 완료 기준과 검증 한계

| 단계 | 구현된 완료 동작 | 검증 |
| --- | --- | --- |
| 통합 | 고해성사 진입, DEV 직접 입장, 현실 복귀 | store 테스트; 실제 Canvas 재진입은 수동 확인 필요 |
| 탐험 | 네 방, 정규화 이동, 벽·경계 충돌, E 조사 | 레이아웃 flood-fill/좌표 테스트; 키보드·카메라는 수동 확인 필요 |
| 적 | 순찰/추적, 예고 돌진, 피격·무적·실패 | 피해/연속피격/재도전 테스트; AI 시각 동작은 수동 확인 필요 |
| 기억/퍼즐 | 세 파편, 두 환경 퍼즐, 최심부 잠금 | 중복·잠금·즉시/지연 문 테스트 |
| 기존 연동 | 취소·확정·세 결과 후속 대사·저장 | 세 결과 end-to-end store 테스트, 이관/복원, 기존 25개 회귀 |
| 연출 | 콜라주·문자·페이드·사운드 훅 | 타입/빌드; 시각·성능 수동 확인 필요 |

총 34개 자동 테스트. 자동 테스트는 순수 규칙과 실제 store/저장 어댑터를 검증하며 실제 브라우저 조작을 대체하지 않는다. 브라우저 도구 부재로 화면 검수·실제 새로고침·StrictMode Canvas 개수·5~10분 플레이 시간은 아직 측정하지 못했다. 최종 아트, 음원, 복잡한 길 찾기, 전투·장비·다중 던전은 범위 밖이다.

## 종소리의 중심 실제 아트 적용

`heart.backgroundImage`에 생성한 `public/assets/dungeon/bell-heart-collage.png`를 지정했다. Phaser가 해당 방 진입 시 이미지를 로드해 월드 배경으로 표시한다. 이 방에서는 기존 임시 배경 장식과 종 SVG를 중복 표시하지 않고, 그림의 종 아래 붉은 실과 바닥 표식에 E 상호작용을 연결한다. 벽 충돌·방 연결·파편 조건·저장 구조는 유지하며 핵심 상호작용 좌표는 (800,620)이다. 배경 로드 실패 시 기존 도형 배경과 종으로 대체한다. 다른 세 방은 기존 콜라주 레이어를 유지한다.

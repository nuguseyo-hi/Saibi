# GitHub Pages 배포

게임 원본은 루트 주소의 기존 사이트에서도 실행되어야 하므로 소스의 에셋 경로는 유지한다. GitHub Pages용 빌드 산출물에만 `/Saibi/` 경로를 적용한다.

```sh
npm ci
npm test
npm run build -- --base=/Saibi/
node scripts/prepare-pages.mjs /Saibi/ dist
```

준비된 `dist`의 내용만 `gh-pages` 브랜치 루트에 올린다. 소스, 백업, 로컬 설정, `node_modules`는 배포 브랜치에 포함하지 않는다. 기존 `gh-pages` 커밋을 부모로 사용하고 강제 푸시는 하지 않는다.

## 비교용 기존 버전

취소선 리워크 직전 버전은 [별도 플레이 주소](https://nuguseyo-hi.github.io/Saibi/original/)에 고정한다. `gh-pages`의 `original/` 디렉터리가 해당 산출물이다. **이후 수정본을 루트에 배포할 때도 `original/`을 보존한다.** 전체 디렉터리를 지우거나 `rsync --delete`할 때 이 경로를 제외해야 한다.

원본은 소스 `d16d72c`와 실행 코드가 같은 기존 배포 `55d2dfa`에서 복구했다. 실행 코드의 게임 규칙은 유지하고 에셋 기준 경로만 `/Saibi/original/`로 조정했다. 같은 호스트의 localStorage는 경로로 분리되지 않으므로 이 산출물의 저장 키를 `saibi.original.prologue.v1`, `nyarlathotep-vn.original.save.v1`로 분리했다. 수정본의 기존 저장은 읽거나 덮어쓰지 않는다. 원본 빌드 정보는 `original/release.json`에 기록한다.

첫 `gh-pages` 푸시로 Pages 배포가 자동 시작되면 추가 설정은 필요 없다. 이 저장소의 첫 배포도 자동 시작되어 성공했다. 자동 배포가 시작되지 않는 저장소에서만 **Settings → Pages → Build and deployment**에서 다음을 한 번 설정한다.

- Source: **Deploy from a branch**
- Branch: **gh-pages**
- Folder: **/(root)**
- **Save**

설정 후 GitHub의 Pages 배포 작업이 성공하면 생성된 사이트 주소에서 플레이할 수 있다. 저장소 브랜치에 올린 것만으로 Pages 활성화나 사이트 응답이 검증되는 것은 아니다. 공개 저장소의 Pages는 공개 사이트이므로 비공개 호스팅을 대체할 때 이를 구분한다.

서로 다른 사이트 주소의 브라우저 저장은 공유되지 않는다. 기존 비공개 배포 주소는 이 작업으로 변경하지 않는다.

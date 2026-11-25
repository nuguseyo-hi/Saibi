# GitHub Pages 배포

게임 원본은 루트 주소의 기존 사이트에서도 실행되어야 하므로 소스의 에셋 경로는 유지한다. GitHub Pages용 빌드 산출물에만 `/Saibi/` 경로를 적용한다.

```sh
npm ci
npm test
npm run build -- --base=/Saibi/
node scripts/prepare-pages.mjs /Saibi/ dist
```

준비된 `dist`의 내용만 `gh-pages` 브랜치 루트에 올린다. 소스, 백업, 로컬 설정, `node_modules`는 배포 브랜치에 포함하지 않는다. 기존 `gh-pages` 커밋을 부모로 사용하고 강제 푸시는 하지 않는다.

저장소 **Settings → Pages → Build and deployment**에서 다음을 한 번 설정한다.

- Source: **Deploy from a branch**
- Branch: **gh-pages**
- Folder: **/(root)**
- **Save**

설정 후 GitHub의 Pages 배포 작업이 성공하면 생성된 사이트 주소에서 플레이할 수 있다. 저장소 브랜치에 올린 것만으로 Pages 활성화나 사이트 응답이 검증되는 것은 아니다. 공개 저장소의 Pages는 공개 사이트이므로 비공개 호스팅을 대체할 때 이를 구분한다.

서로 다른 사이트 주소의 브라우저 저장은 공유되지 않는다. 기존 비공개 배포 주소는 이 작업으로 변경하지 않는다.

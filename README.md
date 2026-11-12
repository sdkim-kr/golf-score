# 골프 스코어 기록

그룹별 라운딩 스코어를 기록하고 누적/기간별로 분석하는 정적 웹앱입니다. 데이터는 `data/db.json`에 저장되며 GitHub API로 읽고 씁니다.

## 배포 (GitHub Pages)
1. GitHub에서 **public** 저장소를 만들고 이 폴더를 push 합니다.
2. Settings > Pages > Branch: `main` / `(root)` 선택.
3. `https://<계정>.github.io/<저장소>/` 로 접속합니다.

## 쓰기 권한 (멤버 공유)
1. 멤버를 저장소 Collaborator로 초대합니다 (Settings > Collaborators).
2. 각자 GitHub > Settings > Developer settings > Fine-grained tokens 에서 이 저장소만 선택하고 `Contents: Read and write` 권한의 토큰을 발급합니다.
3. 앱의 **설정** 탭에 토큰을 붙여 넣습니다. 토큰은 해당 브라우저에만 저장됩니다.

토큰이 없으면 읽기 전용입니다. 저장소가 public이므로 점수와 이름은 누구나 볼 수 있습니다.

## 로컬 테스트
```
python3 -m http.server 8000
```
`http://localhost:8000` 접속. 설정의 계정/저장소가 비어 있으면 브라우저에만 저장되는 로컬 모드로 동작합니다.

# GWATOP - Version History

## v1.0.1 (2026-03-16) - Firebase 설정 적용
- Firebase 프로젝트 연동 (gwatop-8edaf)
- 구글 로그인 활성화
- Cloudflare Pages 배포 완료 (gwatop.pages.dev)

---

## v1.0.0 (2026-03-16) - Initial Release

### 핵심 기능
- PDF 업로드 및 텍스트 추출 (pdf.js 3.11.174)
- AI 퀴즈 생성 - Gemini 1.5 Flash (Cloudflare Pages Functions 백엔드)
- 문제 유형: 객관식, 주관식, OX 퀴즈
- 문제 개수: 5~50개 슬라이더 설정
- 최대 80페이지 / 55,000자 분석

### 퀴즈 UI
- 상단 진행 바 (Progress Bar)
- 문제 유형별 UI (MCQ 선택지 / OX 버튼 / 주관식 텍스트)
- 정답/오답 즉각 피드백 (애니메이션 + 이모지)
- 해설 자동 표시
- 키보드 단축키 (Enter: 제출/다음, 1-4: MCQ 선택)

### 결과 화면
- 점수 링 애니메이션
- 정답/오답/총문제 통계
- 오답 노트 (틀린 문제 목록 + 정답 + 해설)

### 데이터 관리
- IndexedDB: 문서/퀴즈 로컬 저장
- 내 퀴즈 기록 페이지 (역재생 지원)
- 문서 삭제 시 관련 퀴즈 일괄 삭제

### 회원/인증
- Firebase Auth - 구글 로그인 (Redirect 방식)
- Firestore: 사용자 플랜, 일일 퀴즈 생성 횟수 관리
- Free 플랜: 하루 1회 제한
- Premium 플랜: 무제한

### 디자인
- Glassmorphism (유리 효과)
- 노이즈 텍스처 배경
- Pretendard Variable 폰트 (한국어 최적화)
- 반응형 레이아웃 (모바일/데스크톱)
- CSS 애니메이션 (shake, pulse, fadeIn, scale)
- 토스트 알림 시스템

### 배포
- GitHub + Cloudflare Pages 연동 자동 배포
- 환경 변수: `GEMINI_API_KEY`

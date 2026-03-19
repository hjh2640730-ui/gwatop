# GWATOP - Version History

## v2.1.0 (2026-03-19) - 좋아요 크레딧 보안 강화
- 좋아요/크레딧 처리를 서버 사이드 Cloud Function으로 이전 (functions/api/like-post.js 신규)
- Firestore 트랜잭션으로 race condition 방지
- DOM 조작을 통한 beforeCount 우회 공격 차단 (서버에서 실제 값 읽기)
- Firestore Rules: users.credits 타인 직접 수정 완전 차단
- Firestore Rules: community_posts.likes 클라이언트 직접 수정 차단
- Firestore Rules: post_likes 클라이언트 create/delete 완전 차단 (CF만)
- 자기 글 좋아요 서버에서 이중 검증
- 좋아요 버튼 연타 방지 (disabled 처리)

## v2.0.1 (2026-03-18) - 글 삭제 시 referralCredits 동기화 수정
- 좋아요 시 credits + referralCredits 동시 증감 (post.js, community.js)
- 작성자 글 삭제 시 credits + referralCredits 함께 차감 (post.js)
- 관리자 글 삭제 시 credits + referralCredits 함께 차감 (functions/api/admin.js)

## v2.0.0 (2026-03-17) - 커뮤니티 게시글 상세 페이지
- post.html / post.js 신규 생성 (게시글 상세 뷰)
- 게시글: 제목 + 내용 + 이미지 전체 표시
- 좋아요 버튼 (MAX 10 크레딧 상한 유지)
- 댓글 익명 번호 부여: 같은 유저는 항상 익명N 동일 번호 (Firestore runTransaction)
- 글 작성자 댓글은 초록색 "작성자" 뱃지로 표시
- 대댓글 기능 (답글 버튼, parentId 필드)
- 본인 댓글 삭제 (소프트 딜리트, "삭제된 댓글입니다." 표시)
- 커뮤니티 피드: 제목+내용 미리보기, 카드 클릭 시 post.html?id=xxx 이동

## v1.9.0 (2026-03-17) - 커뮤니티 수정사항
- 최소 글자 수 제한 해제
- 이미지 첨부 기능 추가 (Firebase Storage, 5MB 이하, 클릭 시 라이트박스)
- 대학교 설정: 커뮤니티 첫 진입 시 전용 모달로 1회 설정 (이후 변경 불가)
- 글쓰기 모달에서 대학 선택 제거 → 설정된 학교 read-only 표시
- "내 학교" 필터 제거 (전국 통합 커뮤니티)
- 게시물당 최대 크레딧 10개 상한 (MAX 뱃지 표시)

## v1.8.0 (2026-03-17) - 커뮤니티 페이지 신설
- community.html / community.js 신규 생성
- 글 작성: 익명 or 닉네임 선택, 대학교 선택(검색 가능), 최대 1000자
- 좋아요 기능: 글 작성자에게 좋아요 1개당 크레딧 1 지급 (자기글 불가)
- 댓글: 익명/닉네임 댓글 토글, 댓글 수 실시간 반영
- 피드: 최신순 / 인기순 정렬, 전체 / 내 학교 필터
- 모든 페이지 nav·footer·모바일 하단탭에 커뮤니티 링크 추가

## v1.7.0 (2026-03-17) - 닉네임 미설정 계정 강제 설정
- 모든 페이지(main, quiz, history, payment)에서 닉네임 없으면 모달 필수 표시
- quiz.js에 checkAndShowNicknameModal 추가 (기존 누락)
- quiz.js nav 사용자명을 userData?.nickname 우선 표시로 수정

## v1.6.0 (2026-03-17) - 랜딩 페이지 UX/UI 전면 개선
- 히어로 CTA 버튼 제거, 설명 중심으로 재편
- 4단계 스텝 카드 (번호 + 아이콘)로 작동 원리 시각화
- 요금 방식 섹션 신설: 핵심 인사이트 박스 + 사용 시나리오 3개
- 중복 가격 테이블 제거, 명확한 섹션 역할 분리
- "가장 저렴" 뱃지, 할인율 inline 표시 등 pricing 카드 개선

## v1.5.0 (2026-03-17) - 랜딩 페이지 / 퀴즈 생성 페이지 분리
- index.html: 순수 랜딩 페이지 (설명, 요금제, CTA 버튼)
- create.html: 퀴즈 생성 전용 페이지 (업로드 카드 + main.js)
- 전체 nav에 "퀴즈 만들기" 링크 추가

## v1.4.0 (2026-03-17) - 문제 개수 기반 요금제로 전환
- 크레딧 단위 변경: 퀴즈 세션 → 문제 개수 (1문제 = 1크레딧)
- 패키지 변경: 100문제/₩1,900, 300문제/₩3,900, 1,000문제/₩9,900
- 신규 가입 무료 지급: 2크레딧 → 10문제
- 추천인 크레딧: 1 → 5문제
- confirm-payment, auth.js, payment.html, index.html UI 전체 반영

## v1.3.0 (2026-03-17) - 경쟁사 비교 섹션 추가
- 홈페이지에 "왜 GWATOP인가" 비교 섹션 추가
- 구독형 vs 크레딧형 요금 비교 (월 10/30/100회 기준 절약 금액 시각화)

---

## v1.2.0 (2026-03-16) - 크레딧 기반 결제 시스템
- Toss Payments v2 연동 (크레딧 충전)
- 크레딧 패키지: 스타터(10회/₩500), 스탠다드(30회/₩1,000), 프리미엄(100회/₩2,500)
- 신규 가입 시 3 크레딧 무료 지급
- 퀴즈 생성 시 1 크레딧 차감
- Nav에 잔여 크레딧 실시간 표시
- 결제 완료/실패 페이지 추가
- Cloudflare Function: confirm-payment (Toss 확인 + Firestore 크레딧 추가)
- Firebase Service Account JWT로 서버사이드 Firestore 업데이트

---

## v1.1.0 (2026-03-16) - 복수 문제 유형 선택 지원
- 문제 유형 다중 선택 (체크박스 방식)
- 선택한 유형별 문제 수 자동 분배
- Cloudflare Function API 키 처리 강화

---

## v1.0.2 (2026-03-16) - 구글 로그인 방식 변경
- signInWithRedirect → signInWithPopup 변경 (Cloudflare 환경 호환성)
- Auth 에러 처리 강화 (Firestore 오류 시에도 로그인 상태 유지)

---

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

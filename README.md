# GWATOP 🎓

**PDF를 업로드하면 AI가 대학 시험 수준의 퀴즈를 자동 생성해주는 서비스**

---

## 🚀 배포 방법 (GitHub + Cloudflare Pages)

### 1단계: Firebase 프로젝트 설정

1. [Firebase Console](https://console.firebase.google.com) → 새 프로젝트 생성
2. **Authentication** → 시작하기 → Google 로그인 활성화
3. **Firestore Database** → 데이터베이스 만들기 → 테스트 모드로 시작
4. **프로젝트 설정** → 내 앱 → 웹 앱 추가 → 구성 복사
5. `firebase-config.js` 파일의 값을 교체

### 2단계: Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com) → API 키 생성

### 3단계: GitHub에 코드 푸시

```bash
git add .
git commit -m "GWATOP v1.0.0 Initial release"
git push origin main
```

### 4단계: Cloudflare Pages 연동

1. Cloudflare Dashboard → Pages → 새 프로젝트 → Git에 연결
2. 빌드 명령: *(비워두기)*, 출력 디렉토리: `/`
3. 환경 변수: `GEMINI_API_KEY` = Gemini API 키
4. 저장 및 배포

---

## 📁 파일 구조

```
gwatop/
├── index.html          # 메인 업로드/생성 페이지
├── quiz.html           # 퀴즈 풀기 페이지
├── history.html        # 내 퀴즈 기록 페이지
├── style.css           # 전체 스타일
├── main.js / quiz.js / history.js
├── auth.js             # Firebase Auth
├── db.js               # IndexedDB
├── firebase-config.js  # ← Firebase 설정 교체 필요!
├── _headers            # 보안 헤더
├── VERSIONS.md         # 버전 히스토리
└── functions/api/generate-quiz.js  # Gemini API 프록시
```

## 🔑 필요한 환경 변수

| 변수 | 설명 |
|------|------|
| `GEMINI_API_KEY` | Cloudflare Pages 환경 변수로 설정 |

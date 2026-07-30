# 도쿄 디즈니 현장 가이드 (TDL · TDS)

일본 현지에서 **스마트폰으로 바로 쓰는** 도쿄 디즈니랜드(TDL)·도쿄 디즈니씨(TDS) 현장용 모바일 웹앱입니다.
관광 소개 페이지가 아니라, 파크 안에서 **어트랙션·화장실·응급시설을 빠르게 찾고, 아이 키에 따른 탑승 가능 여부를 확인하고, 현재 위치에서 목적지 방향을 보는** 실사용 도구입니다.

> ⚠️ 실시간 대기시간·운영 여부·DPA 등은 이 앱에서 제공하지 않습니다. **도쿄디즈니리조트 공식 앱**에서 확인하세요.

---

## 주요 기능

- **TDL / TDS 파크 전환** — 지도 중심·확대·데이터·검색·필터·목록이 함께 전환되고 마지막 선택 파크를 저장
- **어트랙션 검색·필터** — 한국어/일본어/영어 이름, 구역, 시설 유형 검색 / 키 제한·실내·야외·스릴·어린이·비오는날·즐겨찾기·가까운 순 필터
- **아이 키 프로필** — 기본 담이 115cm, 이서 103cm. 이름·키 수정 가능(localStorage 저장). 어트랙션별 "탑승 가능 / 키 제한 미달 / 키 제한 없음 / 공식 정보 재확인 필요" 표시
- **화장실 찾기** — 가까운 순, 일반화장실·다기능화장실·수유실·베이비케어룸, 게이트 안쪽, High 신뢰도만, 추정 위치 포함
- **응급시설(중앙구호실)** — 화장실과 별도 아이콘·유형으로 구분
- **현재 위치** — Web Geolocation, 정확도 원, 권한 거부·지연·저정확도·파크 외부·비지원·비HTTPS·오프라인 상황 처리 (위치는 브라우저 내부에서만 사용, 저장·전송 안 함)
- **방향 보기(직선거리 안내)** — 실제 보행경로가 아닌 **직선 방향/거리**만 점선으로 표시
- **즐겨찾기 & 내 방문 목록** — 순서 직접 변경, 완료 표시
- **PWA / 오프라인** — 홈 화면 설치, 앱 셸·데이터 오프라인 캐시, 목록·검색·즐겨찾기·상세는 오프라인에서도 동작
- **접근성** — 44px 이상 터치 영역, 다크모드, 아이콘+텍스트 병기, 색상만으로 구분하지 않음, aria 라벨, 키보드 탐색

---

## 기술 구성

HTML5 · CSS · **JavaScript ES Modules** · **Leaflet** + **OpenStreetMap** · localStorage · Web Geolocation API · Web App Manifest · Service Worker · GitHub Pages.

- API 키가 필요한 지도(Google Maps 등)는 **사용하지 않습니다.** Google Maps는 좌표 조사·검증 근거로만 활용했습니다.
- Leaflet은 `vendor/leaflet/`에 로컬 포함(오프라인/서브경로 대응). 모든 경로는 **상대경로**라 GitHub Pages 하위 경로에서도 동작합니다.
- 빌드 과정 없음. 정적 파일을 그대로 서빙합니다.

---

## 로컬 실행 / 개발 서버

Service Worker와 ES Module, Geolocation은 `file://`에서 제약이 있으므로 로컬 HTTP 서버로 실행하세요.

```bash
# Node 내장 정적 서버 (의존성 없음)
npm run serve
# 또는
node scripts/serve.mjs 5173
# 브라우저에서 http://localhost:5173 접속
```

Python이 있다면 `python -m http.server 5173` 도 가능합니다.

### 데이터 검증

```bash
npm run validate   # node scripts/validate.mjs
```

ID 중복, 좌표 형식/범위, 필수 필드, unknown인데 좌표 존재, verified/approximate 충돌, High인데 근거 없음, 유료구역/접근성 충돌, 파크 구분, 좌표 중복, 화장실/응급시설 유형 혼동 등을 검사합니다.

---

## 데이터 출처 원칙

- **모든 좌표는 실측 GPS가 아닙니다.** `coordinateVerified` 는 항상 `false`, `approximate` 는 `true` 입니다.
- 화장실 High 좌표는 Google Maps 화장실 POI를 직접 클릭해 URL의 `!3d`/`!4d` 값을 추출하고, 공식 한국어 PDF 지도 및 위성지도와 대조한 **추정 좌표**입니다. (출처 유형 `google_poi`)
- 어트랙션 좌표는 공식 PDF의 랜드/포트 배치와 검증된 화장실 좌표를 앵커로 한 **대략적 위치**입니다.
- 키 제한은 **공식 도쿄디즈니리조트 자료에서 확인된 값만** 사용하고, 불확실하면 "공식 정보 재확인 필요"로 표시합니다.
- 실시간 대기시간·운영 여부·소요시간은 임의로 생성하지 않습니다.

### PDF 사용 원칙

프로젝트 루트의 `TDL_map_kr.pdf`, `TDS_map_kr.pdf`(도쿄디즈니리조트 공식 한국어 지도)는 **위치 조사용 로컬 참고자료로만** 사용합니다.

- 웹페이지에 표시·캡처 포함 금지, 배포 파일/저장소에 포함 금지, 배경 지도로 사용 금지
- 삭제·이름 변경 금지
- `.gitignore` 로 저장소에서 제외됨 (로컬 조사용으로만 계속 활용)
- PDF를 근거로 만든 자체 좌표·시설명·검증 상태·출처 설명만 프로젝트 데이터에 저장

### 좌표 신뢰도(coordinateStatus) 의미

| 상태 | 화면 표기 | 예상 오차 | 기본 지도 표시 |
|---|---|---|---|
| `high_estimated` | 지도상 위치 확인 | 약 5~10m | 표시 |
| `medium_estimated` | 추정 위치 | 약 10~15m | 표시 |
| `low_estimated` | 대략적인 위치 | 약 20~30m | 설정에서 "추정 위치 포함" 켤 때만 (화장실·시설) |
| `unknown` | 위치 미확인 | 미확인 | 표시하지 않음 |

신뢰도 점수: High ≥ 70, Medium 45~69, Low 1~44, Unknown 좌표 미확정.
> 참고: 어트랙션은 지도의 기본 기능이므로 항상 표시하되 "대략적 위치" 배지를 함께 표시합니다. 위 "추정 위치 숨김" 규칙은 화장실·응급시설 등 **시설** 데이터에 적용됩니다.

### 실제 보행경로가 아님

"방향 보기"는 **현재 위치와 목적지 사이의 직선 방향·직선거리**만 점선으로 보여줍니다.
파크 내부 보행로가 등록된 검증 데이터가 없어 실제 도보 경로/소요시간은 제공하지 않습니다. 실제 이동거리·시간은 다를 수 있습니다.

---

## TDL / TDS 화장실 검증 현황

### TDL (반영됨)

**위치 확인(High, 약 5~10m) — 9곳**

| ID | 구역 | 위치 |
|---|---|---|
| tdl-r01 | 월드바자 | 북단, 메인스트리트 하우스·티켓부스 이스트 인근 |
| tdl-r02 | 월드바자 | 남서측, 스위트하트 카페 인근 |
| tdl-r07 | 웨스턴랜드 | 빅선더마운틴 앞 |
| tdl-r08 | 웨스턴랜드 | 플라자 파빌리온 옆 |
| tdl-r09 | 크리터컨트리 | 라케티의 라쿤살롱 옆 |
| tdl-r11 | 판타지랜드 | 피노키오의 모험여행·앨리스의 티파티 인근 |
| tdl-r12 | 툰타운 | 조리트롤리·베이비센터 옆 |
| tdl-r13 | 투머로우랜드 | 스티치 인카운터·트레저 코메트 인근 |
| tdl-r14 | 투머로우랜드 | 베이맥스의 해피라이드 인근 |

**추가 검증 대상(Low, 약 20~30m) — 4곳** (기본 숨김, "추정 위치 포함" 시에만 표시)
tdl-r03(어드벤처랜드 정글크루즈 앞), tdl-r04(어드벤처랜드 주스바 옆), tdl-r06(웨스턴랜드 마크트웨인호 선착장), tdl-r10(판타지랜드 헌티드맨션 근처)

**보류(Unknown) — 1곳** — tdl-r05(웨스턴랜드 톰소여섬 요새 근처): 좌표 미확정, 데이터·지도 미포함

**응급시설** — 중앙구호실 1곳(월드바자). AED는 파크 전역에 다수 있으나 개별 좌표 미검증으로 표시하지 않음.

### TDS (조사 예정)

TDS 화장실·수유실·베이비케어룸·중앙구호실·AED는 **검증된 좌표가 아직 없어 표시하지 않습니다.** 임의의 미검증 좌표는 생성하지 않는다는 원칙에 따라 비워 두었으며, 어트랙션(29개)은 대략적 위치로 표시합니다.

---

## 남은 조사 항목

- TDS 화장실 전수조사(포트별 Google Maps 화장실 POI `!3d`/`!4d` 직접 추출): 메디터레이니언 하버 입구(유료구역 안/밖), 디즈니씨 플라자, 아메리칸 워터프런트(타워오브테러·토이스토리 인근), 포트 디스커버리, 로스트 리버 델타, 아라비안 코스트, 머메이드 라군(트리톤킹덤 실내·수유실/베이비케어룸), 미스테리어스 아일랜드, 판타지 스프링스(엔트런스·호텔 연결·프리게이트)
- TDS 중앙구호실·AED·수유실 좌표
- TDL 추가 검증 4곳(Low)의 Google POI 직접 확보로 High 승격
- TDL tdl-r05 재판독
- 어트랙션 좌표를 개별 Google POI로 검증해 정밀도 향상
- 일부 어트랙션 키 제한 재확인(예: 판타지 스프링스 피터팬 = 현재 "재확인 필요")
- 검증된 보행 그래프(walkNodes/walkEdges) 확보 시 실제 길찾기 확장 (현재는 코드 구조만 분리)

---

## 데이터 업데이트 방법

시설/어트랙션 데이터는 순수 데이터 모듈에 있습니다.

- TDL: `js/data/tdl.js` — `TDL_RESTROOMS`, `TDL_EMERGENCY`, `TDL_BABYCARE`, `TDL_ATTRACTIONS`
- TDS: `js/data/tds.js` — `TDS_RESTROOMS`, `TDS_EMERGENCY`, `TDS_BABYCARE`, `TDS_ATTRACTIONS`
- 파크 메타(중심·확대·구역): `js/data/parks.js`

레코드 추가/수정 후 반드시 `npm run validate` 를 통과시키세요. 화장실 스키마 필드: `id, park, area, name, coordinates, generalRestroom, accessibleRestroom, babyCare, nursingRoom, insidePaidArea, generalGuestAccessible, pdfVerified, coordinateVerified, approximate, coordinateStatus, coordinateSourceType, source, sourceUrl, checkedAt, googlePoiName, evidence, estimatedAccuracyMeters, confidenceScore, notes`.

---

## GitHub Pages 배포

정적 파일이므로 `main` 브랜치 루트를 그대로 배포합니다.

1. 저장소 Settings → Pages → Build and deployment → Source: **Deploy from a branch**
2. Branch: **main** / **/ (root)** → Save
3. 몇 분 뒤 `https://<사용자>.github.io/tokyo-disney-guide/` 에서 확인

모든 자원이 상대경로라 하위 경로(`/tokyo-disney-guide/`)에서도 정상 로딩됩니다.

---

## 라이선스 / 주의

- 지도 데이터 © OpenStreetMap contributors.
- 도쿄디즈니리조트 공식 PDF·상표·콘텐츠 권리는 각 권리자에 있으며, 본 저장소에는 PDF를 포함하지 않습니다.
- 본 앱의 좌표·시설 정보는 참고용 추정치이며 공식 정보와 다를 수 있습니다.

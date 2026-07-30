// Tokyo DisneySea (TDS) data.
//
// RESTROOM / EMERGENCY STATUS: intentionally EMPTY.
// The task requires that no unverified placeholder coordinates be invented for TDS.
// The official PDF confirms ~14 in-gate restroom candidates plus uncertain
// entrance-area candidates, but Google Maps POI (!3d/!4d) extraction was not
// completed for TDS in this pass, so no restroom coordinates are published yet.
// This is tracked as a remaining investigation item (see README).
//
// ATTRACTIONS: approximate landmark positions (port-level), clearly badged
// "대략적 위치". Height limits are official where marked 'official'.

export const TDS_RESTROOMS = [];      // 조사 예정 (검증 좌표 없음)
export const TDS_EMERGENCY = [];      // 조사 예정 (중앙구호실/AED 검증 좌표 없음)
export const TDS_BABYCARE = [];       // 조사 예정 (수유실/베이비케어룸 검증 좌표 없음)

export const TDS_ATTRACTIONS = [
  // Mediterranean Harbor
  a('tds-a-soaring', 'mediterranean-harbor', '소어링: 판타스틱 플라이트', 'ソアリン：ファンタスティック・フライト', 'Soaring: Fantastic Flight', [35.62790, 139.88300], 102, 'official', { indoor: true, kid: true, thrill: true, rainy: true }),
  a('tds-a-gondola', 'mediterranean-harbor', '베네치안 곤돌라', 'ヴェネツィアン・ゴンドラ', 'Venetian Gondolas', [35.62740, 139.88370], null, 'none', { indoor: false, kid: true, rainy: false }),
  a('tds-a-fortress', 'mediterranean-harbor', '포트리스 익스플로레이션', 'フォートレス・エクスプロレーション', 'Fortress Explorations', [35.62710, 139.88420], null, 'none', { indoor: false, kid: true, rainy: false }),
  a('tds-a-steamer-med', 'mediterranean-harbor', '디즈니씨 트랜짓 스티머 라인 (하버)', 'ディズニーシー・トランジットスチーマーライン', 'DisneySea Transit Steamer Line', [35.62760, 139.88400], null, 'none', { indoor: false, kid: true, rainy: false }),

  // American Waterfront
  a('tds-a-tot', 'american-waterfront', '타워 오브 테러', 'タワー・オブ・テラー', 'Tower of Terror', [35.62880, 139.88470], 102, 'official', { indoor: true, kid: false, thrill: true, rainy: true }),
  a('tds-a-toystory', 'american-waterfront', '토이 스토리 마니아!', 'トイ・ストーリー・マニア！', 'Toy Story Mania!', [35.62930, 139.88440], null, 'none', { indoor: true, kid: true, rainy: true }),
  a('tds-a-turtletalk', 'american-waterfront', '터틀 토크', 'タートル・トーク', 'Turtle Talk', [35.62900, 139.88420], null, 'none', { indoor: true, kid: true, rainy: true }),
  a('tds-a-electric', 'american-waterfront', '디즈니씨 일렉트릭 레일웨이', 'ディズニーシー・エレクトリックレールウェイ', 'DisneySea Electric Railway', [35.62910, 139.88490], null, 'none', { indoor: false, kid: true, rainy: false }),

  // Port Discovery
  a('tds-a-aquatopia', 'port-discovery', '아쿠아토피아', 'アクアトピア', 'Aquatopia', [35.62870, 139.88600], null, 'none', { indoor: false, kid: true, rainy: false }, '물에 젖을 수 있습니다.'),
  a('tds-a-searider', 'port-discovery', '니모 & 프렌즈 씨라이더', 'ニモ&フレンズ・シーライダー', 'Nemo & Friends SeaRider', [35.62850, 139.88640], 90, 'official', { indoor: true, kid: true, thrill: false, rainy: true }),

  // Lost River Delta
  a('tds-a-indiana', 'lost-river-delta', '인디아나 존스 어드벤처: 크리스탈 해골의 마신', 'インディ・ジョーンズ・アドベンチャー：クリスタルスカルの魔宮', 'Indiana Jones Adventure', [35.62720, 139.88760], 117, 'official', { indoor: true, kid: false, thrill: true, rainy: true }),
  a('tds-a-raging', 'lost-river-delta', '레이징 스피리츠', 'レイジングスピリッツ', 'Raging Spirits', [35.62680, 139.88720], 117, 'official', { indoor: false, kid: false, thrill: true, rainy: false }),
  a('tds-a-steamer-lost', 'lost-river-delta', '트랜짓 스티머 라인 (로스트 리버 델타)', 'トランジットスチーマーライン', 'Transit Steamer Line (Lost River Delta)', [35.62740, 139.88700], null, 'none', { indoor: false, kid: true, rainy: false }),

  // Arabian Coast
  a('tds-a-sindbad', 'arabian-coast', '신드바드의 스토리북 보야지', 'シンドバッド・ストーリーブック・ヴォヤッジ', 'Sindbad\u2019s Storybook Voyage', [35.62580, 139.88650], null, 'none', { indoor: true, kid: true, rainy: true }),
  a('tds-a-magiclamp', 'arabian-coast', '매지컬 램프 시어터', 'マジックランプシアター', 'The Magic Lamp Theater', [35.62560, 139.88680], null, 'none', { indoor: true, kid: true, rainy: true }),
  a('tds-a-carpet', 'arabian-coast', '재스민의 플라잉 카펫', 'ジャスミンのフライングカーペット', 'Jasmine\u2019s Flying Carpets', [35.62600, 139.88690], null, 'none', { indoor: false, kid: true, rainy: false }),
  a('tds-a-caravan', 'arabian-coast', '캐러밴 카루셀', 'キャラバンカルーセル', 'Caravan Carousel', [35.62575, 139.88700], null, 'none', { indoor: false, kid: true, rainy: false }),

  // Mermaid Lagoon
  a('tds-a-flounder', 'mermaid-lagoon', '플런더의 플라잉 피시 코스터', 'フランダーのフライングフィッシュコースター', 'Flounder\u2019s Flying Fish Coaster', [35.62520, 139.88600], 90, 'official', { indoor: false, kid: true, thrill: false, rainy: false }),
  a('tds-a-jellyfish', 'mermaid-lagoon', '점핑 젤리피시', 'ジャンピン・ジェリーフィッシュ', 'Jumpin\u2019 Jellyfish', [35.62535, 139.88615], 81, 'official', { indoor: false, kid: true, rainy: false }),
  a('tds-a-scuttle', 'mermaid-lagoon', '스커틀의 스쿠터', 'スカットルのスクーター', 'Scuttle\u2019s Scooters', [35.62545, 139.88600], null, 'none', { indoor: false, kid: true, rainy: false }),
  a('tds-a-blowfish', 'mermaid-lagoon', '블로피시 벌룬 레이스', 'ブローフィッシュ・バルーンレース', 'Blowfish Balloon Race', [35.62525, 139.88580], null, 'none', { indoor: true, kid: true, rainy: true }),
  a('tds-a-mermaidtheater', 'mermaid-lagoon', '머메이드 라군 시어터', 'マーメイドラグーンシアター', 'Mermaid Lagoon Theater', [35.62505, 139.88585], null, 'none', { indoor: true, kid: true, rainy: true }),
  a('tds-a-arielplay', 'mermaid-lagoon', '아리엘의 플레이그라운드', 'アリエルのプレイグラウンド', 'Ariel\u2019s Playground', [35.62510, 139.88610], null, 'none', { indoor: true, kid: true, rainy: true }),

  // Mysterious Island
  a('tds-a-center', 'mysterious-island', '센터 오브 디 어스', 'センター・オブ・ジ・アース', 'Journey to the Center of the Earth', [35.62660, 139.88540], 117, 'official', { indoor: true, kid: false, thrill: true, rainy: true }),
  a('tds-a-20000', 'mysterious-island', '해저 2만 리', '海底2万マイル', '20,000 Leagues Under the Sea', [35.62680, 139.88560], null, 'none', { indoor: true, kid: true, rainy: true }),

  // Fantasy Springs (2024 오픈)
  a('tds-a-frozen', 'fantasy-springs', '애나와 엘사의 프로즌 저니', 'アナとエルサのフローズンジャーニー', 'Anna and Elsa\u2019s Frozen Journey', [35.62950, 139.88820], null, 'none', { indoor: true, kid: true, rainy: true }),
  a('tds-a-rapunzel', 'fantasy-springs', '라푼젤의 랜턴 페스티벌', 'ラプンツェルのランタンフェスティバル', 'Rapunzel\u2019s Lantern Festival', [35.62920, 139.88860], null, 'none', { indoor: true, kid: true, rainy: true }),
  a('tds-a-peterpan', 'fantasy-springs', '피터팬의 네버랜드 어드벤처', 'ピーターパンのネバーランドアドベンチャー', 'Peter Pan\u2019s Never Land Adventure', [35.62890, 139.88880], null, 'unverified', { indoor: true, kid: true, rainy: true }, '키 제한 여부는 공식 도쿄디즈니리조트 자료에서 재확인이 필요합니다.'),
  a('tds-a-tinkerbell', 'fantasy-springs', '팅커벨의 비지 버기', 'ティンカーベルのビジーバギー', 'Tinker Bell\u2019s Busy Buggies', [35.62905, 139.88840], null, 'none', { indoor: true, kid: true, rainy: true }),
];

function a(id, area, nameKo, nameJa, nameEn, coordinates, heightMin, heightStatus, tags = {}, notes = '') {
  return {
    id, park: 'TDS', area, type: 'attraction',
    nameKo, nameJa, nameEn,
    coordinates,
    heightMin: heightMin ?? null,
    heightStatus,
    indoor: !!tags.indoor,
    thrill: !!tags.thrill,
    kidFriendly: !!tags.kid,
    rainyRecommended: tags.rainy != null ? !!tags.rainy : !!tags.indoor,
    coordinateStatus: 'low_estimated',
    approximate: true,
    coordinateVerified: false,
    coordinateSourceType: 'layout_estimate',
    estimatedAccuracyMeters: 45,
    confidenceScore: 28,
    source: '공식 PDF 포트 배치 + 파크 지리 기반 근사 위치',
    notes: notes || '어트랙션 위치는 대략적 추정이며 지도상 정확 좌표는 검증 예정입니다.',
  };
}

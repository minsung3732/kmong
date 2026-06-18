// =============================================
// ResConfirm.gs — '예약 정보' 시트(담당자 수기 입력) → 예약 확인서 HTML 카드
//
// [시트 구조] (헤더 행 위치 자동 탐지 — 1~15행 중 헤더 검색)
//   일자 / 예약번호(주문번호) / 유입 플랫폼 / 상품명 / 투어 날짜 /
//   대표자명 / 인원 정보 및 옵션 / 연락처 / 판매금액 / HTML 링크 / 알림톡 발송여부
//
// [웹앱 URL]  ...exec?page=confirm&order=주문번호
//
// [설치]
//   ① 담당자가 행 입력 → onEditResInfo 트리거가 HTML 링크 자동 생성
//      (트리거 추가: 함수 onEditResInfo / 이벤트 '스프레드시트 편집 시')
//   ② 기존 데이터 일괄 생성: issueAllResInfo() 직접 실행
//
// ※ WEBAPP_BASE_URL, getSheet, SHEET_RESINFO 는 다른 .gs와 공유됩니다.
// =============================================

// ── 헤더 행/열 매핑 (rows 1~15 중 '예약번호' 또는 'HTML 링크' 포함 행 탐지) ──
function getResInfoMap_() {
  const sheet = getSheet(SHEET_RESINFO);
  const data  = sheet.getDataRange().getValues();
  let hr = -1;
  const scan = Math.min(data.length, 15);
  for (let r = 0; r < scan; r++) {
    const row = data[r].map(function(c){ return String(c || '').trim(); });
    const hasOrder = row.some(function(c){ return c.indexOf('예약번호') !== -1; });
    const hasLink  = row.indexOf('HTML 링크') !== -1;
    if (hasOrder || hasLink) { hr = r; break; }
  }
  if (hr === -1) return null;
  return {
    sheet:     sheet,
    data:      data,
    headerRow: hr,                                   // 0-based
    headers:   data[hr].map(function(c){ return String(c || '').trim(); })
  };
}

// 부분 일치 열 인덱스 (0-based)
function resCol_(headers, name) {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(name) !== -1) return i;
  }
  return -1;
}

function resFmt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}

function htmlMsg_(m) {
  return HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif;padding:40px;text-align:center;color:#c0182a">' + m + '</p>'
  );
}

// =============================================
// 웹앱 서빙 (?page=confirm&order=주문번호)
// =============================================
function serveResInfoCard(e) {
  const order = (e && e.parameter && e.parameter.order) || '';
  if (!order) return htmlMsg_('주문번호가 없습니다.');
  try {
    const map = getResInfoMap_();
    if (!map) return htmlMsg_("'예약 정보' 시트의 헤더를 찾을 수 없습니다.");

    const bIdx = resCol_(map.headers, '예약번호');
    if (bIdx === -1) return htmlMsg_('예약번호 열을 찾을 수 없습니다.');

    for (let r = map.data.length - 1; r > map.headerRow; r--) {
      if (String(map.data[r][bIdx] || '').trim().toUpperCase() === order.trim().toUpperCase()) {
        const row = map.data[r];
        const get = function(name){ const i = resCol_(map.headers, name); return i === -1 ? '' : resFmt_(row[i]); };
        const d = {
          date:     get('일자'),
          orderNo:  get('예약번호'),
          platform: get('유입'),
          product:  get('상품명'),
          tourDate: get('투어'),
          repName:  get('대표자'),
          pax:      get('인원'),
          contact:  get('연락처'),
          price:    get('판매')
        };
        return HtmlService.createHtmlOutput(buildResInfoCardHtml(d))
          .setTitle('예약 확인서 · ' + order)
          .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }
    }
    return htmlMsg_('주문번호 [' + order + ']를 찾을 수 없습니다.');
  } catch(err) {
    return htmlMsg_('오류: ' + err.message);
  }
}

// =============================================
// HTML 카드 빌더 (기존 예약카드와 동일 디자인)
// =============================================
function buildResInfoCardHtml(d) {
  const esc = function(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  const won = function(v){
    const n = String(v).replace(/[^0-9]/g, '');
    if (!n) return esc(v) || '—';
    return Number(n).toLocaleString('en-US') + '원';
  };

  const paxSec = d.pax ? `
      <div class="section">
        <div class="section-title">👥 인원 정보 및 옵션</div>
        <div class="memo-box">${esc(d.pax)}</div>
      </div>` : '';

  const issuedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>예약 확인서 · ${esc(d.orderNo)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Pretendard','맑은 고딕',sans-serif;background:#EDF4FF;color:#111827;font-size:16px;line-height:1.6;padding:20px 16px 40px}
.card{max-width:700px;margin:0 auto;background:#fff;border-radius:20px;box-shadow:0 4px 28px rgba(52,120,246,.14);border:1px solid #D4E4FA;overflow:hidden}
.header{background:linear-gradient(135deg,#1C5FD6,#3478F6 60%,#5B9EFF);color:#fff;padding:26px 24px 22px;text-align:center}
.header .badge{display:inline-block;background:rgba(255,255,255,.22);border:1.5px solid rgba(255,255,255,.45);border-radius:50px;padding:4px 18px;font-size:13px;font-weight:700;margin-bottom:10px}
.header h1{font-size:21px;font-weight:800;letter-spacing:-.5px}
.booking-label{margin-top:16px;font-size:13px;font-weight:700;opacity:.85;letter-spacing:1px}
.booking-no{font-size:30px;font-weight:900;letter-spacing:1.5px;margin-top:4px;word-break:break-all}
.body{padding:24px 20px}
.section{margin-bottom:22px}
.section-title{font-size:13.5px;font-weight:800;color:#3478F6;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #EBF3FF;letter-spacing:.3px;text-transform:uppercase}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field{background:#F5F9FF;border-radius:11px;padding:11px 14px}
.field .label{display:block;font-size:11.5px;font-weight:700;color:#5A6A82;margin-bottom:3px;letter-spacing:.2px}
.field .value{display:block;font-size:15.5px;font-weight:700;color:#111827;word-break:break-all}
.field.full{grid-column:1/-1}
.field.price{background:linear-gradient(135deg,#EAF3FF,#DCEBFF);border:1px solid #C7DEFF}
.field.price .value{font-size:20px;color:#1C5FD6}
.memo-box{background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:11px;padding:13px 16px;font-size:14.5px;color:#78350F;font-weight:600;white-space:pre-wrap;word-break:break-word}
.footer{background:#F5F9FF;padding:14px 20px;text-align:center;font-size:12px;color:#94a3b8;font-weight:600;border-top:1.5px solid #EBF3FF}
@media(max-width:480px){.grid{grid-template-columns:1fr}.field.full{grid-column:1}.booking-no{font-size:24px}}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="badge">아이러브베트남</div>
    <h1>✈️ 예약 확인서</h1>
    <div class="booking-label">- 예약번호 -</div>
    <div class="booking-no">${esc(d.orderNo) || '—'}</div>
  </div>

  <div class="body">

    <div class="section">
      <div class="section-title">🗂 상품 정보</div>
      <div class="grid">
        <div class="field full"><span class="label">상품명</span><span class="value">${esc(d.product)||'—'}</span></div>
        <div class="field"><span class="label">투어 날짜</span><span class="value">${esc(d.tourDate)||'—'}</span></div>
        <div class="field"><span class="label">유입 플랫폼</span><span class="value">${esc(d.platform)||'—'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">🙍 예약자 정보</div>
      <div class="grid">
        <div class="field"><span class="label">대표자명</span><span class="value">${esc(d.repName)||'—'}</span></div>
        <div class="field"><span class="label">연락처</span><span class="value">${esc(d.contact)||'—'}</span></div>
        <div class="field"><span class="label">예약 일자</span><span class="value">${esc(d.date)||'—'}</span></div>
      </div>
    </div>

    ${paxSec}

    <div class="section">
      <div class="section-title">💳 결제 정보</div>
      <div class="grid">
        <div class="field full price"><span class="label">판매 금액</span><span class="value">${won(d.price)}</span></div>
      </div>
    </div>

  </div>

  <div class="footer">발행: ${issuedAt} · 아이러브베트남</div>
</div>
</body>
</html>`;
}

// =============================================
// HTML 링크 발행 — 특정 행
// =============================================
function issueResInfoForRow_(map, rowIdx0) {
  const bIdx = resCol_(map.headers, '예약번호');
  const lIdx = resCol_(map.headers, 'HTML 링크');
  if (bIdx === -1 || lIdx === -1) return false;

  const orderNo = String(map.sheet.getRange(rowIdx0 + 1, bIdx + 1).getValue() || '').trim();
  if (!orderNo) return false;

  // 이미 링크가 있으면 스킵 (데이터 없는 행에만 발행)
  const existing = String(map.sheet.getRange(rowIdx0 + 1, lIdx + 1).getValue() || '').trim();
  if (existing) return false;

  const url = WEBAPP_BASE_URL + '?page=confirm&order=' + encodeURIComponent(orderNo);
  map.sheet.getRange(rowIdx0 + 1, lIdx + 1).setValue(url).setFontColor('#1C5FD6');
  return true;
}

// =============================================
// 전체 일괄 발행 — 편집기에서 수동 실행
// =============================================
function issueAllResInfo() {
  const map = getResInfoMap_();
  if (!map) { Logger.log("❌ '예약 정보' 시트 헤더를 찾을 수 없습니다."); return; }
  const bIdx = resCol_(map.headers, '예약번호');
  let count = 0;
  for (let r = map.headerRow + 1; r < map.data.length; r++) {
    if (!String(map.data[r][bIdx] || '').trim()) continue;
    if (issueResInfoForRow_(map, r)) count++;
  }
  Logger.log('✅ 총 ' + count + '개 예약 확인서 링크가 생성되었습니다.');
}

// =============================================
// 편집 트리거 — '예약 정보' 시트 행 입력 시 HTML 링크 자동 생성
//   트리거 추가: onEditResInfo / 스프레드시트 편집 시
// =============================================
function onEditResInfo(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_RESINFO) return;

  const map = getResInfoMap_();
  if (!map) return;

  const row0 = e.range.getRow() - 1;          // 0-based
  if (row0 <= map.headerRow) return;          // 헤더 이상은 무시

  const lIdx = resCol_(map.headers, 'HTML 링크');
  if (e.range.getColumn() === lIdx + 1) return; // 링크 열 자체 수정은 무시 (무한루프 방지)

  const bIdx = resCol_(map.headers, '예약번호');
  if (!String(sheet.getRange(row0 + 1, bIdx + 1).getValue() || '').trim()) return;

  try { issueResInfoForRow_(map, row0); }
  catch(err) { Logger.log('onEditResInfo 오류: ' + err.message); }
}

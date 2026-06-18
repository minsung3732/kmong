// =============================================
// CardGen.gs — 예약 카드 HTML 자동 생성 및 시트 연동
//
// [기능 요약]
//  1. buildBookingCardHtml(d)       : 행 데이터 → HTML 문자열
//  2. issueCardForRow(sheet, rowIdx): 특정 행 카드 발행 → W열에 링크 기입
//  3. issueAllCards()               : 시트 전체 일괄 발행 (편집기에서 수동 실행)
//  4. onEditIssueCard(e)            : 시트 편집 트리거 — A~V열 변경 시 해당 행 재발행
//
// [설치 방법]
//  ① Apps Script 편집기 → 트리거 추가
//     함수: onEditIssueCard / 이벤트: 스프레드시트 편집 시
//  ② 기존 데이터 일괄 생성: 편집기에서 issueAllCards() 직접 실행
// =============================================

// ── 설정 (Code.gs의 상수와 동일 스프레드시트 공유) ──
const CARD_SS_ID        = '1g7omePD_UXQK3duoBdxLbhDBybvhoYgFZUPmF5v9tng';
const CARD_FOLDER_ID    = '10WH_KZ67fXghuQfG4Z7_jQAR196ybuxE';
const CARD_SHEET_NAME   = '고객 정보 입력';

// 웹앱 배포 URL (배포 후 실제 URL로 변경)
// 예) 'https://script.google.com/macros/s/AKfycb.../exec'
const WEBAPP_BASE_URL   = 'https://script.google.com/macros/s/AKfycbzSth39SQWIm6tm6dSjxP5fqD_GVA3BU_QS4Yq-LJ0h5OoAK54Rt0eSUcAvmF0jLMUu/exec';

// 열 인덱스 (0-based) — '고객 정보 입력' 시트 구조 기준
// A접수시간 B예약번호 C상품명 D상품유형 E투어날짜 F대표자영문성함
// G픽업호텔 H드랍호텔 I출발시간 J성인 K소아 L소아만나이
// M옵션메모 N베드타입 O여권정보 P비고 Q컨펌번호 → R열에 카드 링크
const COL_BOOKING_NO  = 1;   // B열 — 예약번호
const COL_NAME        = 5;   // F열 — 대표자영문성함
const COL_CARD_LINK   = 17;  // R열 — 카드 링크 (0-based = 17 → 시트상 18번째 열)

// 카드 링크 이전까지 데이터가 있는 열 범위 (A~Q = 0~16, 컨펌번호 포함)
const DATA_COL_END = 16;

// ── '예약카드' 서브폴더 ID 반환 (없으면 생성) — Drive v3 사용 ──
function getCardFolderId_() {
  const q = "name='예약카드' and '" + CARD_FOLDER_ID + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
  const res = Drive.Files.list({
    q: q,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id)'
  });
  if (res.files && res.files.length > 0) return res.files[0].id;

  const folder = Drive.Files.create(
    { name: '예약카드', mimeType: 'application/vnd.google-apps.folder', parents: [CARD_FOLDER_ID] },
    null,
    { supportsAllDrives: true }
  );
  return folder.id;
}

// ── 날짜 포맷 ─────────────────────────────────────────
function fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}

// =============================================
// 1. HTML 빌더 (웹앱 서빙용 — Code.gs의 serveCardView에서 호출)
// =============================================
function buildCardHtmlForWebApp(d) { return buildBookingCardHtml(d); }

function buildBookingCardHtml(d) {
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // 여권 정보 섹션 — '여권 정보' 셀 메모(탑승자별 블록) 우선, 없으면 셀 값
  const passportNote = d['__passportNote'] || '';
  const hasPassport  = passportNote || d['여권 정보'];
  const passportSection = hasPassport ? `
      <div class="section">
        <div class="section-title">🛂 여권 정보</div>
        <button type="button" class="toggle-btn" onclick="togglePassport(this)" aria-expanded="false">
          <span class="tg-text">여권 정보 펼치기</span>
          <span class="tg-icon">▼</span>
        </button>
        <div class="memo-box passport-body" style="background:#F5F9FF;border-color:#C7DEFF;color:#1C5FD6;white-space:pre-wrap;display:none;margin-top:10px">${esc(passportNote || d['여권 정보'])}</div>
      </div>` : '';

  const passportImg = '';

  const childAgeRow = d['소아만나이'] ? `
          <div class="field full"><span class="label">소아 만 나이</span><span class="value">${esc(d['소아만나이'])}</span></div>` : '';

  const bedRow = d['베드타입'] ? `
          <div class="field"><span class="label">베드 타입</span><span class="value">${esc(d['베드타입'])}</span></div>` : '';

  const optionSec = d['옵션메모'] ? `
      <div class="section">
        <div class="section-title">✅ 옵션</div>
        <div class="memo-box">${esc(d['옵션메모'])}</div>
      </div>` : '';

  const memoSec = d['비고'] ? `
      <div class="section">
        <div class="section-title">📝 비고</div>
        <div class="memo-box">${esc(d['비고'])}</div>
      </div>` : '';

  const confirmRow = d['컨펌번호'] ? `
          <div class="field full" style="background:#FFF7E6;border:1px solid #FCD98A">
            <span class="label" style="color:#A86A00">컨펌번호</span>
            <span class="value" style="color:#92500A">${esc(d['컨펌번호'])}</span>
          </div>` : '';

  const issuedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>예약카드 · ${esc(d['예약번호'])}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Pretendard','맑은 고딕',sans-serif;background:#EDF4FF;color:#111827;font-size:16px;line-height:1.6;padding:20px 16px 40px}
.card{max-width:700px;margin:0 auto;background:#fff;border-radius:20px;box-shadow:0 4px 28px rgba(52,120,246,.14);border:1px solid #D4E4FA;overflow:hidden}

/* ── 헤더 ── */
.header{background:linear-gradient(135deg,#1C5FD6,#3478F6 60%,#5B9EFF);color:#fff;padding:26px 24px 22px;text-align:center}
.header .badge{display:inline-block;background:rgba(255,255,255,.22);border:1.5px solid rgba(255,255,255,.45);border-radius:50px;padding:4px 18px;font-size:13px;font-weight:700;margin-bottom:10px}
.header h1{font-size:21px;font-weight:800;letter-spacing:-.5px}
.booking-label{margin-top:16px;font-size:13px;font-weight:700;opacity:.85;letter-spacing:1px}
.booking-no{font-size:34px;font-weight:900;letter-spacing:3px;margin-top:4px}

/* ── 본문 ── */
.body{padding:24px 20px}
.section{margin-bottom:22px}
.section-title{font-size:13.5px;font-weight:800;color:#3478F6;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #EBF3FF;letter-spacing:.3px;text-transform:uppercase}

/* ── 그리드 필드 ── */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field{background:#F5F9FF;border-radius:11px;padding:11px 14px}
.field .label{display:block;font-size:11.5px;font-weight:700;color:#5A6A82;margin-bottom:3px;letter-spacing:.2px}
.field .value{display:block;font-size:15.5px;font-weight:700;color:#111827;word-break:break-all}
.field.full{grid-column:1/-1}

/* ── 메모 박스 ── */
.memo-box{background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:11px;padding:13px 16px;font-size:14.5px;color:#78350F;font-weight:600;white-space:pre-wrap;word-break:break-word}

/* ── 토글 버튼 ── */
.toggle-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border:1.5px solid #C7DEFF;background:#F5F9FF;color:#1C5FD6;font-weight:800;font-size:14px;border-radius:11px;cursor:pointer;font-family:inherit;transition:.15s}
.toggle-btn:hover{background:#EAF3FF}
.tg-icon{font-size:11px}

/* ── 푸터 ── */
.footer{background:#F5F9FF;padding:14px 20px;text-align:center;font-size:12px;color:#94a3b8;font-weight:600;border-top:1.5px solid #EBF3FF}

/* ── 반응형 ── */
@media(max-width:480px){
  .grid{grid-template-columns:1fr}
  .field.full{grid-column:1}
  .booking-no{font-size:22px;letter-spacing:1.5px}
}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="badge">아이러브베트남</div>
    <h1>✈️ 여행 예약 확인서</h1>
    <div class="booking-label">- 예약번호 -</div>
    <div class="booking-no">${esc(d['예약번호'])}</div>
  </div>

  <div class="body">

    <div class="section">
      <div class="section-title">🗂 상품 정보</div>
      <div class="grid">
        <div class="field full"><span class="label">상품명</span><span class="value">${esc(d['상품명'])||'—'}</span></div>
        <div class="field"><span class="label">상품 구성</span><span class="value">${esc(d['상품유형'])||'—'}</span></div>
        <div class="field"><span class="label">출발시간</span><span class="value">${esc(d['출발시간'])||'—'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">📅 예약 정보</div>
      <div class="grid">
        ${confirmRow}
        <div class="field full"><span class="label">대표자 영문 성함</span><span class="value">${esc(d['대표자영문성함'])||'—'}</span></div>
        <div class="field"><span class="label">투어 날짜</span><span class="value">${esc(d['투어날짜'])||'—'}</span></div>
        <div class="field"><span class="label">접수 시간</span><span class="value">${esc(d['접수시간'])||'—'}</span></div>
        <div class="field"><span class="label">픽업 호텔</span><span class="value">${esc(d['픽업호텔'])||'—'}</span></div>
        <div class="field"><span class="label">드랍 호텔</span><span class="value">${esc(d['드랍호텔'])||'—'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">👥 인원</div>
      <div class="grid">
        <div class="field"><span class="label">성인</span><span class="value">${esc(d['성인'])||'0'}명</span></div>
        <div class="field"><span class="label">소아</span><span class="value">${esc(d['소아'])||'0'}명</span></div>
        ${childAgeRow}
        ${bedRow}
      </div>
    </div>

    ${optionSec}
    ${passportSection}
    ${passportImg}
    ${memoSec}

  </div>

  <div class="footer">최종 발행: ${issuedAt} · 아이러브베트남</div>
</div>
<script>
function togglePassport(btn){
  var body = btn.parentNode.querySelector('.passport-body');
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  btn.querySelector('.tg-text').textContent = open ? '여권 정보 펼치기' : '여권 정보 숨기기';
  btn.querySelector('.tg-icon').textContent = open ? '\\u25BC' : '\\u25B2';
  btn.setAttribute('aria-expanded', open ? 'false' : 'true');
}
</script>
</body>
</html>`;
}

// =============================================
// 2. 특정 행 카드 발행 → Drive 저장 → W열 링크 기입
// rowIdx : 1-based (시트 행 번호)
// =============================================
function issueCardForRow(sheet, rowIdx) {
  // 이미 링크가 있으면 스킵 (데이터 없는 행에만 발행)
  const existingLink = String(sheet.getRange(rowIdx, COL_CARD_LINK + 1).getValue() || '').trim();
  if (existingLink) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

  // 헤더 → 객체 매핑
  const d = {};
  headers.forEach(function(h, j) { d[h] = fmtDate_(rowData[j]); });

  // 여권 정보 셀 메모(탑승자별 블록) 읽기
  const pIdx = headers.indexOf('여권 정보');
  if (pIdx !== -1) d['__passportNote'] = sheet.getRange(rowIdx, pIdx + 1).getNote() || '';

  const bookingNo = d['예약번호'] || String(rowData[COL_BOOKING_NO] || '').trim();
  const repName   = d['대표자영문성함'] || String(rowData[COL_NAME] || '').trim();
  if (!bookingNo) return; // 예약번호 없는 행은 스킵

  const html      = buildBookingCardHtml(d);
  const safeName  = repName.replace(/[^A-Za-z0-9가-힣]/g, '_');
  const filename  = bookingNo + '_' + safeName + '.html';
  const folderId  = getCardFolderId_();

  // 기존 동명 파일 삭제
  const existing = Drive.Files.list({
    q: "name='" + filename + "' and '" + folderId + "' in parents and trashed=false",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id)'
  });
  if (existing.files && existing.files.length > 0) {
    Drive.Files.update({ trashed: true }, existing.files[0].id, null, { supportsAllDrives: true });
  }

  // HTML 파일 생성
  const blob = Utilities.newBlob(html, 'text/html', filename);
  const file = Drive.Files.create(
    { name: filename, parents: [folderId] },
    blob,
    { supportsAllDrives: true }
  );

  const fileId = file.id;
  Logger.log('생성된 파일 ID: ' + fileId);

  // 링크 공개 설정 (anyone with link → view)
  Drive.Permissions.create(
    { role: 'reader', type: 'anyone' },
    fileId,
    { supportsAllDrives: true }
  );

  // W열에 웹앱 URL 기입 (카카오톡 등에서 바로 렌더링 가능)
  const cardUrl = WEBAPP_BASE_URL + '?page=card&bookingNo=' + encodeURIComponent(bookingNo);
  const linkCell = sheet.getRange(rowIdx, COL_CARD_LINK + 1);
  linkCell.setValue(cardUrl);
  linkCell.setFontColor('#1C5FD6');

  Logger.log('카드 발행 완료 → 행 ' + rowIdx + ' / ' + filename + ' (Drive ID: ' + fileId + ')');
}

// =============================================
// 3. 전체 일괄 발행 — 편집기에서 수동 실행
// =============================================
function issueAllCards() {
  const ss    = SpreadsheetApp.openById(CARD_SS_ID);
  const sheet = ss.getSheetByName(CARD_SHEET_NAME);
  if (!sheet) { Logger.log('시트 없음: ' + CARD_SHEET_NAME); return; }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('데이터 없음'); return; }

  let count = 0;
  for (let r = 2; r <= lastRow; r++) {
    const bookingNo = String(sheet.getRange(r, COL_BOOKING_NO + 1).getValue() || '').trim();
    if (!bookingNo) continue;
    try {
      issueCardForRow(sheet, r);
      count++;
    } catch(e) {
      Logger.log('행 ' + r + ' 오류: ' + e.message);
    }
  }
  Logger.log('✅ 총 ' + count + '개 예약 카드가 생성되었습니다.');
}

// =============================================
// 4. 선택한 행만 개별 발행 — 시트 버튼 or 편집기에서 직접 실행
// =============================================
function issueSelectedCard() {
  const ss    = SpreadsheetApp.openById(CARD_SS_ID);
  const sheet = ss.getSheetByName(CARD_SHEET_NAME);
  if (!sheet) { SpreadsheetApp.getUi().alert('시트를 찾을 수 없습니다.'); return; }

  const row = sheet.getActiveRange().getRow();
  if (row <= 1) { SpreadsheetApp.getUi().alert('헤더 행은 발행할 수 없습니다.'); return; }

  const bookingNo = String(sheet.getRange(row, COL_BOOKING_NO + 1).getValue() || '').trim();
  if (!bookingNo) { SpreadsheetApp.getUi().alert(row + '행에 예약번호가 없습니다.'); return; }

  try {
    issueCardForRow(sheet, row);
    const link = sheet.getRange(row, COL_CARD_LINK + 1).getValue();
    SpreadsheetApp.getUi().alert('✅ ' + row + '행 카드 발행 완료!\n\n' + link);
  } catch(e) {
    SpreadsheetApp.getUi().alert('오류: ' + e.message);
  }
}

// =============================================
// 5. 시트 편집 트리거 — A~V열 변경 시 해당 행 재발행
//    Apps Script → 트리거 추가 → onEditIssueCard / 스프레드시트 편집 시
// =============================================
function onEditIssueCard(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== CARD_SHEET_NAME) return;

  const row = e.range.getRow();
  const col = e.range.getColumn(); // 1-based

  // 헤더 행(1행)이거나 W열(23열) 자기 자신 수정이면 스킵
  if (row <= 1) return;
  if (col === COL_CARD_LINK + 1) return; // W열 수정은 무시 (무한루프 방지)

  // A~V열(1~22열) 범위 내 변경만 처리
  const editedColEnd = e.range.getColumn() + e.range.getNumColumns() - 1;
  const isDataRange  = e.range.getColumn() <= DATA_COL_END + 1 && editedColEnd >= 1;
  if (!isDataRange) return;

  // 예약번호 없으면 스킵
  const bookingNo = String(sheet.getRange(row, COL_BOOKING_NO + 1).getValue() || '').trim();
  if (!bookingNo) return;

  try {
    issueCardForRow(sheet, row);
  } catch(err) {
    Logger.log('onEditIssueCard 오류 (행 ' + row + '): ' + err.message);
  }
}

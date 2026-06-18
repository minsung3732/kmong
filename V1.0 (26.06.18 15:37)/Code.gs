// =============================================
// 설정값 (배포 전 수정)
// =============================================
const SS_ID           = '1g7omePD_UXQK3duoBdxLbhDBybvhoYgFZUPmF5v9tng';
const DRIVE_FOLDER_ID = '10WH_KZ67fXghuQfG4Z7_jQAR196ybuxE';

const SHEET_CUSTOMER     = '고객 정보 입력';
const SHEET_CHANGE       = '예약 변경 요청';     // (구) 미사용 — 호환 위해 유지
const SHEET_CHANGE_BEFORE = '예약 변경전 정보';  // 변경 전 원본 백업 (고객 정보 입력과 동일 구조)
const SHEET_CARRENT  = '차량 렌트 신청';
const SHEET_PRODUCTS = '상품 구성';
const SHEET_PASSPORT = '여권 정보';   // 여권 raw data 정리 시트
const SHEET_RESINFO  = '예약 정보';   // 담당자 수기 입력 → 예약 확인서 카드

const PASSPORT_HEADERS = ['접수시간','예약번호','상품명','상품유형','투어날짜','대표자영문성함','여권 정보'];

// =============================================
// 웹앱 진입점 — 페이지 파라미터로 분기
// 메인 URL:      ...exec
// 여권 URL:      ...exec?page=passport
// =============================================
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'main';
  if (page === 'card')    return serveCardView(e);
  if (page === 'confirm') return serveResInfoCard(e);   // 예약 정보 시트 기반 예약 확인서
  const file  = page === 'passport' ? '여권등록' : '신청서';
  const title = page === 'passport' ? '여권 정보 등록' : '여행 예약 신청서';
  return HtmlService.createHtmlOutputFromFile(file)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 예약카드 서빙 (?page=card&bookingNo=XXXX)
function serveCardView(e) {
  const bookingNo = (e && e.parameter && e.parameter.bookingNo) || '';
  if (!bookingNo) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:40px;color:#c0182a">예약번호가 없습니다.</p>');
  }
  try {
    const sheet   = getSheet(SHEET_CUSTOMER);
    const rows    = sheet.getDataRange().getValues();
    const headers = rows[0];
    const bIdx    = headers.indexOf('예약번호');
    const pIdx    = headers.indexOf('여권 정보');
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][bIdx]||'').trim().toUpperCase() === bookingNo.trim().toUpperCase()) {
        const d = {};
        headers.forEach(function(h, j) {
          const v = rows[i][j];
          d[h] = (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') : String(v||'');
        });
        // 여권 정보 셀의 메모(상세 블록) 읽기
        if (pIdx !== -1) d['__passportNote'] = sheet.getRange(i + 1, pIdx + 1).getNote() || '';
        return HtmlService.createHtmlOutput(buildCardHtmlForWebApp(d))
          .setTitle('예약카드 · ' + bookingNo)
          .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }
    }
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:40px;color:#c0182a">예약번호 [' + bookingNo + ']를 찾을 수 없습니다.</p>');
  } catch(err) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:40px;color:#c0182a">오류: ' + err.message + '</p>');
  }
}

// =============================================
// 공통 유틸
// =============================================
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SS_ID);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function nowKST() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}
function ensureHeader(sheet, headers) {
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
}
// A열 기준 마지막 데이터 다음 행 번호 (다른 열의 체크박스 무시)
function nextRowByColA_(sheet) {
  const colA = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();
  let last = 0;
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() !== '') last = i + 1;
  }
  return last + 1;
}

// 숫자만 추출 (연락처 비교용 — 하이픈/공백 무시)
function digitsOnly_(s) { return String(s || '').replace(/[^0-9]/g, ''); }

// '예약 정보' 시트 H열(연락처)에서 일치 행을 찾아 B열(예약번호/주문번호) 반환
function findBookingNoByContact_(contact) {
  const target = digitsOnly_(contact);
  if (!target) return '';
  try {
    const map = getResInfoMap_();   // ResConfirm.gs
    if (!map) return '';
    const cIdx = resCol_(map.headers, '연락처');
    const bIdx = resCol_(map.headers, '예약번호');
    if (cIdx === -1 || bIdx === -1) return '';
    for (let r = map.data.length - 1; r > map.headerRow; r--) {
      if (digitsOnly_(map.data[r][cIdx]) === target) {
        return String(map.data[r][bIdx] || '').trim();
      }
    }
  } catch(e) {}
  return '';
}

// 시트에서 영문성함 + 연락처(대표자영문성함 셀 메모)로 행 조회
// telCol1based: 연락처가 저장된 셀(대표자영문성함) 열 번호. 출발시간 HH:mm 포맷 옵션.
function lookupRowByContact_(sheetName, name, contact, fmtTimeCol) {
  if (!name || !contact) return { ok: false, msg: '영문 성함과 연락처를 모두 입력해 주세요.' };
  const sheet   = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { ok: false, msg: '예약 내역이 없습니다.' };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nIdx = headers.indexOf('대표자영문성함');
  if (nIdx === -1) return { ok: false, msg: '대표자영문성함 헤더를 찾을 수 없습니다.' };

  const values = sheet.getRange(1, 1, lastRow, headers.length).getValues();
  const notes  = sheet.getRange(1, nIdx + 1, lastRow, 1).getNotes();  // 연락처 메모
  const wantName = name.trim().toUpperCase();
  const wantTel  = digitsOnly_(contact);

  for (let i = lastRow - 1; i >= 1; i--) {
    const rName = String(values[i][nIdx] || '').trim().toUpperCase();
    const rTel  = digitsOnly_(notes[i][0] || '');
    if (rName === wantName && rTel === wantTel) {
      const obj = {};
      headers.forEach(function(h, j) {
        const v = values[i][j];
        if (v instanceof Date) {
          obj[h] = (fmtTimeCol && h === '출발시간')
            ? Utilities.formatDate(v, 'Asia/Seoul', 'HH:mm')
            : Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
        } else {
          obj[h] = (v == null) ? '' : String(v);
        }
      });
      obj._rowIndex = i + 1;
      return { ok: true, data: obj };
    }
  }
  return { ok: false, msg: '일치하는 예약을 찾을 수 없습니다.' };
}

// 고객 예약 조회 (영문성함 + 연락처)
function lookupByContact(name, contact) {
  try { return lookupRowByContact_(SHEET_CUSTOMER, name, contact, false); }
  catch(e) { return { ok: false, msg: '오류: ' + e.message }; }
}
// 차량 렌트 조회 (영문성함 + 연락처)
function lookupCarRentByContact(name, contact) {
  try { return lookupRowByContact_(SHEET_CARRENT, name, contact, true); }
  catch(e) { return { ok: false, msg: '오류: ' + e.message }; }
}
// 예약번호는 사전 발급 — 자동 생성 없음

// =============================================
// [진단용] 연결 테스트
// =============================================
function ping() {
  return { ok: true, msg: '연결 성공', time: nowKST() };
}

// 시트 접근 테스트 (웹앱에서 호출)
function pingSheet() {
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var sheet = ss.getSheetByName(SHEET_CUSTOMER);
    if (!sheet) return { ok: false, msg: '시트 없음: ' + SHEET_CUSTOMER };
    var rows = sheet.getLastRow();
    return { ok: true, msg: '시트 접근 성공', rowCount: rows };
  } catch(e) {
    return { ok: false, msg: '시트 오류: ' + e.message };
  }
}

// 조회 직접 테스트 (웹앱에서 호출)
function lookupDirect(name, bookingNo) {
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var sheet = ss.getSheetByName(SHEET_CUSTOMER);
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    var bIdx = headers.indexOf('예약번호');
    var nIdx = headers.indexOf('대표자영문성함');
    for (var i = 1; i < rows.length; i++) {
      var rName = String(rows[i][nIdx]||'').trim().toUpperCase();
      var rBno  = String(rows[i][bIdx]||'').trim().toUpperCase();
      if (rName === name.trim().toUpperCase() && rBno === bookingNo.trim().toUpperCase()) {
        return { ok: true, rowIndex: i+1, name: rName, bookingNo: rBno,
                 product: String(rows[i][2]||''), date: String(rows[i][4]||'') };
      }
    }
    return { ok: false, msg: '일치 없음 (총 '+rows.length+'행, bIdx:'+bIdx+', nIdx:'+nIdx+')' };
  } catch(e) {
    return { ok: false, msg: e.message };
  }
}

// =============================================
// [진단용] 조회 테스트 — 편집기에서 직접 실행 후 로그 확인
// 실행: 함수 선택 → testLookup → ▶ 실행 → 실행 로그 확인
// =============================================
function testLookup() {
  const TEST_NAME = 'KIM MINSUNG';  // ← 실제 입력한 이름으로 바꿔서 테스트
  const TEST_BNO  = 'AA123';        // ← 실제 예약번호로 바꿔서 테스트

  const sheet   = getSheet(SHEET_CUSTOMER);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  Logger.log('=== 시트 헤더 ===');
  Logger.log(JSON.stringify(headers));
  Logger.log('총 데이터 행 수: ' + (rows.length - 1));

  const bIdx = headers.indexOf('예약번호');
  const nIdx = headers.indexOf('대표자영문성함');
  Logger.log('예약번호 열 index: ' + bIdx + '  /  대표자영문성함 열 index: ' + nIdx);

  if (bIdx === -1 || nIdx === -1) {
    Logger.log('❌ 헤더 없음 — fixCustomerSheetHeader() 실행 필요');
    return;
  }

  for (let i = 1; i < rows.length; i++) {
    const rName = String(rows[i][nIdx] || '').trim().toUpperCase();
    const rBno  = String(rows[i][bIdx] || '').trim().toUpperCase();
    Logger.log(`행 ${i+1}: 이름="${rName}" 예약번호="${rBno}"`);
    if (rName === TEST_NAME && rBno === TEST_BNO) {
      Logger.log('✅ 일치하는 행 발견: ' + (i + 1) + '행');
      return;
    }
  }
  Logger.log('❌ 일치하는 예약 없음 — 이름/예약번호 불일치 확인 필요');
}

// =============================================
// [최초 1회 실행] 시트 헤더 자동 수정
// Apps Script 편집기에서 직접 실행하세요
// =============================================
function fixCustomerSheetHeader() {
  const sheet   = getSheet(SHEET_CUSTOMER);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // '예약번호' 헤더가 이미 있으면 종료
  if (headers.indexOf('예약번호') !== -1) {
    Logger.log('이미 올바른 헤더입니다.');
    return;
  }

  // B열(index 1)에 예약번호 삽입
  sheet.insertColumnBefore(2);
  sheet.getRange(1, 2).setValue('예약번호');
  Logger.log('헤더 수정 완료: 예약번호 열이 B열에 추가되었습니다.');
}

// =============================================
// 상품 구성 목록 조회
// A열: 카테고리 구분 / B열: 상품명(상품 구성) / C열: 구분(상품유형) / D열: 시간 설정(쉼표구분)
// =============================================
function getProductList() {
  try {
    const sheet = getSheet(SHEET_PRODUCTS);
    const data  = sheet.getDataRange().getValues();
    const list  = [];
    for (let i = 1; i < data.length; i++) {
      const category = String(data[i][0] || '').trim();
      const name     = String(data[i][1] || '').trim();
      if (!category && !name) continue;
      list.push({
        category: category,
        name:     name,
        type:     String(data[i][2] || '').trim(),
        times:    String(data[i][3] || '').trim()
      });
    }
    return list;
  } catch(e) { return []; }
}

// =============================================
// 1. 고객 정보 입력 — 예약번호 자동 생성
// =============================================
const CUSTOMER_HEADERS = [
  '접수시간','예약번호','상품명','상품유형','투어날짜','대표자영문성함',
  '픽업호텔','드랍호텔','출발시간','성인','소아','소아만나이',
  '옵션메모','베드타입','여권 정보','비고','컨펌번호'
];

function submitCustomerInfo(d) {
  try {
    const sheet     = getSheet(SHEET_CUSTOMER);
    ensureHeader(sheet, CUSTOMER_HEADERS);
    // 예약번호는 '예약 정보' 시트에서 연락처로 매칭 (없으면 빈칸)
    const bookingNo = findBookingNoByContact_(d.contact);
    const rowValues = [
      nowKST(), bookingNo,
      d.category||'',      // C 상품명 = 1차 카테고리명
      d.productName||'',   // D 상품유형 = 상품 구성명 (A상품 등)
      d.tourDate||'', d.repName||'',
      d.pickupHotel||'', d.dropHotel||'', d.departureTime||'',
      d.adults||0, d.children||0, d.childrenAge||'',
      d.options||'', d.bedType||'',
      '',          // 여권 정보 (나중 입력 — 셀 메모에 탑승자별 정리)
      d.memo||'',
      ''           // 컨펌번호 (담당자 수기 입력)
    ];
    // A열 기준 마지막 데이터 다음 행에 입력 (S·X열 체크박스 무시)
    const targetRow = nextRowByColA_(sheet);
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);

    // D열(상품유형) 셀 메모 = 상품 구분(단독 투어/1박 2일 등)
    if (d.productType) {
      const dCol = CUSTOMER_HEADERS.indexOf('상품유형') + 1;
      sheet.getRange(targetRow, dCol).setNote(d.productType);
    }
    // F열(대표자영문성함) 셀 메모 = 연락처
    if (d.contact) {
      const fCol = CUSTOMER_HEADERS.indexOf('대표자영문성함') + 1;
      sheet.getRange(targetRow, fCol).setNote(d.contact);
    }
    return { ok: true, msg: '✅ 신청이 완료되었습니다!' };
  } catch(e) {
    return { ok: false, msg: '오류: ' + e.message };
  }
}

// =============================================
// 2. 예약 번호 + 영문명으로 고객 예약 조회
// =============================================
function lookupByBookingNo(name, bookingNo) {
  try {
    if (!name || !bookingNo) return { ok: false, msg: '영문 성함과 예약번호를 모두 입력해 주세요.' };
    const sheet   = getSheet(SHEET_CUSTOMER);
    const rows    = sheet.getDataRange().getValues();
    if (rows.length <= 1) return { ok: false, msg: '예약 내역이 없습니다.' };
    const headers = rows[0];

    const bIdx = headers.indexOf('예약번호');
    const nIdx = headers.indexOf('대표자영문성함');
    if (bIdx === -1) {
      return { ok: false, msg: '시트 헤더가 구버전입니다. fixCustomerSheetHeader() 함수를 실행해 주세요.' };
    }
    if (nIdx === -1) {
      return { ok: false, msg: '대표자영문성함 헤더를 찾을 수 없습니다.' };
    }

    for (let i = rows.length - 1; i >= 1; i--) {
      const rName = String(rows[i][nIdx] || '').trim().toUpperCase();
      const rBno  = String(rows[i][bIdx] || '').trim().toUpperCase();
      if (rName === name.trim().toUpperCase() && rBno === bookingNo.trim().toUpperCase()) {
        // Date 등 직렬화 불가 타입 → 모두 문자열로 변환
        const obj = {};
        headers.forEach(function(h, j) {
          const v = rows[i][j];
          if (v instanceof Date) {
            obj[h] = Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
          } else if (v === null || v === undefined) {
            obj[h] = '';
          } else {
            obj[h] = String(v);
          }
        });
        obj._rowIndex = i + 1;
        return { ok: true, data: obj };
      }
    }
    return { ok: false, msg: '일치하는 예약을 찾을 수 없습니다.' };
  } catch(e) {
    return { ok: false, msg: '오류: ' + e.message };
  }
}

// =============================================
// 3. 예약 변경 — '고객 정보 입력' 행 직접 수정 (변경 전 원본은 백업)
//    · 신청서에서 수정 가능한 필드만 덮어쓰기 (여권정보 등은 유지)
//    · 변경 전 데이터는 '예약 변경전 정보' 시트에 스냅샷
//    · 변경된 행의 예약번호 셀을 빨간색 볼드로 표시
// =============================================
function submitChange(d) {
  try {
    const sheet   = getSheet(SHEET_CUSTOMER);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const bIdx    = headers.indexOf('예약번호');
    const rowIdx  = d._rowIndex;
    if (!rowIdx || rowIdx < 2) return { ok: false, msg: '변경할 예약을 찾을 수 없습니다. 조회를 먼저 진행해 주세요.' };

    // 1) 변경 전 원본 스냅샷 → '예약 변경전 정보' (동일 구조)
    const oldRow = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
    const backup = getSheet(SHEET_CHANGE_BEFORE);
    ensureHeader(backup, headers);
    backup.appendRow(oldRow);

    // 2) 신청서에서 수정 가능한 필드만 덮어쓰기 (그 외 여권정보·비고·컨펌번호 등 유지)
    const updates = {
      '투어날짜':   d.tourDate    !== undefined ? d.tourDate    : '',
      '픽업호텔':   d.pickupHotel !== undefined ? d.pickupHotel : '',
      '드랍호텔':   d.dropHotel   !== undefined ? d.dropHotel   : '',
      '성인':       d.adults      !== undefined ? d.adults      : '',
      '소아':       d.children    !== undefined ? d.children    : '',
      '소아만나이': d.childrenAge !== undefined ? d.childrenAge : '',
      '옵션메모':   d.options     !== undefined ? d.options     : ''
    };
    headers.forEach(function(h, ci){
      if (Object.prototype.hasOwnProperty.call(updates, h)) {
        sheet.getRange(rowIdx, ci + 1).setValue(updates[h]);
      }
    });

    // 3) 예약번호 셀 빨간색 볼드 + 변경 이력 메모
    const bCell = sheet.getRange(rowIdx, bIdx + 1);
    bCell.setFontColor('#D32F2F').setFontWeight('bold');
    const prevNote = bCell.getNote();
    const stamp = nowKST() + ' 변경' + (d.changeMemo ? (' — ' + d.changeMemo) : '');
    bCell.setNote((prevNote ? prevNote + '\n' : '') + stamp);

    return { ok: true, msg: '✅ 예약 변경이 반영되었습니다.' };
  } catch(e) {
    return { ok: false, msg: '오류: ' + e.message };
  }
}

// =============================================
// 4. 차량 렌트 신청 — 예약번호 자동 생성
// =============================================
const CARRENT_HEADERS = [
  '접수시간','예약번호','운행날짜','대표자영문성함',
  '픽업호텔','드랍호텔','출발시간','운행일정','비고','최종수정시간'
];

function submitCarRent(d) {
  try {
    const sheet     = getSheet(SHEET_CARRENT);
    ensureHeader(sheet, CARRENT_HEADERS);
    // 예약번호는 '예약 정보' 시트에서 연락처로 매칭 (없으면 빈칸)
    const bookingNo = findBookingNoByContact_(d.contact);
    const rowValues = [
      nowKST(), bookingNo, d.driveDate||'', d.repName||'',
      d.pickupHotel||'', d.dropHotel||'', d.departureTime||'',
      d.schedule||'', d.memo||'', ''
    ];
    const targetRow = nextRowByColA_(sheet);
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    // D열(대표자영문성함) 셀 메모 = 연락처
    if (d.contact) {
      const dCol = CARRENT_HEADERS.indexOf('대표자영문성함') + 1;
      sheet.getRange(targetRow, dCol).setNote(d.contact);
    }
    return { ok: true, msg: '✅ 차량 렌트 신청이 완료되었습니다!' };
  } catch(e) {
    return { ok: false, msg: '오류: ' + e.message };
  }
}

// =============================================
// 5. 차량 렌트 예약 조회 (영문명 + 예약번호)
// =============================================
function lookupCarRentByBookingNo(name, bookingNo) {
  try {
    if (!name || !bookingNo) return { ok: false, msg: '영문 성함과 예약번호를 모두 입력해 주세요.' };
    const sheet   = getSheet(SHEET_CARRENT);
    const rows    = sheet.getDataRange().getValues();
    if (rows.length <= 1) return { ok: false, msg: '예약 내역이 없습니다.' };
    const headers = rows[0];
    const nIdx    = headers.indexOf('대표자영문성함');
    const bIdx    = headers.indexOf('예약번호');
    for (let i = rows.length - 1; i >= 1; i--) {
      const rName = String(rows[i][nIdx] || '').trim().toUpperCase();
      const rBno  = String(rows[i][bIdx] || '').trim().toUpperCase();
      if (rName === name.trim().toUpperCase() && rBno === bookingNo.trim().toUpperCase()) {
        // Date 등 직렬화 불가 타입 → 문자열 변환 (출발시간은 HH:mm)
        const obj = {};
        headers.forEach(function(h, j) {
          const v = rows[i][j];
          if (v instanceof Date) {
            obj[h] = (h === '출발시간')
              ? Utilities.formatDate(v, 'Asia/Seoul', 'HH:mm')
              : Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
          } else if (v === null || v === undefined) {
            obj[h] = '';
          } else {
            obj[h] = String(v);
          }
        });
        obj._rowIndex = i + 1;
        return { ok: true, data: obj };
      }
    }
    return { ok: false, msg: '일치하는 예약을 찾을 수 없습니다.' };
  } catch(e) {
    return { ok: false, msg: '오류: ' + e.message };
  }
}

// =============================================
// 6. 차량 렌트 예약 수정 (기존 행 업데이트)
// =============================================
function updateCarRent(d) {
  try {
    const sheet   = getSheet(SHEET_CARRENT);
    const all     = sheet.getDataRange().getValues();
    const headers = all[0];
    const rowIdx  = d._rowIndex;
    if (!rowIdx || rowIdx < 2) return { ok: false, msg: '행 정보를 찾을 수 없습니다.' };

    // 변경 전 원본 값 캡처 (메모 기록용)
    const oldRow = all[rowIdx - 1];
    function fmtOld(h) {
      const idx = headers.indexOf(h);
      if (idx === -1) return '';
      const v = oldRow[idx];
      if (v instanceof Date) {
        return (h === '출발시간')
          ? Utilities.formatDate(v, 'Asia/Seoul', 'HH:mm')
          : Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
      }
      return v == null ? '' : String(v);
    }

    // 변경 대상 필드
    const fields = {
      '운행날짜': d.driveDate    || '',
      '픽업호텔': d.pickupHotel  || '',
      '드랍호텔': d.dropHotel    || '',
      '출발시간': d.departureTime|| '',
      '운행일정': d.schedule     || '',
      '비고':     d.memo         || ''
    };

    // 변경 전 데이터 블록 (변경일자 포함)
    const beforeBlock = '[변경 전] ' + nowKST() + '\n' +
      Object.keys(fields).map(function(h){ return h + ': ' + fmtOld(h); }).join('\n');

    // 행 업데이트
    fields['최종수정시간'] = nowKST();
    headers.forEach(function(h, ci) {
      if (fields[h] !== undefined) sheet.getRange(rowIdx, ci + 1).setValue(fields[h]);
    });

    // B열(예약번호) 빨간색 볼드 + 셀 메모에 변경 전 데이터 누적
    const bIdx = headers.indexOf('예약번호');
    if (bIdx !== -1) {
      const bCell = sheet.getRange(rowIdx, bIdx + 1);
      bCell.setFontColor('#D32F2F').setFontWeight('bold');
      const prev = bCell.getNote();
      bCell.setNote((prev ? prev + '\n\n' : '') + beforeBlock);
    }

    return { ok: true, msg: '✅ 차량 렌트 예약이 변경되었습니다.' };
  } catch(e) {
    return { ok: false, msg: '오류: ' + e.message };
  }
}

// =============================================
// 7. 여권 정보 저장 (탑승자 인원수만큼) → '여권 정보' 열 셀 + 메모
// d = { _rowIndex, passengers: [ {passportName,gender,nationality,birthDate,passportNo,expiryDate,imageUrl}, ... ] }
// =============================================
function savePassportInfo(d) {
  try {
    const sheet   = getSheet(SHEET_CUSTOMER);
    const headers = sheet.getDataRange().getValues()[0];
    const rowIdx  = d._rowIndex;
    if (!rowIdx || rowIdx < 2) return { ok: false, msg: '행 정보를 찾을 수 없습니다.' };

    const pIdx = headers.indexOf('여권 정보');
    if (pIdx === -1) {
      return { ok: false, msg: '시트에 "여권 정보" 헤더가 없습니다. Apps Script 편집기에서 migratePassportColumn() 함수를 한 번 실행해 주세요.' };
    }

    const list = d.passengers || [];
    if (!list.length) return { ok: false, msg: '여권 정보가 없습니다.' };

    // 셀 값: 여권번호들을 쉼표로 (한눈에 식별)
    const passNos = list.map(function(p){ return p.passportNo || ''; }).filter(Boolean).join(', ');

    // 셀 메모: 탑승자별 블록
    const noteBlocks = list.map(function(p, i){
      const lines = [
        '[탑승자 ' + (i + 1) + ']',
        p.passportName || '',
        p.gender       || '',
        p.nationality  || '',
        p.birthDate    || '',
        p.passportNo   || '',
        p.expiryDate   || ''
      ];
      if (p.imageUrl) lines.push('이미지: ' + p.imageUrl);
      return lines.filter(Boolean).join('\n');
    }).join('\n\n');

    const cell = sheet.getRange(rowIdx, pIdx + 1);
    cell.setValue(passNos);
    cell.setNote(noteBlocks);

    // ── '여권 정보' 시트(raw data)에도 정리 ──
    const custRow = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
    function cv(h){
      const idx = headers.indexOf(h);
      if (idx === -1) return '';
      const val = custRow[idx];
      return (val instanceof Date) ? Utilities.formatDate(val, 'Asia/Seoul', 'yyyy-MM-dd') : String(val || '');
    }
    writePassportSheet_({
      '접수시간':       cv('접수시간'),
      '예약번호':       cv('예약번호'),
      '상품명':         cv('상품명'),
      '상품유형':       cv('상품유형'),
      '투어날짜':       cv('투어날짜'),
      '대표자영문성함': cv('대표자영문성함')
    }, passNos, noteBlocks);

    return { ok: true, msg: '✅ 여권 정보 ' + list.length + '건이 저장되었습니다.' };
  } catch(e) {
    return { ok: false, msg: '오류: ' + e.message };
  }
}

// 여권 정보 시트에 행 추가/갱신 (예약번호 기준 upsert) + '여권 정보' 열 메모
function writePassportSheet_(info, passNos, note) {
  const sheet = getSheet(SHEET_PASSPORT);
  ensureHeader(sheet, PASSPORT_HEADERS);

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const bIdx    = headers.indexOf('예약번호');
  const pIdx    = headers.indexOf('여권 정보');

  const bookingNo = String(info['예약번호'] || '').trim().toUpperCase();
  let targetRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][bIdx] || '').trim().toUpperCase() === bookingNo) { targetRow = i + 1; break; }
  }

  const rowValues = [
    info['접수시간'] || '', info['예약번호'] || '', info['상품명'] || '',
    info['상품유형'] || '', info['투어날짜'] || '', info['대표자영문성함'] || '', passNos
  ];

  if (targetRow === -1) {
    sheet.appendRow(rowValues);
    targetRow = sheet.getLastRow();
  } else {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  }

  // '여권 정보' 열 셀 메모에 탑승자별 상세 기입
  if (pIdx !== -1) sheet.getRange(targetRow, pIdx + 1).setNote(note);
}

// =============================================
// [최초 1회 실행] 옛 여권 열 7개 → '여권 정보' 단일 열로 마이그레이션
// =============================================
function migratePassportColumn() {
  const sheet = getSheet(SHEET_CUSTOMER);
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (headers.indexOf('여권 정보') !== -1) {
    Logger.log('이미 마이그레이션 완료 (여권 정보 열 존재)');
    return;
  }

  // 옛 여권 열 삭제 (오른쪽부터 → 인덱스 밀림 방지)
  const oldCols = ['여권영문성명','성별','국적','생년월일','여권번호','여권만료일','여권이미지URL'];
  const idxs = oldCols.map(function(h){ return headers.indexOf(h); })
                      .filter(function(i){ return i !== -1; })
                      .sort(function(a,b){ return b - a; });
  idxs.forEach(function(i){ sheet.deleteColumn(i + 1); });

  // '베드타입' 다음에 '여권 정보' 열 삽입
  headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const bedIdx = headers.indexOf('베드타입');
  const insertAt = bedIdx !== -1 ? bedIdx + 1 : sheet.getLastColumn();
  sheet.insertColumnAfter(insertAt);
  sheet.getRange(1, insertAt + 1).setValue('여권 정보');

  Logger.log('✅ 마이그레이션 완료: 여권 정보 열이 생성되었습니다.');
}

// =============================================
// [최초 1회 실행] '고객 정보 입력' 시트에 '컨펌번호' 열 추가
//  (비고 다음, 카드 링크 앞)
// =============================================
function addConfirmColumn() {
  const sheet   = getSheet(SHEET_CUSTOMER);
  let headers   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('컨펌번호') !== -1) { Logger.log('이미 컨펌번호 열 존재'); return; }

  const memoIdx = headers.indexOf('비고');
  const insertAt = memoIdx !== -1 ? memoIdx + 1 : sheet.getLastColumn();
  sheet.insertColumnAfter(insertAt);
  sheet.getRange(1, insertAt + 1).setValue('컨펌번호');
  Logger.log('✅ 컨펌번호 열이 추가되었습니다.');
}

// =============================================
// [최초 1회 실행] Drive 접근 권한 승인 (이미지 업로드 "액세스 거부" 해결)
// 편집기에서 실행 → 권한 팝업 → 허용
// =============================================
function authorizeDrive() {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log('✅ Drive 접근 성공: ' + folder.getName());
}

// =============================================
// 8. 여권 이미지 업로드 + OCR (고급 Drive 서비스 — 공유 드라이브 지원)
// =============================================

// '여권사진' 서브폴더 ID 반환 (없으면 생성)
function getPassportFolderId_() {
  const q = "name='여권사진' and '" + DRIVE_FOLDER_ID + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
  const res = Drive.Files.list({
    q: q,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id)'
  });
  if (res.files && res.files.length > 0) return res.files[0].id;

  const folder = Drive.Files.create(
    { name: '여권사진', mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_FOLDER_ID] },
    null,
    { supportsAllDrives: true }
  );
  return folder.id;
}

function uploadPassportImage(d) {
  try {
    const base64 = d.imageBase64.replace(/^data:[^;]+;base64,/, '');
    const bytes  = Utilities.base64Decode(base64);
    const blob   = Utilities.newBlob(bytes, d.mimeType || 'image/jpeg', d.filename || 'passport.jpg');

    const folderId = getPassportFolderId_();

    // 이미지 업로드 (공유 드라이브 지원)
    const imgFile = Drive.Files.create(
      { name: d.filename || 'passport.jpg', parents: [folderId] },
      blob,
      { supportsAllDrives: true }
    );
    const imgId = imgFile.id;

    // 링크 공개 (anyone with link → view)
    try {
      Drive.Permissions.create({ role: 'reader', type: 'anyone' }, imgId, { supportsAllDrives: true });
    } catch(_) {}

    // OCR (이미지 → 구글 문서 변환). 실패해도 업로드는 성공 처리
    let ocrText = '';
    try {
      const ocrFile = Drive.Files.copy(
        { name: '__ocr_' + (d.filename || 'p'),
          mimeType: 'application/vnd.google-apps.document',
          parents: [folderId] },
        imgId,
        { ocrLanguage: 'en', supportsAllDrives: true }
      );
      ocrText = DocumentApp.openById(ocrFile.id).getBody().getText();
      Drive.Files.update({ trashed: true }, ocrFile.id, null, { supportsAllDrives: true });
    } catch(_) {}

    const fileUrl = 'https://drive.google.com/file/d/' + imgId + '/view';
    return { ok: true, fileUrl: fileUrl, ocrText: ocrText };
  } catch(e) {
    return { ok: false, msg: '업로드 실패: ' + e.message };
  }
}

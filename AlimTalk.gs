/*****************************************************************************
 * AlimTalk.gs — 블룸AI(루나소프트 주피터) 알림톡 자동 발송
 * ---------------------------------------------------------------------------
 * - 발송 API : POST https://jupiter.lunasoft.co.kr/api/alimtalk/message/send
 * - 본 파일은 기존 전역상수/유틸을 "재사용"합니다 (중복 선언 금지).
 *     · SS_ID, SHEET_RESINFO, SHEET_CUSTOMER  → Code.gs
 *     · WEBAPP_BASE_URL                        → CardGen.gs
 *     · getSheet(name)                         → Code.gs
 *   ※ 위 이름들을 이 파일에서 다시 선언하면 "Identifier already declared" 오류.
 *
 * [발송 대상]
 *   '예약 정보'      시트 : 50043 (예약 신청서 작성 안내)
 *   '고객 정보 입력' 시트 : 50044 (고객정보 확인) / 50046 (여권 입력) / 50045 (변경완료)
 *****************************************************************************/

// ============================ 설정 (★ 운영 전 확인) =========================
const BLOOM_API_URL = 'https://jupiter.lunasoft.co.kr/api/alimtalk/message/send';

// ★ 블룸AI(주피터) 계정 userid — 콘솔/가입정보에서 확인 후 입력하세요. (api_key만으로는 발송 불가)
const BLOOM_USER_ID = '여기에_블룸AI_userid_입력';

// 발급받은 Appkey (= api_key)
const BLOOM_API_KEY = 'EVRE40RY6ALJ225QAY2FR5B7BEIPH4K8ELRZPML6';

// 알림톡 발송 실패 시 SMS 대체발송 여부 ('1' 발송 / '0' 미발송)
const ALIM_USE_SMS = '0';

/**
 * ★★★ 매우 중요 ★★★
 * 알림톡은 msg_content 가 "승인된 템플릿 본문"과 100% 일치해야 정상 발송됩니다.
 * (치환 변수가 없으므로 고정 텍스트 그대로) 카카오 비즈니스/블룸AI 콘솔에 등록된
 * 각 템플릿 본문을 아래에 토씨 하나 틀리지 않게 붙여넣으세요. (공백/줄바꿈/특수문자 포함)
 */
const ALIM_TEMPLATES = {
  '50043': `[아이러브베트남 예약 확인 안내]

안녕하세요, 아이러브베트남입니다.

고객님의 예약이 정상적으로 접수되었습니다.

※ 중요 ※
아래 예약 정보를 확인하신 후 반드시 "확인 완료" 버튼을 눌러주시기 바랍니다.

예약 진행을 위해 예약 신청서 작성이 필요하며,
신청서 작성이 완료되어야 예약 확인 및 확정 절차가 진행됩니다.

[예약 접수 절차]

1. 확인 완료 버튼 클릭
2. 예약 신청서 작성
(픽업 호텔 / 드랍 호텔 미정 시 "미정"으로 기입 가능)
3. 예약 확인 및 확정 진행

※ 예약 신청서는 반드시 작성해 주셔야 합니다.
※ 호텔이 미정인 경우 "미정"으로 작성 후 추후 변경 가능합니다.
※ 일부 상품은 예약 확정을 위해 여권정보 제출이 필요합니다.
※ 예약 정보 변경 시 예약 변경 요청서를 통해 수정 가능합니다.

감사합니다.

아이러브베트남 드림`,

  '50044': `[아이러브베트남 예약 정보 안내]

안녕하세요, 아이러브베트남입니다.

예약 신청서가 정상적으로 접수되었습니다.

아래 버튼을 클릭하여 현재 예약 정보를 확인해 주세요.

※ 예약 정보 변경이 필요한 경우 예약 변경 요청서를 이용해 주세요.
※ 예약 확정 후에는 투어 날짜 등 일부 변경이 제한될 수 있습니다.

감사합니다.

아이러브베트남 드림`,

  '50045': `[아이러브베트남 예약 변경 완료]

안녕하세요, 아이러브베트남입니다.

요청하신 예약 정보 변경이 정상적으로 반영되었습니다.

아래 버튼을 클릭하여 변경된 예약 정보를 확인해 주세요.

※ 추가 변경이 필요한 경우 예약 변경 요청서를 이용해 주세요.

감사합니다.

아이러브베트남 드림`,

  '50046': `[아이러브베트남 여권정보 제출 요청]

안녕하세요, 아이러브베트남입니다.

예약 진행을 위해 탑승자 전원의 여권정보 제출이 필요합니다.

예약하신 상품은 베트남 법령에 따라 하롱베이 등 해상 관광지역을 방문하는 모든 외국인은 해경 및 관계기관에 신상정보를 사전 등록해야 하며, 이를 위해 여권정보가 필요합니다.

[여권정보 제출 안내]

※ 투어 날짜가 많이 남은 경우 출발 7일 전까지,
늦어도 출발 3일 전까지는 반드시 제출 부탁드립니다.

※ 여권정보가 제출되지 않을 경우 선사 측의 승선 허가 요청이 어려워 당일 탑승이 제한됩니다.

※ 출발 당일까지 여권정보가 제출되지 않은 경우 별도의 확인 절차가 진행될 수 있으며, 이로 인해 발생하는 승선 지연 및 불이익에 대해서는 당사가 책임지기 어렵습니다.

※ 제출이 필요한 정보

1) 여권번호
2) 국적
3) 영문 성/이름
4) 생년월일
5) 성별
6) 여권 만료일

※ 제출해 주신 여권정보는 예약 진행을 위해 선사 및 관계기관에만 전달되며, 사용 후 안전하게 폐기됩니다.
※ 등록하신 여권 정보는 [예약 정보 확인] 버튼을 누르시면 확인하실 수 있습니다.

감사합니다.

아이러브베트남 드림`
};

// 응답 실패코드 설명(메모에 사람이 읽기 쉬운 사유로 기록)
const ALIM_CODE_DESC = {
  '2000':'요청 파라미터 이상','2001':'no 누락','2002':'tel_num 누락','2003':'msg_content 누락',
  '2004':'sms_content 누락','2005':'use_sms 누락','2006':'btn_url 누락','2007':'msg_content 길이초과',
  '2008':'sms_content 길이초과','2009':'유효하지 않은 전화번호','2010':'url_pc 길이초과',
  '2011':'url_mobile 길이초과','2012':'버튼 형식 오류','2013':'버튼 개수 초과','2014':'msg_content 4byte 문자 포함',
  '2017':'reserve_time 형식오류','2018':'메시지 1000개 초과','2019':'배송조회 필수값 누락','2020':'carrier_code 오류',
  '2021':'title 길이초과','2022':'sms_title 길이초과',
  '3000':'쇼핑몰 정보 없음','3001':'템플릿 정보 없음','3002':'회원정보 없음','3003':'탈퇴 회원',
  '3004':'비활성 회원','3005':'잔고 부족','3006':'금칙어 사용','4000':'서버 DB 오류'
};

// ----------------------------- 시트별 열 정의 -------------------------------
// '예약 정보' 시트 : 헤더 3행, 데이터 4행~
const RES_HEADER_ROW = 3;
const RES_COL_TEL    = 8;   // H 연락처
const RES_COL_LINK   = 10;  // J HTML 링크(결제 내용 확인)
const RES_COL_CHK    = 11;  // K 발송 체크박스
const RES_COL_DATE   = 12;  // L 발송일자
const RES_COL_STATUS = 13;  // M 발송상태(+실패 메모)

// '고객 정보 입력' 시트 : 헤더 1행, 데이터 2행~  (연락처는 F열 "메모")
const CUS_HEADER_ROW = 1;
const CUS_COL_B       = 2;   // B 텍스트(변경완료 체크 시 색/볼드 해제 대상)
const CUS_COL_TELNOTE = 6;   // F (셀 메모 = 연락처)
const CUS_COL_CONFIRM = 17;  // Q 컨펌번호
const CUS_COL_LINK    = 18;  // R HTML 링크
const CUS_COL_CHK1    = 19;  // S 고객정보확인 체크박스
const CUS_COL_DATE1   = 20;  // T 고객정보확인 발송일자
const CUS_COL_STAT1   = 21;  // U 고객정보확인 발송상태
const CUS_COL_DATE2   = 22;  // V 여권요청 발송일자
const CUS_COL_STAT2   = 23;  // W 여권요청 발송상태
const CUS_COL_CHK3    = 24;  // X 변경완료 체크박스
const CUS_COL_DATE3   = 25;  // Y 변경완료 발송일자
const CUS_COL_STAT3   = 26;  // Z 변경완료 발송상태

const ALIM_STAT_OK   = '발송 성공';
const ALIM_STAT_FAIL = '발송 실패';

// =============================== 일괄 발송 ================================
// 시간기반 트리거(예: 10분마다)에 이 함수를 연결하면 4종 알림톡이 자동 발송됩니다.
function alim_runAll() {
  const a = alim_processResInfo();
  const b = alim_processCustomerConfirm();
  const c = alim_processPassport();
  const d = alim_processChangeComplete();
  const sum = '[전체 발송 결과]\n' + a + '\n' + b + '\n' + c + '\n' + d;
  Logger.log(sum);
  try { SpreadsheetApp.getActive().toast(sum, '알림톡 발송 완료', 10); } catch (e) {}
  return sum;
}

// =========================== 핵심 발송 함수 ================================
/**
 * 알림톡 1건 발송.
 * @param {string|number} templateId
 * @param {string} telNum   하이픈 제거된 수신번호
 * @param {Array}  btnUrl   버튼 배열(템플릿 버튼 순서와 동일해야 함)
 * @return {{ok:boolean, reason:string}}
 */
function alim_send_(templateId, telNum, btnUrl) {
  const content = ALIM_TEMPLATES[String(templateId)] || '';
  const payload = {
    userid: BLOOM_USER_ID,
    api_key: BLOOM_API_KEY,
    template_id: Number(templateId),
    messages: [{
      no: '0',
      tel_num: telNum,
      msg_content: content,
      sms_content: content.substring(0, 900),   // 실패 SMS용(필수 필드)
      use_sms: ALIM_USE_SMS,
      btn_url: (btnUrl && btnUrl.length) ? btnUrl : null
    }]
  };

  let resp;
  try {
    resp = UrlFetchApp.fetch(BLOOM_API_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    return { ok: false, reason: '네트워크 오류: ' + err };
  }

  const httpCode = resp.getResponseCode();
  let body = {};
  try { body = JSON.parse(resp.getContentText() || '{}'); } catch (e) {}

  // 성공: HTTP 200 + code 0
  if (httpCode === 200 && Number(body.code) === 0) {
    return { ok: true, reason: '' };
  }

  // 실패 사유 추출
  let reason = '';
  if (body && body.msg && body.msg.messages && body.msg.messages[0]) {
    const m = body.msg.messages[0];
    reason = m.result_msg || ('[' + m.result_code + '] ' + (ALIM_CODE_DESC[String(m.result_code)] || ''));
  }
  if (!reason) {
    const c = (body && body.code != null) ? String(body.code) : String(httpCode);
    reason = '[' + c + '] ' + (ALIM_CODE_DESC[c] || resp.getContentText());
  }
  return { ok: false, reason: reason };
}

// =============================== 유틸 =====================================
function alim_tel_(raw) {
  let t = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
  if (t.indexOf('82') === 0 && t.length >= 11) t = '0' + t.slice(2); // +82 → 0
  return t;
}
function alim_now_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
}
function alim_isEmpty_(v) {
  return String(v == null ? '' : v).trim() === '';
}
function alim_btnLink_(url) {           // 가변링크 버튼 1개 객체
  return { url_pc: url, url_mobile: url };
}
// '고객 정보 입력' 시트 데이터 블록을 한 번에 읽어옴(왕복 통신 최소화).
// vals[i][열번호-1] 로 접근, notesF[i][0] = F열 메모(연락처)
function alim_readCustomer_(sh) {
  const last = sh.getLastRow();
  const start = CUS_HEADER_ROW + 1;
  if (last < start) return null;
  const n = last - start + 1;
  return {
    start: start,
    n: n,
    vals:   sh.getRange(start, 1, n, CUS_COL_STAT3).getValues(),   // A~Z 일괄
    notesF: sh.getRange(start, CUS_COL_TELNOTE, n, 1).getNotes()   // F열 메모 일괄
  };
}

// ====================== ① 예약 정보 시트 (50043) ===========================
// K열 체크 + L,M 공백 → 발송. 버튼1=예약신청서작성(웹앱), 버튼2=결제내용확인(J열 링크)
function alim_processResInfo() {
  const sh = getSheet(SHEET_RESINFO);
  const last = sh.getLastRow();
  const start = RES_HEADER_ROW + 1;
  if (last < start) return '예약 신청서 안내(50043): 대상 없음';

  const base = RES_COL_TEL;                                  // 읽기 시작 열(H)
  const n = last - start + 1;
  const vals = sh.getRange(start, base, n, RES_COL_STATUS - base + 1).getValues();
  let sent = 0, fail = 0;

  for (let i = 0; i < n; i++) {
    const row = vals[i];
    if (row[RES_COL_CHK - base] !== true) continue;             // K 체크
    if (!alim_isEmpty_(row[RES_COL_DATE - base])) continue;     // L (이미 발송)
    if (!alim_isEmpty_(row[RES_COL_STATUS - base])) continue;   // M

    const r     = start + i;
    const tel   = alim_tel_(row[RES_COL_TEL - base]);           // H
    const jlink = String(row[RES_COL_LINK - base] || '').trim();// J

    let res;
    if (!tel)        res = { ok: false, reason: '연락처(H열) 없음' };
    else if (!jlink) res = { ok: false, reason: 'HTML 링크(J열) 없음' };
    else {
      const btn = [
        {},                              // 1번 버튼(확인 완료 등)은 별도 설정 → 자리만 유지
        alim_btnLink_(WEBAPP_BASE_URL),  // 2번 [예약 신청서 작성] = 웹앱 메인(exec)
        alim_btnLink_(jlink)             // 3번 [결제 내용 확인]  = J열 링크
      ];
      res = alim_send_('50043', tel, btn);
    }
    alim_writeResult_(sh, r, RES_COL_DATE, RES_COL_STATUS, res);
    res.ok ? sent++ : fail++;
  }
  return '예약 신청서 안내(50043): 성공 ' + sent + ' / 실패 ' + fail;
}

// ============== ② 고객 정보 입력 — 고객정보 확인 (50044) ====================
// S열 체크 + T,U 공백 → 발송. 버튼1=예약정보확인(R열 링크), 버튼2=예약변경요청(웹앱)
function alim_processCustomerConfirm() {
  const sh = getSheet(SHEET_CUSTOMER);
  const d = alim_readCustomer_(sh);
  if (!d) return '고객정보 확인(50044): 대상 없음';
  let sent = 0, fail = 0;

  for (let i = 0; i < d.n; i++) {
    const row = d.vals[i];
    if (row[CUS_COL_CHK1 - 1] !== true) continue;            // S 체크
    if (!alim_isEmpty_(row[CUS_COL_DATE1 - 1])) continue;    // T
    if (!alim_isEmpty_(row[CUS_COL_STAT1 - 1])) continue;    // U

    const r     = d.start + i;
    const tel   = alim_tel_(d.notesF[i][0]);                 // 연락처 = F열 메모
    const rlink = String(row[CUS_COL_LINK - 1] || '').trim();// R

    let res;
    if (!tel)        res = { ok: false, reason: '연락처(F열 메모) 없음' };
    else if (!rlink) res = { ok: false, reason: 'HTML 링크(R열) 없음' };
    else {
      const btn = [
        {},                              // 1번 버튼(확인 완료 등)은 별도 설정 → 자리만 유지
        alim_btnLink_(rlink),            // 2번 [예약 정보 확인] = R열 링크
        alim_btnLink_(WEBAPP_BASE_URL)   // 3번 [예약 변경 요청] = 웹앱 메인(exec)
      ];
      res = alim_send_('50044', tel, btn);
    }
    alim_writeResult_(sh, r, CUS_COL_DATE1, CUS_COL_STAT1, res);
    res.ok ? sent++ : fail++;
  }
  return '고객정보 확인(50044): 성공 ' + sent + ' / 실패 ' + fail;
}

// ============== ③ 고객 정보 입력 — 여권 정보 입력 요청 (50046) ==============
// Q열 컨펌번호 有 + U열='발송 성공' + V,W 공백 → 발송.
// 버튼1=여권 정보 입력(웹앱 ?page=passport), 버튼2=예약 정보 확인(R열 링크)
function alim_processPassport() {
  const sh = getSheet(SHEET_CUSTOMER);
  const d = alim_readCustomer_(sh);
  if (!d) return '여권 정보 입력 요청(50046): 대상 없음';
  const passportUrl = WEBAPP_BASE_URL + '?page=passport';
  let sent = 0, fail = 0;

  for (let i = 0; i < d.n; i++) {
    const row = d.vals[i];
    const confirm = String(row[CUS_COL_CONFIRM - 1] || '').trim();   // Q
    const stat1   = String(row[CUS_COL_STAT1 - 1] || '').trim();     // U
    if (!confirm) continue;                 // 컨펌번호 없음
    if (stat1 !== ALIM_STAT_OK) continue;   // 고객정보 확인이 '발송 성공' 상태여야 함
    if (!alim_isEmpty_(row[CUS_COL_DATE2 - 1])) continue; // V (이미 발송)
    if (!alim_isEmpty_(row[CUS_COL_STAT2 - 1])) continue; // W

    const r     = d.start + i;
    const tel   = alim_tel_(d.notesF[i][0]);
    const rlink = String(row[CUS_COL_LINK - 1] || '').trim();

    let res;
    if (!tel)        res = { ok: false, reason: '연락처(F열 메모) 없음' };
    else if (!rlink) res = { ok: false, reason: 'HTML 링크(R열) 없음' };
    else {
      const btn = [
        alim_btnLink_(passportUrl),  // [여권 정보 입력] = 웹앱 ?page=passport
        alim_btnLink_(rlink)         // [예약 정보 확인] = R열 링크
      ];
      res = alim_send_('50046', tel, btn);
    }
    alim_writeResult_(sh, r, CUS_COL_DATE2, CUS_COL_STAT2, res);
    res.ok ? sent++ : fail++;
  }
  return '여권 정보 입력 요청(50046): 성공 ' + sent + ' / 실패 ' + fail;
}

// ============== ④ 고객 정보 입력 — 변경 사항 완료 (50045) ==================
// X열 체크 시 B열 글자색 검정+볼드 해제. X체크 + Y,Z 공백 → 발송. 버튼1=R열 링크.
// 발송 후 X열='완료', Y열=일자, Z열=상태(실패 시 메모에 사유).
function alim_processChangeComplete() {
  const sh = getSheet(SHEET_CUSTOMER);
  const d = alim_readCustomer_(sh);
  if (!d) return '변경 사항 완료(50045): 대상 없음';
  let sent = 0, fail = 0;

  for (let i = 0; i < d.n; i++) {
    const row = d.vals[i];
    if (row[CUS_COL_CHK3 - 1] !== true) continue;   // X 체크
    const r = d.start + i;

    // 체크되면 B열 텍스트 서식 초기화(검정·볼드 해제)
    sh.getRange(r, CUS_COL_B).setFontColor('#000000').setFontWeight('normal');

    if (!alim_isEmpty_(row[CUS_COL_DATE3 - 1])) continue;   // Y
    if (!alim_isEmpty_(row[CUS_COL_STAT3 - 1])) continue;   // Z

    const tel   = alim_tel_(d.notesF[i][0]);
    const rlink = String(row[CUS_COL_LINK - 1] || '').trim();

    let res;
    if (!tel)        res = { ok: false, reason: '연락처(F열 메모) 없음' };
    else if (!rlink) res = { ok: false, reason: 'HTML 링크(R열) 없음' };
    else {
      const btn = [ alim_btnLink_(rlink) ];   // 버튼 1개 = R열 링크
      res = alim_send_('50045', tel, btn);
    }
    alim_writeResult_(sh, r, CUS_COL_DATE3, CUS_COL_STAT3, res);

    // X열 체크박스 → '완료' 텍스트로 교체(재발송 방지)
    const xCell = sh.getRange(r, CUS_COL_CHK3);
    xCell.clearDataValidations();
    xCell.setValue('완료');

    res.ok ? sent++ : fail++;
  }
  return '변경 사항 완료(50045): 성공 ' + sent + ' / 실패 ' + fail;
}

// ===================== 결과 기록 공통 함수 ================================
function alim_writeResult_(sh, row, dateCol, statCol, res) {
  sh.getRange(row, dateCol).setValue(alim_now_());
  const cell = sh.getRange(row, statCol);
  if (res.ok) {
    cell.setValue(ALIM_STAT_OK);
    cell.clearNote();
  } else {
    cell.setValue(ALIM_STAT_FAIL);
    cell.setNote(res.reason || '발송 실패');
  }
}

// =============================================
// 체크박스_B열복구.gs  (별도 / 독립 스크립트)
//
// 용도: '차량 렌트 신청' 시트에서 L열(변경확인) 체크박스를 선택하면
//        해당 행 B열(예약번호)의 빨간 볼드 → 기본 상태로 복원
//
// ★ 설치 방법 (웹앱 재배포 불필요)
//   1. 스프레드시트 열기
//   2. 상단 메뉴 [확장 프로그램] → [Apps Script]
//   3. 이 파일 내용 전체를 붙여넣기 → 저장 (Ctrl/Cmd + S)
//   4. 끝! (simple onEdit 트리거는 자동 작동 — 별도 트리거 등록·배포 불필요)
//
//   ※ 반드시 "스프레드시트에 연결된 스크립트"(확장 프로그램 → Apps Script)에
//     붙여넣어야 onEdit이 자동 실행됩니다. (웹앱 프로젝트가 아님)
// =============================================

function onEdit(e) {
  if (!e || !e.range) return;

  const SHEET_NAME  = '차량 렌트 신청';
  const CONFIRM_COL = 12;  // L열 = 변경확인 체크박스
  const BOOKING_COL = 2;   // B열 = 예약번호

  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row < 2 || col !== CONFIRM_COL) return;

  // 체크(TRUE)일 때만 B열 예약번호 스타일 복원 (셀 메모/이력은 유지)
  if (e.range.getValue() !== true) return;

  sheet.getRange(row, BOOKING_COL)
       .setFontColor(null)
       .setFontWeight('normal');
}

/**
 * WebAppAPI.gs — انسخ هذا الملف في Extensions > Apps Script داخل الشيت
 * ثم اضغط Deploy > New deployment > Web app (Who has access: Anyone)
 * وضع الرابط الناتج في إعدادات التطبيق!
 */
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const kashf = ss.getSheets().find(s => !s.isSheetHidden() && s.getName().includes("كشف اسرة"));
  const eft = ss.getSheets().find(s => !s.isSheetHidden() && s.getName().includes("افتقاد 20"));
  const dir = ss.getSheetByName("دليل التليفونات وواتساب");
  const bday = ss.getSheetByName("اعياد ميلاد");
  const hal = ss.getSheetByName("الحالة");
  const rep = ss.getSheetByName("سجل تقارير الأولاد");
  const wa = ss.getSheetByName("افتقاد واتساب");

  const eftRows = eft.getRange("B3:G45").getValues();
  const dirRows = dir.getRange("C4:K48").getValues();
  const bdayRows = bday.getRange("B2:C45").getValues();
  const halRows = hal.getRange("B2:C45").getValues();
  const kashfRows = kashf.getRange("B3:F45").getValues();

  // آخر جمعة مسجلة في افتقاد واتساب
  const fridayLabel = wa.getRange("B1").getDisplayValue();
  const absentNames = new Set(wa.getRange("C4:C50").getValues().flat().filter(Boolean));
  const twoFridaysSet = new Set();
  const waRows = wa.getRange("C4:J50").getValues();
  for (const r of waRows) {
    if (r[0] && String(r[7]).includes("جمعتين")) twoFridaysSet.add(String(r[0]).trim());
  }

  const boys = [];
  for (let i = 0; i < eftRows.length; i++) {
    const name = String(eftRows[i][1] || "").trim();
    if (!name) continue;
    const dr = dirRows[i] || [];
    const br = bdayRows[i] || [];
    const hr = halRows[i] || [];
    const kr = kashfRows[i] || [];

    const dobVal = br[1] instanceof Date ? Utilities.formatDate(br[1], "Africa/Cairo", "yyyy-MM-dd") : String(br[1] || "");

    boys.push({
      id: i + 1,
      name: name,
      firstName: name.split(" ")[0],
      area: String(eftRows[i][0] || ""),
      servant: String(eftRows[i][2] || ""),
      address: String(eftRows[i][3] || ""),
      mapUrl: String(eftRows[i][5] || ""),
      momPhone: String(dr[1] || ""),
      dadPhone: String(dr[3] || ""),
      boyPhone: String(dr[5] || ""),
      extraPhone: String(dr[7] || ""),
      extraLabel: String(dr[8] || ""),
      dob: dobVal,
      condition: String(hr[1] || ""),
      annualCount: Number(kr[1] || 0),
      massCount: Number(kr[2] || 0),
      monthlyAbsences: Number(kr[4] || 0),
      presentLastFriday: !absentNames.has(name),
      massLastFriday: false,
      missedTwoFridays: twoFridaysSet.has(name)
    });
  }

  const repRows = rep.getRange("B2:G150").getValues();
  const reports = [];
  for (const r of repRows) {
    if (r[1] && r[4]) {
      reports.push({
        date: r[0] instanceof Date ? Utilities.formatDate(r[0], "Africa/Cairo", "yyyy-MM-dd") : String(r[0] || ""),
        boyName: String(r[1]),
        servant: String(r[2] || ""),
        type: String(r[3] || ""),
        note: String(r[4] || ""),
        status: String(r[5] || "متابعة طبيعية")
      });
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ fridayLabel, boys, reports }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (payload.type === "attendance") {
    const kashf = ss.getSheets().find(s => !s.isSheetHidden() && s.getName().includes("كشف اسرة"));
    const wa = ss.getSheetByName("افتقاد واتساب");
    const targetDate = wa.getRange("B1").getValue();
    const headers = kashf.getRange(2, 1, 1, kashf.getLastColumn()).getValues()[0];
    let colIdx = -1;
    for (let c = 6; c < headers.length; c++) {
      if (headers[c] instanceof Date && targetDate instanceof Date && headers[c].getTime() === targetDate.getTime()) {
        colIdx = c + 1;
        break;
      }
    }
    if (colIdx > 0) {
      const names = kashf.getRange("B3:B45").getValues().flat();
      const rowOffset = names.findIndex(n => String(n).trim() === String(payload.boyName).trim());
      if (rowOffset >= 0) {
        kashf.getRange(rowOffset + 3, colIdx).setValue(Boolean(payload.present));
        if (payload.mass !== undefined && headers[colIdx - 2] === "قداس الخدمة") {
          kashf.getRange(rowOffset + 3, colIdx - 1).setValue(Boolean(payload.mass));
        }
      }
    }
  } else if (payload.type === "report") {
    const rep = ss.getSheetByName("سجل تقارير الأولاد");
    const nextRow = rep.getRange("C2:C200").getValues().findIndex(r => !r[0]) + 2;
    if (nextRow >= 2) {
      rep.getRange(nextRow, 2, 1, 6).setValues([[
        new Date(),
        payload.boyName,
        payload.servant,
        payload.category || "افتقاد منزلي",
        payload.note,
        payload.status || "متابعة طبيعية"
      ]]);
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

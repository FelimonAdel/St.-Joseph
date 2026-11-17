/**
 * app.js — المنطق التفاعلي لتطبيق أسرة القديس يوسف البار (PWA + Offline + Auto-Sync)
 */
(function () {
  let state = null;
  let currentTab = "home";
  let currentServant = localStorage.getItem("st_joseph_servant") || "";
  let attFilter = "all";
  let followFilter = "absent";
  let searchQuery = "";

  const $ = (id) => document.getElementById(id);

  // تسجيل Service Worker للعمل Offline
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // تهيئة شاشة الدخول
  function initLogin() {
    $("verseBox").textContent = window.APP_CONFIG.verse;
    const sel = $("loginServant");
    sel.innerHTML = window.APP_CONFIG.servants
      .map((s) => `<option value="${s.name}">${s.name}</option>`)
      .join("");

    if (currentServant) {
      showMainApp();
      return;
    }

    $("loginBtn").onclick = () => {
      const name = sel.value;
      const pin = $("loginPin").value.trim();
      const found = window.APP_CONFIG.servants.find((s) => s.name === name);
      if (!found || pin !== found.pin) {
        alert("كود الدخول غير صحيح! راجع الكود من config.js");
        return;
      }
      currentServant = name;
      localStorage.setItem("st_joseph_servant", name);
      showMainApp();
    };
  }

  async function showMainApp() {
    $("loginScreen").classList.add("hidden");
    $("mainApp").classList.remove("hidden");
    $("servantGreeting").textContent = `أهلاً أ/ ${currentServant}`;

    const loaded = await window.AppAPI.loadInitialData();
    state = loaded.data;
    await updateSyncBar();
    renderTab();

    // مزامنة تلقائية عند عودة الإنترنت + عند الرجوع للتطبيق + كل 30 ثانية في الخلفية
    async function autoSyncSilently() {
      if (!navigator.onLine || !window.AppAPI.getApiUrl()) return;
      // لا نعيد الرسم أثناء فتح نافذة أو الكتابة في خانة بحث/تقرير
      const isTyping = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
      const modalOpen = !$("modalBackdrop").classList.contains("hidden");
      await window.AppAPI.syncQueue();
      const fresh = await window.AppAPI.loadInitialData();
      if (fresh.source === "live") {
        state = fresh.data;
        await updateSyncBar();
        if (!isTyping && !modalOpen) renderTab();
      }
    }

    window.addEventListener("online", async () => {
      await autoSyncSilently();
      await updateSyncBar();
    });
    window.addEventListener("offline", updateSyncBar);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") autoSyncSilently();
    });
    setInterval(autoSyncSilently, 30000);
  }

  async function updateSyncBar() {
    const q = await window.LocalDB.getQueue();
    const online = navigator.onLine;
    const hasApi = Boolean(window.AppAPI.getApiUrl());
    let txt = online ? "🟢 متصل بالإنترنت" : "🟠 وضع Offline (محفوظ محلياً)";
    if (hasApi && online && q.length === 0) txt += " • متزامن مع الشيت";
    if (!hasApi) txt += " • وضع تجريبي (اربط الشيت من المزيد)";
    if (q.length > 0) txt += ` • (${q.length} تعديل بانتظار المزامنة)`;
    $("syncStatus").textContent = txt;
  }

  function normAr(s) {
    return String(s || "").trim().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  }

  function waUrl(phone, text) {
    const clean = String(phone || "").replace(/[^0-9]/g, "");
    if (!clean) return "";
    const intl = clean.startsWith("20") ? clean : "20" + (clean.startsWith("0") ? clean.slice(1) : clean);
    return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
  }

  function avatarHtml(boy) {
    if (boy.photoUrl) return `<div class="avatar"><img src="${boy.photoUrl}" alt="${boy.firstName}" /></div>`;
    const initials = (boy.firstName || "؟").slice(0, 2);
    return `<div class="avatar">${initials}</div>`;
  }

  function getMsg(key) {
    return localStorage.getItem("msg_" + key) || window.APP_CONFIG.defaultMessages[key];
  }

  // التنقل بين التبويبات
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      searchQuery = "";
      renderTab();
    };
  });

  $("logoutBtn").onclick = () => {
    localStorage.removeItem("st_joseph_servant");
    location.reload();
  };

  $("syncNowBtn").onclick = async () => {
    const res = await window.AppAPI.syncQueue();
    const loaded = await window.AppAPI.loadInitialData();
    state = loaded.data;
    await updateSyncBar();
    renderTab();
    alert(`تمت المزامنة: ${res.processed} عملية مرفوعة، المتبقي: ${res.remaining}`);
  };

  $("closeModalBtn").onclick = () => $("modalBackdrop").classList.add("hidden");

  function renderTab() {
    if (!state) return;
    const root = $("tabContent");
    if (currentTab === "home") renderHome(root);
    else if (currentTab === "attendance") renderAttendance(root);
    else if (currentTab === "followup") renderFollowup(root);
    else if (currentTab === "boys") renderBoys(root);
    else if (currentTab === "more") renderMore(root);
  }

  // 1. الرئيسية (Dashboard)
  function renderHome(root) {
    const boys = state.boys || [];
    const presentCount = boys.filter((b) => b.presentLastFriday).length;
    const absentCount = boys.length - presentCount;
    const urgentCount = boys.filter((b) => b.monthlyAbsences >= 3).length;
    const twoFriCount = boys.filter((b) => b.missedTwoFridays).length;

    const now = new Date();
    const upcomingBdays = boys.filter((b) => {
      if (!b.dob) return false;
      const parts = b.dob.split(/[-/]/);
      if (parts.length < 3) return false;
      const bd = new Date(now.getFullYear(), Number(parts[1]) - 1, Number(parts[2]));
      const diff = (bd - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000;
      return diff >= 0 && diff <= 7;
    });

    root.innerHTML = `
      <div class="hero-banner">
        <img src="./assets/st-joseph-hero.jpg" alt="القديس يوسف البار" />
        <div class="hero-banner-text">
          <h3>شفيع الأسرة: القديس يوسف البار</h3>
          <p>${window.APP_CONFIG.verse}</p>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card"><div class="lbl">إجمالي الأولاد</div><div class="val">${boys.length}</div></div>
        <div class="kpi-card green"><div class="lbl">حضور (${state.fridayLabel || "آخر جمعة"})</div><div class="val">${presentCount}</div></div>
        <div class="kpi-card amber"><div class="lbl">غياب آخر جمعة</div><div class="val">${absentCount}</div></div>
        <div class="kpi-card red"><div class="lbl">حالات URGENT (3+)</div><div class="val">${urgentCount}</div></div>
      </div>

      <div class="card">
        <h4 class="card-title">🎂 أعياد ميلاد الأسبوع (${upcomingBdays.length})</h4>
        ${
          upcomingBdays.length === 0
            ? `<p style="color:var(--muted);margin:0;font-size:13px;">لا توجد أعياد ميلاد خلال الـ 7 أيام القادمة.</p>`
            : upcomingBdays
                .map((b) => {
                  const link = waUrl(b.momPhone || b.extraPhone || b.dadPhone, getMsg("birthday").replaceAll("{الاسم}", b.firstName));
                  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
                    <span><b>${b.name}</b> <small style="color:var(--muted);">(${b.dob})</small></span>
                    ${link ? `<a class="btn btn-emerald btn-sm" href="${link}" target="_blank">🎉 تهنئة</a>` : ""}
                  </div>`;
                })
                .join("")
        }
      </div>

      <div class="card">
        <h4 class="card-title">⚠️ غابوا جمعتين متتاليتين (${twoFriCount})</h4>
        <p style="color:var(--muted);margin:0;font-size:13px;">اضغط على تبويب <b>الافتقاد</b> بالأسفل للتواصل معهم بضغطة زر.</p>
      </div>
    `;
  }

  // 2. الحضور (Attendance — Instant 0ms UI + Background Sync)
  function renderAttendance(root) {
    root.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>✅ كشف حضور: ${state.fridayLabel || "الجمعة"}</span>
          <span id="attBadge" class="badge badge-blue">${state.boys.filter((b) => b.presentLastFriday).length} / ${state.boys.length}</span>
        </div>
        <input class="search-box" id="attSearch" placeholder="🔍 ابحث باسم الولد..." value="${searchQuery}" />
        <div class="pills">
          <button class="pill ${attFilter === "all" ? "active" : ""}" data-f="all">الكل (${state.boys.length})</button>
          <button class="pill ${attFilter === "present" ? "active" : ""}" data-f="present">حاضرين</button>
          <button class="pill ${attFilter === "absent" ? "active" : ""}" data-f="absent">غائبين</button>
        </div>
      </div>
      <div id="attList"></div>
    `;

    function drawAttList() {
      let list = state.boys || [];
      if (attFilter === "present") list = list.filter((b) => b.presentLastFriday);
      if (attFilter === "absent") list = list.filter((b) => !b.presentLastFriday);
      if (searchQuery) {
        const q = normAr(searchQuery);
        list = list.filter((b) => normAr(b.name).includes(q));
      }
      $("attBadge").textContent = `${state.boys.filter((b) => b.presentLastFriday).length} / ${state.boys.length}`;

      const listEl = $("attList");
      listEl.innerHTML = list.map((b) => `
        <div class="boy-card">
          <div class="boy-top">
            ${avatarHtml(b)}
            <div class="boy-info">
              <p class="boy-name">${b.name}</p>
              <div class="boy-meta">
                <span>📍 ${b.area || "—"}</span>
                <span>• حضور سنوي: ${b.annualCount}</span>
              </div>
            </div>
          </div>
          <div class="boy-actions">
            <button class="toggle-btn ${b.presentLastFriday ? "present" : ""}" data-id="${b.id}" data-kind="present">
              ${b.presentLastFriday ? "✓ حضر الخدمة" : "○ غائب"}
            </button>
            <button class="toggle-btn ${b.massLastFriday ? "mass-on" : ""}" data-id="${b.id}" data-kind="mass">
              ${b.massLastFriday ? "⛪ حضر القداس" : "○ القداس"}
            </button>
          </div>
        </div>
      `).join("") || `<div class="card" style="text-align:center;color:var(--muted);">لا توجد نتائج مطابقة</div>`;

      listEl.querySelectorAll(".toggle-btn").forEach((btn) => {
        btn.onclick = () => {
          const boy = state.boys.find((x) => x.id === Number(btn.dataset.id));
          if (!boy) return;
          if (btn.dataset.kind === "present") {
            boy.presentLastFriday = !boy.presentLastFriday;
            btn.classList.toggle("present", boy.presentLastFriday);
            btn.textContent = boy.presentLastFriday ? "✓ حضر الخدمة" : "○ غائب";
          } else {
            boy.massLastFriday = !boy.massLastFriday;
            btn.classList.toggle("mass-on", boy.massLastFriday);
            btn.textContent = boy.massLastFriday ? "⛪ حضر القداس" : "○ القداس";
          }
          $("attBadge").textContent = `${state.boys.filter((b) => b.presentLastFriday).length} / ${state.boys.length}`;

          // حفظ ومزامنة في الخلفية بدون تأخير الواجهة
          window.LocalDB.setState("appData", state).then(() =>
            window.AppAPI.queueOrSend({
              type: "attendance",
              boyName: boy.name,
              present: boy.presentLastFriday,
              mass: boy.massLastFriday,
              servant: currentServant
            })
          ).then(updateSyncBar);
        };
      });
    }

    $("attSearch").oninput = (e) => { searchQuery = e.target.value; drawAttList(); };
    root.querySelectorAll(".pill").forEach((p) => {
      p.onclick = () => {
        root.querySelectorAll(".pill").forEach((x) => x.classList.remove("active"));
        p.classList.add("active");
        attFilter = p.dataset.f;
        drawAttList();
      };
    });
    drawAttList();
  }

  // 3. الافتقاد (WhatsApp + Filters — Smooth Search)
  function renderFollowup(root) {
    root.innerHTML = `
      <div class="card">
        <div class="card-title" id="folTitle">💬 الافتقاد السريع</div>
        <label>رسالة الأم (استخدم {الاسم})</label>
        <input id="tplMom" value="${getMsg("mother")}" />
        <label>رسالة الولد (استخدم {الاسم})</label>
        <input id="tplBoy" value="${getMsg("boy")}" />
        <input id="folSearch" placeholder="🔍 ابحث باسم الولد..." value="${searchQuery}" />
        <div class="pills">
          <button class="pill ${followFilter === "absent" ? "active" : ""}" data-f="absent">كل الغائبين</button>
          <button class="pill ${followFilter === "two" ? "active" : ""}" data-f="two">⚠️ جمعتين ورا بعض</button>
          <button class="pill ${followFilter === "urgent" ? "active" : ""}" data-f="urgent">🔴 URGENT</button>
          <button class="pill ${followFilter === "mine" ? "active" : ""}" data-f="mine">أولادي فقط</button>
        </div>
      </div>
      <div id="folList"></div>
    `;

    function drawFolList() {
      let list = (state.boys || []).filter((b) => !b.presentLastFriday);
      if (followFilter === "urgent") list = list.filter((b) => b.monthlyAbsences >= 3);
      if (followFilter === "two") list = list.filter((b) => b.missedTwoFridays);
      if (followFilter === "mine") list = list.filter((b) => b.servant === currentServant);
      if (searchQuery) {
        const q = normAr(searchQuery);
        list = list.filter((b) => normAr(b.name).includes(q));
      }
      $("folTitle").textContent = `💬 الافتقاد السريع (غائبين: ${list.length})`;

      $("folList").innerHTML = list.map((b) => {
        const momPhone = b.momPhone || b.extraPhone || b.dadPhone;
        const momLink = waUrl(momPhone, getMsg("mother").replaceAll("{الاسم}", b.firstName));
        const boyLink = waUrl(b.boyPhone, getMsg("boy").replaceAll("{الاسم}", b.firstName));
        const prio = b.monthlyAbsences >= 3
          ? `<span class="badge badge-red">🔴 URGENT (${b.monthlyAbsences})</span>`
          : b.monthlyAbsences === 2
          ? `<span class="badge badge-amber">🟡 متابعة (2)</span>`
          : `<span class="badge badge-green">🟢 عادي</span>`;

        return `
          <div class="boy-card">
            <div class="boy-top">
              ${avatarHtml(b)}
              <div class="boy-info">
                <p class="boy-name">${b.name}</p>
                <div class="boy-meta">
                  ${prio}
                  ${b.missedTwoFridays ? `<span class="badge badge-red">⚠️ غاب جمعتين</span>` : ""}
                  ${b.servant ? `<span class="badge badge-blue">👤 ${b.servant}</span>` : ""}
                </div>
              </div>
            </div>
            <div class="boy-actions">
              ${momLink ? `<a class="btn btn-emerald btn-sm" href="${momLink}" target="_blank">💬 واتساب الأم</a>` : ""}
              ${boyLink ? `<a class="btn btn-blue btn-sm" href="${boyLink}" target="_blank">📱 واتساب الولد</a>` : ""}
              ${b.mapUrl ? `<a class="btn btn-outline btn-sm" href="${b.mapUrl}" target="_blank">📍 اللوكيشن</a>` : ""}
              <button class="btn btn-amber btn-sm" onclick="window.openBoyProfile(${b.id})">📝 تقرير</button>
            </div>
          </div>
        `;
      }).join("") || `<div class="card" style="text-align:center;color:var(--muted);">🎉 لا يوجد غياب في هذا التصنيف!</div>`;
    }

    $("tplMom").onchange = (e) => { localStorage.setItem("msg_mother", e.target.value); drawFolList(); };
    $("tplBoy").onchange = (e) => { localStorage.setItem("msg_boy", e.target.value); drawFolList(); };
    $("folSearch").oninput = (e) => { searchQuery = e.target.value; drawFolList(); };
    root.querySelectorAll(".pill").forEach((p) => {
      p.onclick = () => {
        root.querySelectorAll(".pill").forEach((x) => x.classList.remove("active"));
        p.classList.add("active");
        followFilter = p.dataset.f;
        drawFolList();
      };
    });
    drawFolList();
  }

  // 4. دليل الأولاد وملفاتهم (Smooth Search)
  function renderBoys(root) {
    root.innerHTML = `
      <div class="card">
        <div class="card-title" id="boysTitle">👦 دليل الأولاد</div>
        <input id="boySearch" placeholder="🔍 ابحث بالاسم أو المنطقة..." value="${searchQuery}" />
      </div>
      <div id="boysList"></div>
    `;

    function drawBoysList() {
      let list = state.boys || [];
      if (searchQuery) {
        const q = normAr(searchQuery);
        list = list.filter((b) => normAr(b.name).includes(q) || normAr(b.area).includes(q));
      }
      $("boysTitle").textContent = `👦 دليل الأولاد (${list.length})`;
      $("boysList").innerHTML = list.map((b) => `
        <div class="boy-card" style="cursor:pointer;" onclick="window.openBoyProfile(${b.id})">
          <div class="boy-top">
            ${avatarHtml(b)}
            <div class="boy-info">
              <p class="boy-name">${b.name}</p>
              <div class="boy-meta">
                <span>📍 ${b.area || "—"}</span>
                ${b.servant ? `<span>• 👤 ${b.servant}</span>` : ""}
              </div>
            </div>
            <span style="color:var(--primary);font-weight:800;">عرض ←</span>
          </div>
        </div>
      `).join("") || `<div class="card" style="text-align:center;color:var(--muted);">لا توجد نتائج مطابقة</div>`;
    }

    $("boySearch").oninput = (e) => { searchQuery = e.target.value; drawBoysList(); };
    drawBoysList();
  }

  // نافذة ملف الولد + رفع الصورة + إضافة تقرير
  window.openBoyProfile = function (boyId) {
    const boy = state.boys.find((b) => b.id === boyId);
    if (!boy) return;
    $("modalTitle").textContent = boy.name;
    const boyReports = (state.reports || []).filter((r) => r.boyName === boy.name);

    $("modalBody").innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
        <div class="avatar" style="width:70px;height:70px;font-size:24px;">
          ${boy.photoUrl ? `<img src="${boy.photoUrl}" />` : (boy.firstName || "؟").slice(0,2)}
        </div>
        <div>
          <label class="btn btn-outline btn-sm" style="margin:0;cursor:pointer;">
            📷 تغيير / إضافة صورة الولد
            <input type="file" accept="image/*" id="photoInput" class="hidden" />
          </label>
          <div style="font-size:12px;color:var(--muted);margin-top:4px;">📍 ${boy.area || "—"} • 🎂 ${boy.dob || "غير مسجل"}</div>
        </div>
      </div>

      <div class="card" style="background:#F8FAFC;">
        <div style="font-size:13px;"><b>العنوان:</b> ${boy.address || "غير مسجل"}</div>
        <div style="font-size:13px;margin-top:4px;"><b>الظروف والحالة:</b> ${boy.condition || "لا توجد ملاحظات مسجلة"}</div>
        <div class="boy-actions" style="margin-top:10px;">
          ${boy.momPhone ? `<a class="btn btn-emerald btn-sm" href="tel:${boy.momPhone}">📞 الأم</a>` : ""}
          ${boy.dadPhone ? `<a class="btn btn-blue btn-sm" href="tel:${boy.dadPhone}">📞 الأب</a>` : ""}
          ${boy.boyPhone ? `<a class="btn btn-outline btn-sm" href="tel:${boy.boyPhone}">📱 الولد</a>` : ""}
          ${boy.mapUrl ? `<a class="btn btn-amber btn-sm" href="${boy.mapUrl}" target="_blank">📍 Google Maps</a>` : ""}
        </div>
      </div>

      <div class="card">
        <h4 class="card-title">📝 إضافة تقرير جديد (يحفظ أوفلاين وأونلاين)</h4>
        <select id="repCat">
          <option>افتقاد منزلي</option>
          <option>اتصال / واتساب</option>
          <option>حضور / خدمة</option>
          <option>ملاحظة سلوكية / نفسية</option>
          <option>ظرف عائلي</option>
        </select>
        <select id="repStatus">
          <option>متابعة طبيعية</option>
          <option>يحتاج افتقاد عاجل</option>
          <option>تم التعامل</option>
        </select>
        <textarea id="repNote" rows="3" placeholder="اكتب تفاصيل التقرير أو الملاحظة هنا..."></textarea>
        <button id="saveRepBtn" class="btn btn-primary">💾 حفظ التقرير</button>
      </div>

      <div class="card">
        <h4 class="card-title">📚 سجل التقارير السابقة (${boyReports.length})</h4>
        ${
          boyReports.length === 0
            ? `<p style="color:var(--muted);font-size:13px;margin:0;">لا توجد تقارير سابقة مسجلة محلياً.</p>`
            : boyReports
                .slice()
                .reverse()
                .map((r) => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
                  <div><b>${r.date}</b> • <span class="badge badge-blue">${r.servant}</span> <span class="badge badge-amber">${r.status}</span></div>
                  <div style="margin-top:4px;">${r.note}</div>
                </div>`)
                .join("")
        }
      </div>
    `;

    $("photoInput").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          const size = 240;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
          boy.photoUrl = dataUrl;
          await window.LocalDB.savePhoto(boy.name, dataUrl);
          window.openBoyProfile(boy.id);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    };

    $("saveRepBtn").onclick = async () => {
      const note = $("repNote").value.trim();
      if (!note) return alert("اكتب نص التقرير أولاً");
      const newRep = {
        type: "report",
        date: new Date().toISOString().slice(0, 10),
        boyName: boy.name,
        servant: currentServant,
        category: $("repCat").value,
        status: $("repStatus").value,
        note
      };
      state.reports = state.reports || [];
      state.reports.push(newRep);
      await window.LocalDB.setState("appData", state);
      await window.AppAPI.queueOrSend(newRep);
      await updateSyncBar();
      window.openBoyProfile(boy.id);
    };

    $("modalBackdrop").classList.remove("hidden");
  };

  // 5. المزيد (الخدام + الإعدادات + ربط الشيت)
  function renderMore(root) {
    const apiUrl = window.AppAPI.getApiUrl();
    root.innerHTML = `
      <div class="card">
        <h4 class="card-title">🔗 ربط التطبيق بشيت جوجل (Live Sync)</h4>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 8px;">
          انشر ملف <code>apps-script/WebAppAPI.gs</code> داخل Google Apps Script كـ Web App والصق الرابط هنا ليتزامن التطبيق مع الشيت مباشرة.
        </p>
        <input id="apiUrlInput" placeholder="https://script.google.com/macros/s/.../exec" value="${apiUrl}" />
        <button id="saveApiBtn" class="btn btn-primary">حفظ الرابط ومزامنة البيانات</button>
      </div>

      <div class="card">
        <h4 class="card-title">👥 خدام الأسرة (${window.APP_CONFIG.servants.length})</h4>
        ${window.APP_CONFIG.servants
          .map((s) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13.5px;">
            <b>أ/ ${s.name}</b>
            <span class="badge badge-blue">كود الدخول: ${s.pin}</span>
          </div>`)
          .join("")}
      </div>

      <div class="card">
        <h4 class="card-title">🚌 الرحلة الحالية</h4>
        <div style="font-size:13.5px;">
          <div><b>الاسم:</b> ${state.trip?.title || "رحلة / يوم روحي جديد"}</div>
          <div><b>التاريخ:</b> ${state.trip?.date || "2026-12-04"} • <b>الاشتراك:</b> ${state.trip?.price || 150} ج</div>
        </div>
      </div>
    `;

    $("saveApiBtn").onclick = async () => {
      window.AppAPI.setApiUrl($("apiUrlInput").value);
      const loaded = await window.AppAPI.loadInitialData();
      state = loaded.data;
      await updateSyncBar();
      alert(loaded.source === "live" ? "✅ تم الربط والمزامنة مع الشيت بنجاح!" : "تم حفظ الرابط (تأكد من الاتصال أو صلاحية الرابط).");
    };
  }

  initLogin();
})();

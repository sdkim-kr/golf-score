"use strict";

/* ===== 상수 ===== */
const MAX_MEMBERS = 8;
const DATA_PATH = "data/db.json";
const COST_FIELDS = [
  ["greenFee", "그린피"],
  ["cart", "카트"],
  ["caddie", "캐디"],
  ["food", "식사"],
  ["other", "기타"],
];
const COLORS = ["#2e7d32", "#1565c0", "#c62828", "#ef6c00", "#6a1b9a", "#00838f", "#827717", "#4e342e"];

/* ===== 상태 ===== */
let db = { version: 1, groups: [], rounds: [] };
let sha = null; // GitHub 파일 sha
let groupId = localStorage.getItem("golf.group") || "";
let period = { type: "all", from: "", to: "" };

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
const fix1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

/* ===== 설정 ===== */
function inferRepo() {
  const m = location.hostname.match(/^(.+)\.github\.io$/);
  if (!m) return { owner: "", repo: "" };
  const repo = location.pathname.split("/").filter(Boolean)[0] || `${m[1]}.github.io`;
  return { owner: m[1], repo };
}
function getCfg() {
  const saved = JSON.parse(localStorage.getItem("golf.cfg") || "{}");
  const inf = inferRepo();
  return {
    owner: saved.owner ?? inf.owner,
    repo: saved.repo ?? inf.repo,
    branch: saved.branch || "main",
    token: saved.token || "",
  };
}
const isGithub = () => {
  const c = getCfg();
  return !!(c.owner && c.repo);
};
const canWrite = () => !isGithub() || !!getCfg().token;

/* ===== 저장소 계층 ===== */
const b64enc = (s) => btoa(unescape(encodeURIComponent(s)));
const b64dec = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));

function apiUrl(c) {
  return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${DATA_PATH}`;
}
function headers(c) {
  const h = { Accept: "application/vnd.github+json" };
  if (c.token) h.Authorization = `Bearer ${c.token}`;
  return h;
}
function normalize(d) {
  return { version: 1, groups: d.groups || [], rounds: d.rounds || [] };
}

async function load() {
  if (isGithub()) {
    const c = getCfg();
    try {
      const res = await fetch(`${apiUrl(c)}?ref=${encodeURIComponent(c.branch)}`, { headers: headers(c), cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        sha = json.sha;
        db = normalize(JSON.parse(b64dec(json.content)));
        return;
      }
      if (res.status === 401) setStatus("토큰이 올바르지 않습니다. 설정을 확인하세요.", true);
    } catch (e) {
      /* 아래 fallback */
    }
    try {
      const res = await fetch(`${DATA_PATH}?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        db = normalize(await res.json());
        sha = null;
        return;
      }
    } catch (e) {
      /* 무시 */
    }
    throw new Error("데이터를 불러오지 못했습니다.");
  }
  // 로컬 모드
  const local = localStorage.getItem("golf.db");
  if (local) {
    db = normalize(JSON.parse(local));
    return;
  }
  try {
    const res = await fetch(`${DATA_PATH}?t=${Date.now()}`);
    if (res.ok) db = normalize(await res.json());
  } catch (e) {
    /* file:// 등에서는 빈 DB로 시작 */
  }
}

async function save(message) {
  if (!isGithub()) {
    localStorage.setItem("golf.db", JSON.stringify(db));
    return;
  }
  const c = getCfg();
  if (!c.token) throw new Error("토큰이 없어 저장할 수 없습니다.");
  const body = { message, content: b64enc(JSON.stringify(db, null, 2) + "\n"), branch: c.branch };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl(c), {
    method: "PUT",
    headers: { ...headers(c), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 409 || res.status === 422) throw new Error("다른 사람이 먼저 저장했습니다. 다시 시도해 주세요.");
    if (res.status === 401 || res.status === 403 || res.status === 404)
      throw new Error("저장 권한이 없습니다. 토큰 권한(Contents: Read and write)과 repo 이름을 확인하세요.");
    throw new Error(`저장 실패 (${res.status})`);
  }
  sha = (await res.json()).content.sha;
}

/* 최신 데이터를 다시 읽고 → 변경 적용 → 저장 */
async function mutate(message, fn) {
  setStatus("저장 중...");
  try {
    await load();
    fn();
    await save(message);
    setStatus("저장되었습니다.");
    render();
    return true;
  } catch (e) {
    setStatus(e.message, true);
    alert(e.message);
    await load().catch(() => {});
    render();
    return false;
  }
}

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isError ? "#ffcdd2" : "#fff";
}

/* ===== 헬퍼 ===== */
const curGroup = () => db.groups.find((g) => g.id === groupId) || null;
const roundCost = (r) => COST_FIELDS.reduce((s, [k]) => s + (Number(r.costs?.[k]) || 0), 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function shiftMonths(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function periodRange() {
  const y = new Date().getFullYear();
  switch (period.type) {
    case "year": return [`${y}-01-01`, `${y}-12-31`];
    case "lastyear": return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case "m3": return [shiftMonths(3), "9999-12-31"];
    case "m6": return [shiftMonths(6), "9999-12-31"];
    case "custom": return [period.from || "0000-01-01", period.to || "9999-12-31"];
    default: return ["0000-01-01", "9999-12-31"];
  }
}
function groupRounds(filtered = true) {
  const [from, to] = filtered ? periodRange() : ["0000-01-01", "9999-12-31"];
  return db.rounds
    .filter((r) => r.groupId === groupId && r.date >= from && r.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ===== 렌더링 ===== */
function render() {
  // 그룹 선택
  if (!db.groups.some((g) => g.id === groupId)) groupId = db.groups[0]?.id || "";
  localStorage.setItem("golf.group", groupId);
  $("groupSelect").innerHTML = db.groups.length
    ? db.groups.map((g) => `<option value="${esc(g.id)}" ${g.id === groupId ? "selected" : ""}>${esc(g.name)}</option>`).join("")
    : `<option value="">(그룹 없음)</option>`;
  renderDashboard();
  renderRounds();
  renderGroups();
  renderSettings();
}

function noGroupMsg() {
  return `<div class="card">먼저 <b>그룹/멤버</b> 탭에서 그룹을 만들어 주세요.</div>`;
}
function readonlyNote() {
  return canWrite() ? "" : `<div class="readonly-note">읽기 전용입니다. 기록하려면 <b>설정</b> 탭에서 GitHub 토큰을 입력하세요.</div>`;
}

/* --- 분석 --- */
function renderDashboard() {
  const el = $("tab-dashboard");
  const g = curGroup();
  if (!g) { el.innerHTML = noGroupMsg(); return; }

  const rounds = groupRounds();
  const opts = [["all", "전체"], ["year", "올해"], ["lastyear", "작년"], ["m3", "최근 3개월"], ["m6", "최근 6개월"], ["custom", "직접 지정"]];
  let html = `<div class="card"><div class="row">
    <label class="field">기간
      <select id="periodType">${opts.map(([v, l]) => `<option value="${v}" ${period.type === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    </label>
    ${period.type === "custom" ? `
      <label class="field">시작<input type="date" id="pFrom" value="${esc(period.from)}"></label>
      <label class="field">종료<input type="date" id="pTo" value="${esc(period.to)}"></label>` : ""}
  </div></div>`;

  if (!rounds.length) {
    el.innerHTML = html + `<div class="card">해당 기간에 기록된 라운딩이 없습니다.</div>`;
    bindDashboard();
    return;
  }

  // 멤버별 통계
  const stats = g.members.map((m, i) => {
    const sc = rounds.map((r) => r.scores?.[m.id]).filter((v) => Number.isFinite(v));
    const recent = sc.slice(-5);
    return {
      m, color: COLORS[i % COLORS.length], n: sc.length,
      avg: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null,
      best: sc.length ? Math.min(...sc) : null,
      worst: sc.length ? Math.max(...sc) : null,
      recent: recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null,
    };
  });
  const totalCost = rounds.reduce((s, r) => s + roundCost(r), 0);
  const allScores = rounds.flatMap((r) => Object.values(r.scores || {})).filter(Number.isFinite);
  const [first, last] = [rounds[0].date, rounds[rounds.length - 1].date];

  html += `<div class="card"><h2>요약</h2><div class="stats">
    <div class="stat">라운딩 수<b>${rounds.length}회</b></div>
    <div class="stat">그룹 평균 타수<b>${allScores.length ? fix1(allScores.reduce((a, b) => a + b, 0) / allScores.length) : "-"}</b></div>
    <div class="stat">1인당 평균 비용<b>${won(totalCost / rounds.length)}</b></div>
    <div class="stat">1인당 비용 합계<b>${won(totalCost)}</b></div>
  </div><p class="muted">${esc(first)} ~ ${esc(last)}</p></div>`;

  // 순위표
  const ranked = [...stats].sort((a, b) => (a.avg ?? 1e9) - (b.avg ?? 1e9));
  html += `<div class="card"><h2>멤버별 기록 (평균 타수 순)</h2><table>
    <tr><th>순위/이름</th><th>횟수</th><th>평균</th><th>베스트</th><th>최근5회</th><th>워스트</th></tr>
    ${ranked.map((s, i) => `<tr><td>${s.n ? i + 1 : "-"}. ${esc(s.m.name)}</td><td>${s.n}</td>
      <td>${s.avg == null ? "-" : fix1(s.avg)}</td><td>${s.best ?? "-"}</td>
      <td>${s.recent == null ? "-" : fix1(s.recent)}</td><td>${s.worst ?? "-"}</td></tr>`).join("")}
  </table></div>`;

  // 추이 차트
  html += `<div class="card"><h2>스코어 추이</h2>${lineChart(rounds, stats)}
    <div class="legend">${stats.filter((s) => s.n).map((s) => `<span style="--c:${s.color}">${esc(s.m.name)}</span>`).join("")}</div></div>`;

  // 골프장별
  const byCourse = {};
  rounds.forEach((r) => {
    const c = (byCourse[r.course] ||= { n: 0, sc: [], cost: 0 });
    c.n++; c.cost += roundCost(r);
    c.sc.push(...Object.values(r.scores || {}).filter(Number.isFinite));
  });
  html += `<div class="card"><h2>골프장별</h2><table>
    <tr><th>골프장</th><th>횟수</th><th>평균 타수</th><th>1인당 평균 비용</th></tr>
    ${Object.entries(byCourse).sort((a, b) => b[1].n - a[1].n).map(([name, c]) => `<tr><td>${esc(name)}</td><td>${c.n}</td>
      <td>${c.sc.length ? fix1(c.sc.reduce((a, b) => a + b, 0) / c.sc.length) : "-"}</td><td>${won(c.cost / c.n)}</td></tr>`).join("")}
  </table></div>`;

  // 월별
  const byMonth = {};
  rounds.forEach((r) => {
    const k = r.date.slice(0, 7);
    const c = (byMonth[k] ||= { n: 0, sc: [], cost: 0 });
    c.n++; c.cost += roundCost(r);
    c.sc.push(...Object.values(r.scores || {}).filter(Number.isFinite));
  });
  html += `<div class="card"><h2>월별</h2><table>
    <tr><th>월</th><th>횟수</th><th>평균 타수</th><th>1인당 비용 합계</th></tr>
    ${Object.entries(byMonth).sort().reverse().map(([k, c]) => `<tr><td>${esc(k)}</td><td>${c.n}</td>
      <td>${c.sc.length ? fix1(c.sc.reduce((a, b) => a + b, 0) / c.sc.length) : "-"}</td><td>${won(c.cost)}</td></tr>`).join("")}
  </table></div>`;

  el.innerHTML = html;
  bindDashboard();
}

function bindDashboard() {
  $("periodType").onchange = (e) => { period.type = e.target.value; renderDashboard(); };
  if ($("pFrom")) $("pFrom").onchange = (e) => { period.from = e.target.value; renderDashboard(); };
  if ($("pTo")) $("pTo").onchange = (e) => { period.to = e.target.value; renderDashboard(); };
}

function lineChart(rounds, stats) {
  const W = 640, H = 240, L = 36, R = 12, T = 12, B = 28;
  const pts = stats.flatMap((s) => rounds.map((r) => r.scores?.[s.m.id]).filter(Number.isFinite));
  if (!pts.length) return `<p class="muted">데이터가 없습니다.</p>`;
  let lo = Math.floor(Math.min(...pts) / 5) * 5 - 5, hi = Math.ceil(Math.max(...pts) / 5) * 5 + 5;
  if (hi === lo) hi = lo + 10;
  const n = rounds.length;
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="멤버별 스코어 추이 차트">`;
  for (let v = lo; v <= hi; v += 5) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e8e3"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const step = Math.ceil(n / 8);
  rounds.forEach((r, i) => {
    if (i % step === 0) svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(r.date.slice(2))}</text>`;
  });
  stats.forEach((s) => {
    const seg = rounds.map((r, i) => [i, r.scores?.[s.m.id]]).filter(([, v]) => Number.isFinite(v));
    if (!seg.length) return;
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${seg.map(([i, v]) => `${x(i)},${y(v)}`).join(" ")}"/>`;
    seg.forEach(([i, v]) => {
      svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${s.color}"><title>${esc(s.m.name)} ${esc(rounds[i].date)}: ${v}타</title></circle>`;
    });
  });
  return svg + `</svg>`;
}

/* --- 라운딩 --- */
function renderRounds() {
  const el = $("tab-rounds");
  const g = curGroup();
  if (!g) { el.innerHTML = noGroupMsg(); return; }
  const rounds = groupRounds(false).reverse();
  const name = (id) => g.members.find((m) => m.id === id)?.name || "(삭제된 멤버)";
  el.innerHTML = readonlyNote() + `<div class="row"><button class="primary" id="addRound" ${canWrite() && g.members.length ? "" : "disabled"}>+ 라운딩 추가</button>
    ${g.members.length ? "" : `<span class="muted">멤버를 먼저 추가하세요.</span>`}</div>` +
    (rounds.length ? rounds.map((r) => `<div class="card">
      <div class="row" style="justify-content:space-between;margin:0">
        <div><b>${esc(r.date)}</b> · ${esc(r.course)}</div>
        <div><button data-edit="${esc(r.id)}" ${canWrite() ? "" : "disabled"}>수정</button>
        <button class="danger" data-del="${esc(r.id)}" ${canWrite() ? "" : "disabled"}>삭제</button></div>
      </div>
      <p>${Object.entries(r.scores || {}).map(([id, v]) => `${esc(name(id))} <b>${esc(v)}</b>`).join(" · ")}</p>
      <p class="muted">1인당 ${won(roundCost(r))} (${COST_FIELDS.filter(([k]) => r.costs?.[k]).map(([k, l]) => `${l} ${won(r.costs[k])}`).join(", ") || "비용 없음"})
      ${r.memo ? `<br>메모: ${esc(r.memo)}` : ""}</p></div>`).join("") : `<div class="card">기록이 없습니다.</div>`);

  if ($("addRound")) $("addRound").onclick = () => openRoundDialog();
  el.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openRoundDialog(b.dataset.edit)));
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    if (!confirm("이 라운딩 기록을 삭제할까요?")) return;
    mutate("라운딩 삭제", () => { db.rounds = db.rounds.filter((r) => r.id !== b.dataset.del); });
  }));
}

function openRoundDialog(id) {
  const g = curGroup();
  const r = id ? db.rounds.find((x) => x.id === id) : null;
  const d = $("roundDialog");
  d.innerHTML = `<form method="dialog" id="roundForm">
    <h2>${r ? "라운딩 수정" : "라운딩 추가"}</h2>
    <div class="row">
      <label class="field">날짜<input type="date" id="fDate" required value="${esc(r?.date || today())}"></label>
      <label class="field" style="flex:1">골프장<input type="text" id="fCourse" required maxlength="50" value="${esc(r?.course || "")}" list="courseList"></label>
      <datalist id="courseList">${[...new Set(db.rounds.map((x) => x.course))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
    </div>
    <h3>1인당 비용 (원)</h3>
    <div class="cost-grid">${COST_FIELDS.map(([k, l]) => `<label class="field">${l}<input type="number" min="0" step="1000" inputmode="numeric" data-cost="${k}" value="${esc(r?.costs?.[k] ?? "")}"></label>`).join("")}</div>
    <h3>총타수 (불참자는 비워두세요)</h3>
    <div class="score-grid">${g.members.map((m) => `<label for="s_${esc(m.id)}">${esc(m.name)}</label>
      <input type="number" id="s_${esc(m.id)}" data-score="${esc(m.id)}" min="30" max="200" inputmode="numeric" value="${esc(r?.scores?.[m.id] ?? "")}">`).join("")}</div>
    <label class="field" style="margin-top:10px">메모<textarea id="fMemo" rows="2" maxlength="300">${esc(r?.memo || "")}</textarea></label>
    <div class="actions"><button type="button" id="cancelRound">취소</button><button type="submit" class="primary">저장</button></div>
  </form>`;
  d.showModal();
  $("cancelRound").onclick = () => d.close();
  $("roundForm").onsubmit = async (e) => {
    e.preventDefault();
    const scores = {};
    d.querySelectorAll("[data-score]").forEach((i) => {
      if (i.value !== "") scores[i.dataset.score] = Math.round(Number(i.value));
    });
    if (!Object.keys(scores).length) { alert("최소 한 명의 타수를 입력하세요."); return; }
    const costs = {};
    d.querySelectorAll("[data-cost]").forEach((i) => { if (i.value !== "") costs[i.dataset.cost] = Math.max(0, Number(i.value)); });
    const rec = {
      id: r?.id || uid(), groupId: g.id, date: $("fDate").value, course: $("fCourse").value.trim(),
      costs, memo: $("fMemo").value.trim(), scores,
    };
    d.close();
    await mutate(r ? "라운딩 수정" : "라운딩 추가", () => {
      const idx = db.rounds.findIndex((x) => x.id === rec.id);
      if (idx >= 0) db.rounds[idx] = rec; else db.rounds.push(rec);
    });
  };
}

/* --- 그룹/멤버 --- */
function renderGroups() {
  const el = $("tab-groups");
  const dis = canWrite() ? "" : "disabled";
  el.innerHTML = readonlyNote() + `<div class="card"><h2>새 그룹</h2><div class="row">
      <label class="field">그룹 이름<input id="newGroup" maxlength="30"></label>
      <button class="primary" id="addGroup" ${dis}>그룹 추가</button></div></div>` +
    db.groups.map((g) => `<div class="card" data-g="${esc(g.id)}">
      <div class="row"><label class="field">그룹 이름<input data-gname value="${esc(g.name)}" maxlength="30"></label>
        <button data-gsave ${dis}>이름 저장</button><button class="danger" data-gdel ${dis}>그룹 삭제</button></div>
      <h3>멤버 (${g.members.length}/${MAX_MEMBERS})</h3>
      ${g.members.map((m) => `<div class="member-item" data-m="${esc(m.id)}">
        <input data-mname value="${esc(m.name)}" maxlength="20" aria-label="멤버 이름">
        <button data-msave ${dis}>저장</button><button class="danger" data-mdel ${dis}>삭제</button></div>`).join("")}
      <div class="member-item"><input data-newm maxlength="20" placeholder="새 멤버 이름" aria-label="새 멤버 이름" ${g.members.length >= MAX_MEMBERS ? "disabled" : ""}>
        <button data-madd ${g.members.length >= MAX_MEMBERS ? "disabled" : dis}>멤버 추가</button></div>
    </div>`).join("");

  $("addGroup").onclick = () => {
    const name = $("newGroup").value.trim();
    if (!name) return alert("그룹 이름을 입력하세요.");
    mutate("그룹 추가", () => { db.groups.push({ id: uid(), name, members: [] }); groupId = db.groups[db.groups.length - 1].id; });
  };
  el.querySelectorAll("[data-g]").forEach((card) => {
    const gid = card.dataset.g;
    const find = () => db.groups.find((x) => x.id === gid);
    card.querySelector("[data-gsave]").onclick = () => {
      const name = card.querySelector("[data-gname]").value.trim();
      if (!name) return alert("이름을 입력하세요.");
      mutate("그룹 이름 변경", () => { const g = find(); if (g) g.name = name; });
    };
    card.querySelector("[data-gdel]").onclick = () => {
      if (!confirm("그룹과 이 그룹의 모든 라운딩 기록이 삭제됩니다. 계속할까요?")) return;
      mutate("그룹 삭제", () => {
        db.groups = db.groups.filter((x) => x.id !== gid);
        db.rounds = db.rounds.filter((r) => r.groupId !== gid);
      });
    };
    card.querySelector("[data-madd]").onclick = () => {
      const name = card.querySelector("[data-newm]").value.trim();
      if (!name) return alert("멤버 이름을 입력하세요.");
      mutate("멤버 추가", () => {
        const g = find();
        if (!g) return;
        if (g.members.length >= MAX_MEMBERS) throw new Error(`멤버는 최대 ${MAX_MEMBERS}명입니다.`);
        if (g.members.some((m) => m.name === name)) throw new Error("같은 이름의 멤버가 있습니다.");
        g.members.push({ id: uid(), name });
      });
    };
    card.querySelectorAll("[data-m]").forEach((row) => {
      const mid = row.dataset.m;
      row.querySelector("[data-msave]").onclick = () => {
        const name = row.querySelector("[data-mname]").value.trim();
        if (!name) return alert("이름을 입력하세요.");
        mutate("멤버 이름 변경", () => { const m = find()?.members.find((x) => x.id === mid); if (m) m.name = name; });
      };
      row.querySelector("[data-mdel]").onclick = () => {
        const used = db.rounds.some((r) => r.groupId === gid && r.scores && mid in r.scores);
        if (!confirm(used ? "이 멤버의 점수 기록도 함께 삭제됩니다. 계속할까요?" : "멤버를 삭제할까요?")) return;
        mutate("멤버 삭제", () => {
          const g = find();
          if (!g) return;
          g.members = g.members.filter((m) => m.id !== mid);
          db.rounds.forEach((r) => { if (r.groupId === gid && r.scores) delete r.scores[mid]; });
        });
      };
    });
  });
}

/* --- 설정 --- */
function renderSettings() {
  const el = $("tab-settings");
  const c = getCfg();
  el.innerHTML = `<div class="card"><h2>GitHub 연동</h2>
    <p class="muted">데이터는 저장소의 <code>${DATA_PATH}</code> 파일에 저장됩니다. 토큰은 이 브라우저에만 보관되며 저장소에 올라가지 않습니다.</p>
    <div class="row">
      <label class="field">계정(owner)<input id="cOwner" value="${esc(c.owner)}"></label>
      <label class="field">저장소(repo)<input id="cRepo" value="${esc(c.repo)}"></label>
      <label class="field">브랜치<input id="cBranch" value="${esc(c.branch)}"></label>
    </div>
    <div class="row"><label class="field" style="flex:1">Personal Access Token (쓰기용)
      <input id="cToken" type="password" autocomplete="off" value="${esc(c.token)}"></label></div>
    <p class="muted">계정/저장소를 비우면 이 브라우저에만 저장되는 로컬 모드로 동작합니다. 현재: <b>${isGithub() ? "GitHub 모드" : "로컬 모드"}</b></p>
    <div class="actions" style="justify-content:flex-start">
      <button class="primary" id="saveCfg">설정 저장</button>
      <button id="clearToken">토큰 삭제</button>
      <button id="exportDb">JSON 내보내기</button>
    </div></div>`;
  $("saveCfg").onclick = async () => {
    localStorage.setItem("golf.cfg", JSON.stringify({
      owner: $("cOwner").value.trim(), repo: $("cRepo").value.trim(),
      branch: $("cBranch").value.trim() || "main", token: $("cToken").value.trim(),
    }));
    await init();
  };
  $("clearToken").onclick = () => {
    const s = JSON.parse(localStorage.getItem("golf.cfg") || "{}");
    s.token = "";
    localStorage.setItem("golf.cfg", JSON.stringify({ ...getCfg(), ...s }));
    render();
  };
  $("exportDb").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }));
    a.download = "golf-db.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

/* ===== 초기화 ===== */
async function init() {
  setStatus("불러오는 중...");
  try {
    await load();
    setStatus(isGithub() ? (canWrite() ? "GitHub 연결됨 (쓰기 가능)" : "GitHub 연결됨 (읽기 전용)") : "로컬 모드");
  } catch (e) {
    setStatus(e.message, true);
  }
  render();
}

document.querySelectorAll(".tab").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === b));
    ["dashboard", "rounds", "groups", "settings"].forEach((t) => ($("tab-" + t).hidden = t !== b.dataset.tab));
  };
});
$("groupSelect").onchange = (e) => { groupId = e.target.value; render(); };
init();

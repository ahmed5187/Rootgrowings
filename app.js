/* RootGrowings web app prototype */
const $ = (s) => document.querySelector(s);
const grid = $("#grid");
const empty = $("#empty");
const addBtn = $("#addBtn");
const exportBtn = $("#exportBtn");
const importBtn = $("#importBtn");
const importFile = $("#importFile");
const dialog = $("#plantDialog");
const form = $("#plantForm");

const DB_KEY = "rg_plants_v1";
let plants = load();

function load() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || []; }
  catch { return []; }
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(plants)); }

function baseIntervalDays(type) {
  // tiny base table
  const map = {
    "Monstera deliciosa": 7,
    "Epipremnum aureum": 7,
    "Spathiphyllum": 6,
    "Sansevieria": 14,
    "Ficus elastica": 10
  };
  return map[type] || 8;
}

function lightFactor(level) {
  return level === "bright" ? 0.8 : level === "low" ? 1.2 : 1.0;
}
function seasonFactor(date) {
  const m = date.getMonth() + 1;
  if (m >= 6 && m <= 8) return 0.9; // summer
  if (m == 12 || m <= 2) return 1.1; // winter
  return 1.0; // spring fall
}
function potFactor(cm) {
  if (!cm) return 1.0;
  if (cm < 12) return 0.9;
  if (cm > 18) return 1.1;
  return 1.0;
}

function calcIntervalDays(p) {
  if (p.scheduleMode === "custom") return Number(p.customIntervalDays || 10);
  const base = p.suggestedIntervalDays || baseIntervalDays(p.plantType);
  const f = lightFactor(p.lightLevel) * seasonFactor(new Date()) * potFactor(Number(p.potSize));
  return Math.max(2, Math.round(base * f));
}

function setNextDue(p) {
  const last = p.lastWateredUtc ? new Date(p.lastWateredUtc) : new Date();
  const interval = calcIntervalDays(p);
  const due = new Date(last);
  due.setUTCDate(due.getUTCDate() + interval);
  p.suggestedIntervalDays = calcIntervalDays(p); // store current suggestion
  p.nextDueUtc = due.toISOString();
}

function statusOf(p) {
  const now = new Date();
  if (p.skipUntilUtc && new Date(p.skipUntilUtc) > now) return {label: "Skipped", cls:"ok"};
  const due = new Date(p.nextDueUtc);
  const days = Math.floor((due - now) / 86400000);
  if (days < 0) return {label: "Overdue", cls:"due"};
  if (days <= 1) return {label: "Due today", cls:"soon"};
  return {label: `Due in ${days}d`, cls:"ok"};
}

function render() {
  grid.innerHTML = "";
  if (!plants.length) empty.hidden = false; else empty.hidden = true;
  const sorted = [...plants].sort((a,b) => new Date(a.nextDueUtc) - new Date(b.nextDueUtc));
  for (const p of sorted) {
    const st = statusOf(p);
    const card = document.createElement("div");
    card.className = "card";
    const img = document.createElement("div");
    img.className = "photo";
    if (p.photoUrl) img.style.backgroundImage = `url('${p.photoUrl}')`;
    const t = document.createElement("div");
    t.className = "title";
    t.innerHTML = `<div><div class="name">${p.name}</div><div class="nick">${p.nickname || ""}</div></div>
                   <div class="pill ${st.cls}">${st.label}</div>`;
    const meta = document.createElement("div");
    const dueLocal = new Date(p.nextDueUtc).toLocaleString();
    meta.className = "meta";
    meta.textContent = `Last watered ${p.lastWateredUtc ? new Date(p.lastWateredUtc).toLocaleDateString() : "not set"} • Next due ${dueLocal}`;

    const act = document.createElement("div");
    act.className = "actions";
    const water = document.createElement("button");
    water.className = "primary";
    water.textContent = "Water now";
    water.onclick = () => {
      p.lastWateredUtc = new Date().toISOString();
      setNextDue(p);
      save(); render();
      toast("Logged watering");
    };
    const snooze = document.createElement("button");
    snooze.className = "ghost";
    snooze.textContent = "Snooze 1d";
    snooze.onclick = () => {
      const d = new Date(p.nextDueUtc);
      d.setUTCDate(d.getUTCDate() + 1);
      p.nextDueUtc = d.toISOString();
      save(); render();
      toast("Snoozed one day");
    };
    const skip = document.createElement("button");
    skip.className = "ghost";
    skip.textContent = "Skip week";
    skip.onclick = () => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      p.skipUntilUtc = d.toISOString();
      save(); render();
      toast("Skipped for a week");
    };
    
    const edit = document.createElement("button");
    edit.className = "ghost";
    edit.textContent = "Edit";
    edit.onclick = () => openEdit(p.id);

    const del = document.createElement("button");
    del.className = "ghost";
    del.textContent = "Delete";
    del.onclick = () => {
      plants = plants.filter(x => x.id !== p.id);
      save(); render();
    };

    act.append(water, snooze, skip, edit, del);

    card.append(img, t, meta, act);
    grid.append(card);
  }
}

function toast(msg) {
  if (!("Notification" in window)) return;
  // show a lightweight notification if granted, else no-op
  if (Notification.permission === "granted") {
    registration && registration.showNotification("RootGrowings", { body: msg, icon: "icons/icon-192.png" });
  }
}

addBtn.addEventListener("click", () => dialog.showModal());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const editing = form.dataset.editing || "";
  const file = fd.get("photo");
  let photoUrl = "";
  if (file && file.size) {
    photoUrl = await fileToDataUrl(file);
  }
  if (editing) {
    const p = plants.find(x => x.id === editing);
    p.name = fd.get("name");
    p.nickname = fd.get("nickname") || "";
    if (photoUrl) p.photoUrl = photoUrl;
    p.plantType = fd.get("plantType") || "";
    p.potSize = Number(fd.get("potSize") || 15);
    p.lightLevel = fd.get("lightLevel") || "medium";
    p.scheduleMode = fd.get("scheduleMode") || "suggested";
    p.customIntervalDays = Number(fd.get("customIntervalDays") || 10);
    p.updatedAt = new Date().toISOString();
    setNextDue(p);
  } else {
    const p = {
      id: crypto.randomUUID(),
      name: fd.get("name"),
      nickname: fd.get("nickname") || "",
      photoUrl,
      plantType: fd.get("plantType") || "",
      potSize: Number(fd.get("potSize") || 15),
      lightLevel: fd.get("lightLevel") || "medium",
      scheduleMode: fd.get("scheduleMode") || "suggested",
      customIntervalDays: Number(fd.get("customIntervalDays") || 10),
      notes: fd.get("notes") || "",
      lastWateredUtc: new Date().toISOString(),
      skipUntilUtc: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setNextDue(p);
    plants.push(p);
  }
  save();
  form.reset();
  delete form.dataset.editing;
  dialog.close();
  render();
});

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


function openEdit(id) {
  const p = plants.find(x => x.id === id);
  if (!p) return;
  dialog.showModal();
  form.querySelector('[name="name"]').value = p.name;
  form.querySelector('[name="nickname"]').value = p.nickname;
  form.querySelector('[name="plantType"]').value = p.plantType;
  form.querySelector('[name="potSize"]').value = p.potSize;
  form.querySelector('[name="lightLevel"]').value = p.lightLevel;
  form.querySelector('[name="scheduleMode"]').value = p.scheduleMode;
  form.querySelector('[name="customIntervalDays"]').value = p.customIntervalDays;
  form.dataset.editing = id;
}

// PWA support
let registration = null;
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      registration = await navigator.serviceWorker.register("./service-worker.js", { scope: location.pathname });
      console.log("SW registered");
    } catch (e) {
      console.log("SW failed", e);
    }
  });
}

if ("Notification" in window) {
  Notification.requestPermission();
}


exportBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(plants, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "rootgrowings.json";
  a.click();
  URL.revokeObjectURL(url);
};

importBtn.onclick = () => importFile.click();

importFile.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  if (Array.isArray(data)) { plants = data; save(); render(); }
});

// Seed a couple of demo plants on first run
if (!plants.length) {
  const demo = [
    { name: "Monstera", nickname: "Mo", plantType: "Monstera deliciosa", potSize: 17, lightLevel:"medium" },
    { name: "Peace Lily", nickname: "Lily", plantType: "Spathiphyllum", potSize: 14, lightLevel:"low" }
  ];
  for (const d of demo) {
    const p = {
      id: crypto.randomUUID(),
      name: d.name,
      nickname: d.nickname,
      photoUrl: "",
      plantType: d.plantType,
      potSize: d.potSize,
      lightLevel: d.lightLevel,
      scheduleMode: "suggested",
      customIntervalDays: 10,
      notes: "",
      lastWateredUtc: new Date().toISOString(),
      skipUntilUtc: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setNextDue(p);
    plants.push(p);
  }
  save();
}
render();

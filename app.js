/* RootGrowings grouped UI */
const $ = (s) => document.querySelector(s);
const homePage = $("#homePage");
const settingsPage = $("#settingsPage");
const chatPage = $("#chatPage");
const homeContent = $("#homeContent");
const homeEmpty = $("#homeEmpty");
const navHome = $("#navHome");
const navSettings = $("#navSettings");
const navChat = $("#navChat");
const plusBtn = $("#plusBtn");

const dialog = $("#plantDialog");
const form = $("#plantForm");
const cancelBtn = $("#cancelBtn");
const roomSelect = $("#roomSelect");
const addRoomBtn = $("#addRoomBtn");
const roomName = $("#roomName");
const openAddPlant = $("#openAddPlant");

const DB_PLANTS = "rg_plants_v2";
const DB_ROOMS = "rg_rooms_v1";
let plants = load(DB_PLANTS) || [];
let rooms = load(DB_ROOMS) || ["Bedroom","Living room","Kitchen"];

function load(key){ try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

function baseIntervalDays(type) {
  const map = { "Monstera deliciosa": 7, "Epipremnum aureum": 7, "Spathiphyllum": 6, "Sansevieria": 14, "Ficus elastica": 10 };
  return map[type] || 8;
}
function lightFactor(level){ return level === "bright" ? 0.8 : level === "low" ? 1.2 : 1.0; }
function seasonFactor(date){ const m = date.getMonth()+1; if(m>=6 && m<=8) return 0.9; if(m==12 || m<=2) return 1.1; return 1.0; }
function potFactor(cm){ if(!cm) return 1.0; if(cm<12) return 0.9; if(cm>18) return 1.1; return 1.0; }

function calcIntervalDays(p) {
  if (p.scheduleMode === "custom") return Number(p.customIntervalDays || 10);
  const base = p.suggestedIntervalDays || baseIntervalDays(p.plantType);
  const f = lightFactor(p.lightLevel) * seasonFactor(new Date()) * potFactor(Number(p.potSize));
  return Math.max(2, Math.round(base * f));
}
function setNextDue(p) {
  const last = p.lastWateredUtc ? new Date(p.lastWateredUtc) : new Date();
  const interval = calcIntervalDays(p);
  const due = new Date(last); due.setUTCDate(due.getUTCDate() + interval);
  p.suggestedIntervalDays = calcIntervalDays(p);
  p.nextDueUtc = due.toISOString();
}
function daysBetween(a,b){ return Math.max(0, Math.ceil((b-a)/86400000)); }

function groupByRoom(plantsList){
  const map = {}; for(const r of rooms) map[r]=[];
  for(const p of plantsList){ const r = p.location || "Unassigned"; if(!map[r]) map[r]=[]; map[r].push(p); }
  return map;
}

function renderRoomsOptions(){
  roomSelect.innerHTML = rooms.map(r => `<option value="${r}">${r}</option>`).join("");
}

function renderHome(){
  const sorted = [...plants].sort((a,b)=> new Date(a.nextDueUtc)-new Date(b.nextDueUtc));
  const groups = groupByRoom(sorted);
  homeContent.innerHTML = "";
  const any = plants.length>0;
  homeEmpty.hidden = any;
  if(!any) return;

  for(const room of Object.keys(groups)){
    if(groups[room].length===0) continue;
    const sec = document.createElement("div");
    sec.className = "section";
    sec.innerHTML = `<h3>${room}</h3>`;
    const wrapper = document.createElement("div");
    wrapper.className = "group";
    const row = document.createElement("div");
    row.className = "row";

    for(const p of groups[room]){
      const total = daysBetween(new Date(p.lastWateredUtc), new Date(p.nextDueUtc)) || 1;
      const left = daysBetween(new Date(), new Date(p.nextDueUtc));
      const pct = Math.max(0, Math.min(100, Math.round(((total-left)/total)*100)));
      const card = document.createElement("div");
      card.className="card";
      const photoWrap = document.createElement("div");
      photoWrap.className="photoWrap";
      const img = document.createElement("div");
      img.className="photo";
      if(p.photoUrl) img.style.backgroundImage = `url('${p.photoUrl}')`;
      const ring = document.createElement("div");
      ring.className="ring";
      ring.style.setProperty("--pct", pct+"%");
      ring.innerHTML = `<span>${left}d</span>`;
      photoWrap.append(img, ring);

      const title = document.createElement("div");
      title.innerHTML = `<div class="name">${p.name}</div><div class="nick">${p.nickname||""}</div>`;

      const meta = document.createElement("div");
      meta.className="meta";
      meta.textContent = `Next due ${new Date(p.nextDueUtc).toLocaleDateString()}`;

      const actions = document.createElement("div");
      actions.className="actions";
      const water = document.createElement("button");
      water.className="btn primary"; water.textContent="Water";
      water.onclick = ()=>{ p.lastWateredUtc=new Date().toISOString(); setNextDue(p); save(DB_PLANTS,plants); renderHome(); };
      const snooze = document.createElement("button");
      snooze.className="btn ghost"; snooze.textContent="Snooze";
      snooze.onclick = ()=>{ const d = new Date(p.nextDueUtc); d.setUTCDate(d.getUTCDate()+1); p.nextDueUtc=d.toISOString(); save(DB_PLANTS,plants); renderHome(); };
      actions.append(water,snooze);

      card.append(photoWrap,title,meta,actions);
      row.append(card);
    }
    wrapper.append(row);
    sec.append(wrapper);
    homeContent.append(sec);
  }
}

/* Nav */
function activate(page){
  for(const el of document.querySelectorAll(".page")) el.classList.remove("active");
  page.classList.add("active");
  for(const b of [navHome,navSettings,navChat]) b.classList.remove("active");
  if(page===homePage) navHome.classList.add("active");
  if(page===settingsPage) navSettings.classList.add("active");
  if(page===chatPage) navChat.classList.add("active");
  window.scrollTo({top:0, behavior:"instant"});
}
navHome.onclick=()=>activate(homePage);
navSettings.onclick=()=>activate(settingsPage);
navChat.onclick=()=>activate(chatPage);
plusBtn.onclick=()=>activate(settingsPage);

/* Settings actions */
addRoomBtn.onclick=()=>{
  const n = roomName.value.trim();
  if(!n) return;
  if(!rooms.includes(n)) { rooms.push(n); save(DB_ROOMS, rooms); renderRoomsOptions(); }
  roomName.value="";
};
openAddPlant.onclick=()=>{ openAdd(); };
function openAdd(){
  form.reset(); delete form.dataset.editing; renderRoomsOptions(); dialog.showModal();
}
cancelBtn.onclick=()=>{ form.reset(); delete form.dataset.editing; dialog.close(); };

form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const fd = new FormData(form);
  const file = fd.get("photo");
  let photoUrl="";
  if(file && file.size){ photoUrl = await fileToDataUrl(file); }
  const p = {
    id: crypto.randomUUID(),
    name: fd.get("name"),
    nickname: fd.get("nickname")||"",
    photoUrl,
    plantType: fd.get("plantType")||"",
    location: fd.get("location")||rooms[0]||"Unassigned",
    potSize: Number(fd.get("potSize")||15),
    lightLevel: fd.get("lightLevel")||"medium",
    scheduleMode: fd.get("scheduleMode")||"suggested",
    customIntervalDays: Number(fd.get("customIntervalDays")||10),
    lastWateredUtc: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  setNextDue(p);
  plants.push(p);
  save(DB_PLANTS, plants);
  dialog.close();
  activate(homePage);
  renderHome();
});

async function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file);
  });
}

/* Seed demo */
if(!plants.length){
  const demo = [
    { name:"Joey", plantType:"Monstera deliciosa", location:"Bedroom" },
    { name:"Rick", plantType:"Sansevieria", location:"Bedroom" },
    { name:"Monica", plantType:"Spathiphyllum", location:"Living room" },
    { name:"Chandler", plantType:"Ficus elastica", location:"Living room" },
    { name:"Phoebe", plantType:"Epipremnum aureum", location:"Kitchen" },
    { name:"Barry", plantType:"Sansevieria", location:"Kitchen" }
  ];
  for(const d of demo){
    const p = {
      id: crypto.randomUUID(),
      name: d.name,
      nickname: "",
      photoUrl: "",
      plantType: d.plantType,
      location: d.location,
      potSize: 15,
      lightLevel: "medium",
      scheduleMode: "suggested",
      customIntervalDays: 10,
      lastWateredUtc: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setNextDue(p);
    plants.push(p);
  }
  save(DB_PLANTS, plants);
}
renderRoomsOptions();
renderHome();

/* SW register */
if("serviceWorker" in navigator){
  window.addEventListener("load", async ()=>{
    try { await navigator.serviceWorker.register("./service-worker.js", { scope: location.pathname }); } catch(e){}
  });
}

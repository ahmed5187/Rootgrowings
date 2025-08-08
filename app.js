/* RootGrowings grouped UI v3 */
const $ = (s) => document.querySelector(s);

/* Pages and nav */
const homeTitle = $("#homeTitle");
const settingsTitle = $("#settingsTitle");
const homePage = $("#homePage");
const settingsPage = $("#settingsPage");
const chatPage = $("#chatPage");
const homeContent = $("#homeContent");
const homeEmpty = $("#homeEmpty");
const navHome = $("#navHome");
const navSettings = $("#navSettings");
const navChat = $("#navChat");
const plusBtn = $("#plusBtn");

/* Plant dialog */
const dialog = $("#plantDialog");
const form = $("#plantForm");
const cancelBtn = $("#cancelBtn");
const deletePlantBtn = $("#deletePlantBtn");
const plantDialogTitle = $("#plantDialogTitle");
const roomSelect = $("#roomSelect");

/* Room dialogs */
const addRoomDialog = $("#addRoomDialog");
const addRoomForm = $("#addRoomForm");
const addRoomCancel = $("#addRoomCancel");
const iconGrid = $("#iconGrid");

const editRoomDialog = $("#editRoomDialog");
const editRoomForm = $("#editRoomForm");
const editRoomCancel = $("#editRoomCancel");
const roomEditSelect = $("#roomEditSelect");
const iconGridEdit = $("#iconGridEdit");

const removeRoomDialog = $("#removeRoomDialog");
const removeRoomForm = $("#removeRoomForm");
const roomRemoveSelect = $("#roomRemoveSelect");

/* Plant edit/remove chooser */
const editPlantChooser = $("#editPlantChooser");
const editPlantChooserForm = $("#editPlantChooserForm");
const editPlantCancel = $("#editPlantCancel");
const plantEditSelect = $("#plantEditSelect");

const removePlantDialog = $("#removePlantDialog");
const removePlantForm = $("#removePlantForm");
const plantRemoveSelect = $("#plantRemoveSelect");

/* Settings buttons */
const btnAddRoom = $("#btnAddRoom");
const btnEditRoom = $("#btnEditRoom");
const btnRemoveRoom = $("#btnRemoveRoom");
const btnAddPlant = $("#btnAddPlant");
const btnEditPlant = $("#btnEditPlant");
const btnRemovePlant = $("#btnRemovePlant");

/* DB */
const DB_PLANTS = "rg_plants_v4";
const DB_ROOMS = "rg_rooms_v3"; // stores array of {name, icon}
let plants = load(DB_PLANTS) || [];
let rooms = load(DB_ROOMS) || [
  { name:"Bedroom", icon:"🛏️" },
  { name:"Living room", icon:"🛋️" },
  { name:"Kitchen", icon:"🍽️" }
];

function load(key){ try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

/* Utils */
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
function roomIcon(name){ const r = rooms.find(x=>x.name===name); return r ? r.icon : "🏷️"; }
function allRoomNames(){ return rooms.map(r=>r.name); }

/* Rendering */
function groupByRoom(plantsList){
  const map = {}; for(const r of rooms) map[r.name]=[];
  for(const p of plantsList){ const r = p.location || "Unassigned"; if(!map[r]) map[r]=[]; map[r].push(p); }
  return map;
}
function renderRoomOptions(){
  roomSelect.innerHTML = allRoomNames().map(r => `<option value="${r}">${r}</option>`).join("");
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
    sec.innerHTML = `<h3><span class="roomIcon">${roomIcon(room)}</span> ${room}</h3>`;
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

      const gear = document.createElement("button");
      gear.className="gear";
      gear.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1l-.4-2.6H9.2l-.4 2.6c-.6.2-1.2.5-1.7 1l-2.4-1-2 3.5 2 1.6a7.4 7.4 0 0 0-.1 1c0 .3 0 .7.1 1l-2 1.6 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h5.6l.4-2.6c.6-.2 1.2-.5 1.7-1l2.4 1 2-3.5-2-1.6c.1-.3.1-.6.1-1Z" fill="currentColor"/></svg>`;
      gear.onclick = ()=> openEdit(p.id);

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

      card.append(gear, photoWrap, title, meta, actions);
      row.append(card);
    }
    wrapper.append(row);
    sec.append(wrapper);
    homeContent.append(sec);
  }
}

/* Navigation */
function activate(page){
  for(const el of document.querySelectorAll(".page")) el.classList.remove("active");
  page.classList.add("active");
  for(const b of [navHome,navSettings,navChat]) b.classList.remove("active");
  if(page===homePage) { navHome.classList.add("active"); plusBtn.style.display="block"; homeTitle.style.display="block"; settingsTitle.style.display="none"; }
  if(page===settingsPage) { navSettings.classList.add("active"); plusBtn.style.display="none"; homeTitle.style.display="none"; settingsTitle.style.display="block"; }
  if(page===chatPage) { navChat.classList.add("active"); plusBtn.style.display="none"; homeTitle.style.display="none"; settingsTitle.style.display="none"; }
  window.scrollTo({top:0, behavior:"instant"});
}
navHome.onclick=()=>activate(homePage);
navSettings.onclick=()=>activate(settingsPage);
navChat.onclick=()=>activate(chatPage);
plusBtn.onclick=()=>activate(settingsPage);

/* Dialog helpers */
cancelBtn.onclick=()=>{ form.reset(); delete form.dataset.editing; dialog.close(); };
function openAdd(){
  plantDialogTitle.textContent = "Add plant";
  deletePlantBtn.style.display = "none";
  form.reset(); renderRoomOptions(); delete form.dataset.editing; dialog.showModal();
}
function openEdit(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  plantDialogTitle.textContent = "Edit plant";
  deletePlantBtn.style.display = "inline-block";
  form.reset(); renderRoomOptions();
  form.querySelector('[name="name"]').value = p.name;
  form.querySelector('[name="nickname"]').value = p.nickname;
  form.querySelector('[name="plantType"]').value = p.plantType;
  form.querySelector('[name="location"]').value = p.location;
  form.querySelector('[name="potSize"]').value = p.potSize;
  form.querySelector('[name="lightLevel"]').value = p.lightLevel;
  form.querySelector('[name="scheduleMode"]').value = p.scheduleMode;
  form.querySelector('[name="customIntervalDays"]').value = p.customIntervalDays;
  form.dataset.editing = id;
  dialog.showModal();
}
deletePlantBtn.onclick=()=>{
  const id = form.dataset.editing;
  if(!id) return;
  plants = plants.filter(x=>x.id!==id);
  save(DB_PLANTS, plants);
  dialog.close(); renderHome();
};

/* Form submit */
form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const fd = new FormData(form);
  const editing = form.dataset.editing || "";
  const file = fd.get("photo");
  let photoUrl="";
  if(file && file.size){ photoUrl = await fileToDataUrl(file); }

  if(editing){
    const p = plants.find(x=>x.id===editing);
    p.name = fd.get("name"); p.nickname = fd.get("nickname")||"";
    if(photoUrl) p.photoUrl = photoUrl;
    p.plantType = fd.get("plantType")||"";
    p.location = fd.get("location")||rooms[0]?.name||"Unassigned";
    p.potSize = Number(fd.get("potSize")||15);
    p.lightLevel = fd.get("lightLevel")||"medium";
    p.scheduleMode = fd.get("scheduleMode")||"suggested";
    p.customIntervalDays = Number(fd.get("customIntervalDays")||10);
    p.updatedAt = new Date().toISOString();
    setNextDue(p);
  } else {
    const p = {
      id: crypto.randomUUID(),
      name: fd.get("name"),
      nickname: fd.get("nickname")||"",
      photoUrl,
      plantType: fd.get("plantType")||"",
      location: fd.get("location")||rooms[0]?.name||"Unassigned",
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
  }
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

/* Settings buttons logic */
btnAddRoom.onclick=()=>{ populateIconGrid(iconGrid); addRoomForm.reset(); addRoomDialog.showModal(); };
btnEditRoom.onclick=()=>{ renderRoomEditOptions(); populateIconGrid(iconGridEdit); editRoomDialog.showModal(); };
btnRemoveRoom.onclick=()=>{ renderRemoveRoomOptions(); removeRoomDialog.showModal(); };
btnAddPlant.onclick=()=> openAdd();
btnEditPlant.onclick=()=>{ renderEditPlantOptions(); editPlantChooser.showModal(); };
btnRemovePlant.onclick=()=>{ renderRemovePlantOptions(); removePlantDialog.showModal(); };

/* Close handlers */
addRoomCancel.onclick=()=> addRoomDialog.close();
$("#editRoomCancel").onclick=()=> editRoomDialog.close();
$("#removeRoomCancel").onclick=()=> removeRoomDialog.close();
$("#editPlantCancel").onclick=()=> editPlantChooser.close();
$("#removePlantCancel").onclick=()=> removePlantDialog.close();

/* Room icons */
function populateIconGrid(container){
  const icons = ["🛏️","🛋️","🍽️","🚿","🧺","🧑‍🍳","🖥️","🎮","📚","🧸","🚪","🌿","🔥","❄️","☕","🎧"];
  container.innerHTML = "";
  icons.forEach(ic=>{
    const div = document.createElement("div");
    div.className="iconPick";
    div.textContent = ic;
    div.onclick = ()=>{
      for(const el of container.querySelectorAll(".iconPick")) el.classList.remove("selected");
      div.classList.add("selected");
      container.dataset.icon = ic;
    };
    container.append(div);
  });
}

/* Add room submit */
addRoomForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  const fd = new FormData(addRoomForm);
  const name = (fd.get("roomName")||"").toString().trim();
  const icon = addRoomForm.querySelector(".iconPick.selected")?.textContent || "🏷️";
  if(!name) return;
  if(!rooms.find(r=>r.name===name)){
    rooms.push({name, icon});
    save(DB_ROOMS, rooms);
    renderRoomOptions();
    renderHome();
  }
  addRoomDialog.close();
});

/* Edit room submit */
function renderRoomEditOptions(){
  roomEditSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join("");
}
editRoomForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  const fd = new FormData(editRoomForm);
  const oldName = fd.get("roomToEdit");
  const newName = (fd.get("newRoomName")||"").toString().trim();
  const newIcon = iconGridEdit.querySelector(".iconPick.selected")?.textContent;
  const r = rooms.find(x=>x.name===oldName);
  if(!r) return;
  // rename room
  if(newName && newName !== oldName){
    r.name = newName;
    // update all plants that had old name
    for(const p of plants){ if(p.location===oldName) p.location = newName; }
  }
  // change icon
  if(newIcon) r.icon = newIcon;
  save(DB_ROOMS, rooms);
  save(DB_PLANTS, plants);
  renderRoomOptions();
  renderHome();
  editRoomDialog.close();
});

/* Remove room submit */
function renderRemoveRoomOptions(){
  roomRemoveSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join("");
}
removeRoomForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  const fd = new FormData(removeRoomForm);
  const name = fd.get("roomToRemove");
  if(!name) return;
  rooms = rooms.filter(r => r.name !== name);
  save(DB_ROOMS, rooms);
  for(const p of plants){ if(p.location===name) p.location = "Unassigned"; }
  save(DB_PLANTS, plants);
  renderRoomOptions();
  renderHome();
  removeRoomDialog.close();
});

/* Edit Plant chooser */
function renderEditPlantOptions(){
  plantEditSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||"Unassigned"})</option>`).join("");
}
editPlantChooserForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  const fd = new FormData(editPlantChooserForm);
  const id = fd.get("plantToEdit");
  if(!id) return;
  editPlantChooser.close();
  openEdit(id);
});

/* Remove plant */
function renderRemovePlantOptions(){
  plantRemoveSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||"Unassigned"})</option>`).join("");
}
removePlantForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  const fd = new FormData(removePlantForm);
  const id = fd.get("plantToRemove");
  if(!id) return;
  plants = plants.filter(p => p.id !== id);
  save(DB_PLANTS, plants);
  renderHome();
  removePlantDialog.close();
});

/* Room/Plant shared */
function renderRoomOptions(){
  roomSelect.innerHTML = allRoomNames().map(r => `<option value="${r}">${r}</option>`).join("");
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

renderRoomOptions();
renderHome();

/* SW register */
if("serviceWorker" in navigator){
  window.addEventListener("load", async ()=>{
    try { await navigator.serviceWorker.register("./service-worker.js", { scope: location.pathname }); } catch(e){}
  });
}

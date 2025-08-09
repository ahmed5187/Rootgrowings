// app_cloud.js — full-screen auth, redirect login, CDN imports
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithRedirect, getRedirectResult, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, onSnapshot,
  updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const DEFAULT_IMG = "assets/tempplant.jpg";

// App sections
const homePage = $("#homePage");
const settingsPage = $("#settingsPage");
const chatPage = $("#chatPage");
const navHome = $("#navHome");
const navSettings = $("#navSettings");
const navChat = $("#navChat");
const plusBtn = $("#plusBtn");
const homeTitle = $("#homeTitle");
const settingsTitle = $("#settingsTitle");
const homeContent = $("#homeContent");
const homeEmpty = $("#homeEmpty");

// Dialogs and forms (existing ids)
const dialog = $("#plantDialog");
const form = $("#plantForm");
const cancelBtn = $("#cancelBtn");
const deletePlantBtn = $("#deletePlantBtn");
const plantDialogTitle = $("#plantDialogTitle");
const roomSelect = $("#roomSelect");
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
const editPlantChooser = $("#editPlantChooser");
const editPlantChooserForm = $("#editPlantChooserForm");
const removePlantDialog = $("#removePlantDialog");
const removePlantForm = $("#removePlantForm");
const plantEditSelect = $("#plantEditSelect");
const plantRemoveSelect = $("#plantRemoveSelect");
const btnAddRoom = $("#btnAddRoom");
const btnEditRoom = $("#btnEditRoom");
const btnRemoveRoom = $("#btnRemoveRoom");
const btnAddPlant = $("#btnAddPlant");
const btnEditPlant = $("#btnEditPlant");
const btnRemovePlant = $("#btnRemovePlant");

// ---------- Inject full-screen Auth screen (no html changes needed) ----------
const authOverlay = document.createElement("div");
authOverlay.id = "authOverlay";
authOverlay.style.cssText = `
  position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
  background:#f1f6f1; z-index:9999; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
`;
authOverlay.innerHTML = `
  <div style="width:min(92vw,420px); background:#fff; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,.08); padding:28px; text-align:center">
    <img src="assets/RGlogo.png" alt="RootGrowings" style="height:48px; margin-bottom:8px"/>
    <h2 style="margin:6px 0 14px; color:#14532d">Welcome</h2>
    <p style="color:#446; margin:0 0 18px">Sign in to save your rooms, plants, and photos.</p>
    <button id="googleStart" class="btn primary" style="width:100%; padding:12px 16px; font-weight:600">Continue with Google</button>
    <p style="font-size:12px; color:#678; margin-top:14px">By continuing you agree to our gentle watering reminders.</p>
  </div>
`;
document.body.appendChild(authOverlay);

const headerEl = document.querySelector("header");
const footerEl = document.querySelector("footer");
function showAppFrame(show){
  headerEl.style.display = show ? "" : "none";
  footerEl.style.display = show ? "" : "none";
  [homePage, settingsPage, chatPage].forEach(p => p.style.display = show ? "" : "none");
  plusBtn.style.display = show ? "block" : "none";
}
showAppFrame(false); // hide app until signed in

// ---------- Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Handle redirect result once after returning from Google
getRedirectResult(auth).catch(()=>{}); // ignore if none

$("#googleStart").onclick = async () => {
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider); // no popup
};

// ---------- Auth state ----------
let user = null, rooms = [], plants = [];

onAuthStateChanged(auth, async (u) => {
  user = u;
  if (!user) {
    // Not signed in
    showAppFrame(false);
    authOverlay.style.display = "flex";
    return;
  }
  // Signed in
  authOverlay.style.display = "none";
  showAppFrame(true);
  activate(homePage);
  startRoomsListener();
  startPlantsListener();
});

// ---------- Nav ----------
function activate(page){
  for(const el of document.querySelectorAll(".page")) el.classList.remove("active");
  page.classList.add("active");
  for(const b of [navHome,navSettings,navChat]) b.classList.remove("active");
  if(page===homePage){ navHome.classList.add("active"); plusBtn.style.display="block"; homeTitle.style.display="block"; settingsTitle.style.display="none"; }
  if(page===settingsPage){ navSettings.classList.add("active"); plusBtn.style.display="none"; homeTitle.style.display="none"; settingsTitle.style.display="block"; }
  if(page===chatPage){ navChat.classList.add("active"); plusBtn.style.display="none"; homeTitle.style.display="none"; settingsTitle.style.display="none"; }
  window.scrollTo({top:0, behavior:"instant"});
}
navHome.onclick = ()=>activate(homePage);
navSettings.onclick = ()=>activate(settingsPage);
navChat.onclick = ()=>activate(chatPage);
plusBtn.onclick = ()=>activate(settingsPage);

// ---------- Firestore listeners ----------
function startRoomsListener(){
  const qref = collection(db,'users',user.uid,'rooms');
  onSnapshot(qref, snap => {
    rooms = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(rooms.length===0){
      [{name:'Bedroom',icon:'🛏️'},{name:'Living room',icon:'🛋️'},{name:'Kitchen',icon:'🍽️'}]
        .forEach(r=>addDoc(collection(db,'users',user.uid,'rooms'),r));
    }
    renderRoomOptions(); renderHome(); renderPickers();
  });
}
function startPlantsListener(){
  const qref = collection(db,'users',user.uid,'plants');
  onSnapshot(qref, snap => {
    plants = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderHome(); renderPickers();
  });
}

// ---------- UI helpers ----------
function baseIntervalDays(type){ const map={ "Monstera deliciosa":7, "Epipremnum aureum":7, "Spathiphyllum":6, "Sansevieria":14, "Ficus elastica":10 }; return map[type]||8; }
function lightFactor(v){ return v==="bright"?0.8 : v==="low"?1.2 : 1.0; }
function seasonFactor(d){ const m=d.getMonth()+1; if(m>=6&&m<=8) return 0.9; if(m===12||m<=2) return 1.1; return 1.0; }
function potFactor(cm){ if(!cm) return 1.0; if(cm<12) return 0.9; if(cm>18) return 1.1; return 1.0; }
function calcIntervalDays(p){ if(p.scheduleMode==="custom") return Number(p.customIntervalDays||10); const base=p.suggestedIntervalDays||baseIntervalDays(p.plantType); const f=lightFactor(p.lightLevel)*seasonFactor(new Date())*potFactor(Number(p.potSize)); return Math.max(2, Math.round(base*f)); }
function setNextDue(p){ const last=p.lastWateredUtc?new Date(p.lastWateredUtc):new Date(); const n=new Date(last); n.setUTCDate(n.getUTCDate()+calcIntervalDays(p)); p.suggestedIntervalDays=calcIntervalDays(p); p.nextDueUtc=n.toISOString(); }
function daysBetween(a,b){ return Math.max(0, Math.ceil((b-a)/86400000)); }
function roomIcon(name){ const r=rooms.find(x=>x.name===name); return r?r.icon:"🏷️"; }
function allRoomNames(){ return rooms.map(r=>r.name); }
function groupByRoom(list){ const map={}; for(const r of rooms) map[r.name]=[]; for(const p of list){ const r=p.location||"Unassigned"; if(!map[r]) map[r]=[]; map[r].push(p);} return map; }

function renderRoomOptions(){ roomSelect.innerHTML = allRoomNames().map(r=>`<option value="${r}">${r}</option>`).join(""); }
function renderPickers(){
  roomEditSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join("");
  roomRemoveSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join("");
  plantEditSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||'Unassigned'})</option>`).join("");
  plantRemoveSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||'Unassigned'})</option>`).join("");
}

function renderHome(){
  const sorted=[...plants].sort((a,b)=>new Date(a.nextDueUtc)-new Date(b.nextDueUtc));
  const groups=groupByRoom(sorted);
  homeContent.innerHTML='';
  const any = plants.length>0; homeEmpty.hidden = any; if(!any) return;

  for(const room of Object.keys(groups)){
    if(groups[room].length===0) continue;
    const sec=document.createElement('div'); sec.className='section';
    sec.innerHTML=`<h3><span class="roomIcon">${roomIcon(room)}</span> ${room}</h3>`;
    const wrap=document.createElement('div'); wrap.className='group';
    const row=document.createElement('div'); row.className='row';

    for(const p of groups[room]){
      const total=daysBetween(new Date(p.lastWateredUtc), new Date(p.nextDueUtc))||1;
      const left =daysBetween(new Date(), new Date(p.nextDueUtc));
      const pct  =Math.max(0,Math.min(100,Math.round(((total-left)/total)*100)));

      const card=document.createElement('div'); card.className='card';
      const gear=document.createElement('button'); gear.className='gear';
      gear.innerHTML=`<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1l-.4-2.6H9.2l-.4 2.6c-.6.2-1.2.5-1.7 1l-2.4-1-2 3.5 2 1.6a7.4 7.4 0 0 0-.1 1c0 .3 0 .7.1 1l-2 1.6 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h5.6l.4-2.6c.6-.2 1.2-.5 1.7-1l2.4 1 2-3.5-2-1.6c.1-.3.1-.6.1-1Z" fill="currentColor"/></svg>`;
      gear.onclick=()=>openEdit(p.id);

      const photoWrap=document.createElement('div'); photoWrap.className='photoWrap';
      const img=document.createElement('div'); img.className='photo';
      img.style.backgroundImage = `url('${p.photoUrl || DEFAULT_IMG}')`;
      const ring=document.createElement('div'); ring.className='ring';
      ring.style.setProperty('--pct', pct+'%'); ring.innerHTML = `<span>${left}d</span>`;
      photoWrap.append(img, ring);

      const title=document.createElement('div');
      title.innerHTML=`<div class="name">${p.name}</div><div class="nick">${p.nickname||''}</div>`;

      const meta=document.createElement('div'); meta.className='meta';
      meta.textContent = `Next due ${new Date(p.nextDueUtc).toLocaleDateString()}`;

      const actions=document.createElement('div'); actions.className='actions';
      const water=document.createElement('button'); water.className='btn primary'; water.textContent='Water';
      water.onclick=async()=>{ const ref=doc(db,'users',user.uid,'plants',p.id); const now=new Date().toISOString(); await updateDoc(ref,{lastWateredUtc:now,updatedAt:now}); };
      const snooze=document.createElement('button'); snooze.className='btn ghost'; snooze.textContent='Snooze';
      snooze.onclick=async()=>{ const d=new Date(p.nextDueUtc); d.setUTCDate(d.getUTCDate()+1); await updateDoc(doc(db,'users',user.uid,'plants',p.id),{nextDueUtc:d.toISOString(),updatedAt:new Date().toISOString()}); };
      actions.append(water,snooze);

      card.append(gear,photoWrap,title,meta,actions);
      row.append(card);
    }
    wrap.append(row); sec.append(wrap); homeContent.append(sec);
  }
}

// ---------- Rooms ----------
function populateIconGrid(container){
  const icons=["🛏️","🛋️","🍽️","🚿","🧺","🧑‍🍳","🖥️","🎮","📚","🧸","🚪","🌿","🔥","❄️","☕","🎧"];
  container.innerHTML=""; icons.forEach(ic=>{ const d=document.createElement("div"); d.className="iconPick"; d.textContent=ic;
    d.onclick=()=>{ for(const el of container.querySelectorAll(".iconPick")) el.classList.remove("selected"); d.classList.add("selected"); container.dataset.icon=ic; }; container.append(d);
  });
}
btnAddRoom.onclick = ()=>{ populateIconGrid(iconGrid); addRoomForm.reset(); addRoomDialog.showModal(); };
btnEditRoom.onclick = ()=>{ populateIconGrid(iconGridEdit); editRoomDialog.showModal(); };
btnRemoveRoom.onclick = ()=> removeRoomDialog.showModal();
addRoomCancel.onclick = ()=> addRoomDialog.close();
editRoomCancel.onclick = ()=> editRoomDialog.close();
$("#removeRoomCancel").onclick = ()=> removeRoomDialog.close();

addRoomForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const fd=new FormData(addRoomForm);
  const name=(fd.get("roomName")||"").toString().trim();
  const icon=iconGrid.querySelector(".iconPick.selected")?.textContent || "🏷️";
  if(!name) return;
  await addDoc(collection(db,'users',user.uid,'rooms'),{ name, icon });
  addRoomDialog.close();
});

editRoomForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const fd=new FormData(editRoomForm);
  const oldName=fd.get("roomToEdit");
  const newName=(fd.get("newRoomName")||"").toString().trim();
  const newIcon=iconGridEdit.querySelector(".iconPick.selected")?.textContent;
  if(!oldName) return;
  const roomDoc=rooms.find(r=>r.name===oldName); if(!roomDoc) return;
  const patch={}; if(newName) patch.name=newName; if(newIcon) patch.icon=newIcon;
  if(Object.keys(patch).length) await updateDoc(doc(db,'users',user.uid,'rooms',roomDoc.id),patch);
  if(newName && newName!==oldName){
    for(const p of plants.filter(p=>p.location===oldName)){ await updateDoc(doc(db,'users',user.uid,'plants',p.id),{ location:newName }); }
  }
  editRoomDialog.close();
});

removeRoomForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const name=new FormData(removeRoomForm).get("roomToRemove");
  const roomDoc=rooms.find(r=>r.name===name); if(!roomDoc) return;
  await deleteDoc(doc(db,'users',user.uid,'rooms',roomDoc.id));
  for(const p of plants.filter(p=>p.location===name)){ await updateDoc(doc(db,'users',user.uid,'plants',p.id),{ location:'Unassigned' }); }
  removeRoomDialog.close();
});

// ---------- Plants ----------
btnAddPlant.onclick = ()=>openAdd();
btnEditPlant.onclick = ()=>editPlantChooser.showModal();
btnRemovePlant.onclick = ()=>removePlantDialog.showModal();
$("#editPlantCancel").onclick = ()=>editPlantChooser.close();
$("#removePlantCancel").onclick = ()=>removePlantDialog.close();

function openAdd(){
  plantDialogTitle.textContent="Add plant";
  deletePlantBtn.style.display="none";
  form.reset(); renderRoomOptions(); delete form.dataset.editing; dialog.showModal();
}
function openEdit(id){
  const p=plants.find(x=>x.id===id); if(!p) return;
  plantDialogTitle.textContent="Edit plant";
  deletePlantBtn.style.display="inline-block";
  form.reset(); renderRoomOptions();
  form.querySelector('[name="name"]').value=p.name;
  form.querySelector('[name="nickname"]').value=p.nickname;
  form.querySelector('[name="plantType"]').value=p.plantType;
  form.querySelector('[name="location"]').value=p.location;
  form.querySelector('[name="potSize"]').value=p.potSize;
  form.querySelector('[name="lightLevel"]').value=p.lightLevel;
  form.querySelector('[name="scheduleMode"]').value=p.scheduleMode;
  form.querySelector('[name="customIntervalDays"]').value=p.customIntervalDays;
  form.dataset.editing=id;
  dialog.showModal();
}
deletePlantBtn.onclick = async ()=>{
  const id=form.dataset.editing; if(!id) return;
  await deleteDoc(doc(db,'users',user.uid,'plants',id));
  dialog.close();
};

editPlantChooserForm.addEventListener("submit", e=>{
  e.preventDefault();
  const id=new FormData(editPlantChooserForm).get("plantToEdit");
  if(id){ editPlantChooser.close(); openEdit(id); }
});

removePlantForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const id=new FormData(removePlantForm).get("plantToRemove"); if(!id) return;
  await deleteDoc(doc(db,'users',user.uid,'plants',id));
  removePlantDialog.close();
});

form.addEventListener("submit", async e=>{
  e.preventDefault();
  const fd=new FormData(form);
  const editing=form.dataset.editing||"";
  const file=fd.get("photo");
  let photoUrl="";

  if(file && file.size && file.size>2*1024*1024){ alert("Image too large. Max 2MB."); return; }
  if(file && file.size){
    const path=`plants/${user.uid}/${editing || crypto.randomUUID()}.jpg`;
    const ref=sRef(storage, path);
    const bytes=await file.arrayBuffer();
    await uploadBytes(ref, new Uint8Array(bytes), { contentType:file.type||'image/jpeg' });
    photoUrl=await getDownloadURL(ref);
  }

  if(editing){
    const patch={
      name: fd.get("name"),
      nickname: fd.get("nickname")||"",
      plantType: fd.get("plantType")||"",
      location: fd.get("location")||"Unassigned",
      potSize: Number(fd.get("potSize")||15),
      lightLevel: fd.get("lightLevel")||"medium",
      scheduleMode: fd.get("scheduleMode")||"suggested",
      customIntervalDays: Number(fd.get("customIntervalDays")||10),
      updatedAt: new Date().toISOString()
    };
    if(photoUrl) patch.photoUrl=photoUrl;
    await updateDoc(doc(db,'users',user.uid,'plants',editing), patch);
  } else {
    const p={
      name: fd.get("name"),
      nickname: fd.get("nickname")||"",
      photoUrl: photoUrl || DEFAULT_IMG,
      plantType: fd.get("plantType")||"",
      location: fd.get("location")||"Unassigned",
      potSize: Number(fd.get("potSize")||15),
      lightLevel: fd.get("lightLevel")||"medium",
      scheduleMode: fd.get("scheduleMode")||"suggested",
      customIntervalDays: Number(fd.get("customIntervalDays")||10),
      lastWateredUtc: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setNextDue(p);
    await addDoc(collection(db,'users',user.uid,'plants'), p);
  }
  dialog.close();
});

// optional SW
try {
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./service-worker.js', { scope: location.pathname });
  }
} catch(_) {}

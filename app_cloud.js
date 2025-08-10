// app_cloud.js — RootGrowings v15 (full)
// - Auth flicker fix with html.auth-wait
// - Google, Apple, Email/password auth (signup + reset)
// - Rooms & Plants CRUD in Firestore under users/{uid}/...
// - Unique room names (case-insensitive)
// - Storage uploads (2MB cap) for plant photos + profile avatar
// - Clickable plant cards → details modal with last 3 water/fert logs
// - Local notification tick for nextDue/nextFertilize
// - Basic Insights charts (last 14 days + per-plant + per-room)

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut,
  GoogleAuthProvider, OAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  updateProfile, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, getDocs, onSnapshot,
  updateDoc, deleteDoc, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js';

/* ---------- constants / helpers ---------- */
document.documentElement.classList.add('auth-wait'); // prevent flicker
const $ = s => document.querySelector(s);
const DEFAULT_IMG = 'assets/tempplant.jpg';

const sleep = ms => new Promise(r=>setTimeout(r,ms));
const dayKey = d => new Date(d).toISOString().slice(0,10);
const daysBetween = (a,b)=>Math.max(0,Math.ceil((b-a)/86400000));

const baseIntervalDays = (t)=>({ 'Monstera deliciosa':7,'Epipremnum aureum':7,'Spathiphyllum':6,'Sansevieria':14,'Ficus elastica':10 }[t]||8);
const lightFactor = v => v==='bright'?0.8 : v==='low'?1.2 : 1.0;
const seasonFactor = d => { const m=d.getMonth()+1; if(m>=6&&m<=8) return 0.9; if(m===12||m<=2) return 1.1; return 1.0; };
const potFactor = cm => !cm?1.0 : cm<12?0.9 : cm>18?1.1 : 1.0;
function calcIntervalDays(p){ if(p.scheduleMode==='custom') return Number(p.customIntervalDays||10); const base=p.suggestedIntervalDays||baseIntervalDays(p.plantType); const f=lightFactor(p.lightLevel)*seasonFactor(new Date())*potFactor(Number(p.potSize)); return Math.max(2,Math.round(base*f)); }
function toNextWithTime(baseDateISO, intervalDays, hhmm='09:00'){
  const base = baseDateISO ? new Date(baseDateISO) : new Date();
  const [hh,mm] = (hhmm||'09:00').split(':').map(n=>parseInt(n,10));
  const n = new Date(base); n.setSeconds(0); n.setMilliseconds(0); n.setDate(n.getDate()+intervalDays); n.setHours(hh||9, mm||0, 0, 0); return n.toISOString();
}

/* ---------- DOM refs ---------- */
const pages = { home:$('#homePage'), settings:$('#settingsPage'), insights:$('#insightsPage'), chat:$('#chatPage') };
const titles = { home:$('#homeTitle'), settings:$('#settingsTitle'), insights:$('#insightsTitle') };
const nav = { home:$('#navHome'), settings:$('#navSettings'), insights:$('#navInsights'), chat:$('#navChat') };
const plusBtn = $('#plusBtn'); const profileBtn = $('#profileBtn');

const homeContent = $('#homeContent'); const homeEmpty = $('#homeEmpty');

const plantDialog = $('#plantDialog'); const plantForm = $('#plantForm'); const plantDialogTitle = $('#plantDialogTitle');
const deletePlantBtn = $('#deletePlantBtn'); const cancelBtn = $('#cancelBtn'); const roomSelect = $('#roomSelect');

const addRoomDialog = $('#addRoomDialog'); const addRoomForm = $('#addRoomForm'); const addRoomCancel = $('#addRoomCancel'); const iconGrid = $('#iconGrid');
const editRoomDialog = $('#editRoomDialog'); const editRoomForm = $('#editRoomForm'); const editRoomCancel = $('#editRoomCancel'); const roomEditSelect = $('#roomEditSelect'); const iconGridEdit = $('#iconGridEdit');
const removeRoomDialog = $('#removeRoomDialog'); const removeRoomForm = $('#removeRoomForm'); const roomRemoveSelect = $('#roomRemoveSelect');

const editPlantChooser = $('#editPlantChooser'); const editPlantChooserForm = $('#editPlantChooserForm'); const editPlantCancel = $('#editPlantCancel');
const removePlantDialog = $('#removePlantDialog'); const removePlantForm = $('#removePlantForm'); const plantEditSelect = $('#plantEditSelect'); const plantRemoveSelect = $('#plantRemoveSelect');

const profileDialog = $('#profileDialog'); const profileForm = $('#profileForm'); const profileAvatar = $('#profileAvatar'); const profileName = $('#profileName');
const profileEmail = $('#profileEmail'); const displayNameInput = $('#displayNameInput'); const photoFileInput = $('#photoFileInput');
const choosePhotoBtn = $('#choosePhotoBtn'); const fileName = $('#fileName'); const closeProfile = $('#closeProfile'); const signOutBtn = $('#signOutBtn');

const notifyDialog = $('#notifyDialog'); const notifyAllow = $('#notifyAllow'); const notifyLater = $('#notifyLater');
const toastDialog = $('#toastDialog'); const toastMsg = $('#toastMsg'); const toastOk = $('#toastOk');

const plantDetailsDialog = $('#plantDetailsDialog'); const detailsImage = $('#detailsImage'); const detailsTitle = $('#detailsTitle'); const detailsMeta = $('#detailsMeta');
const detailsEditBtn = $('#detailsEditBtn'); const detailsDeleteBtn = $('#detailsDeleteBtn'); const detailsCloseBtn = $('#detailsCloseBtn');
const detailsHistory = $('#detailsHistory'); const detailsTbody = detailsHistory?.querySelector('tbody');

const chart14Water = $('#chart14Water'); const chart14Fert = $('#chart14Fert');
const chartByPlant = $('#chartByPlant'); const chartByRoomWater = $('#chartByRoomWater'); const chartByRoomFert = $('#chartByRoomFert');

/* ---------- Toast ---------- */
function showToast(msg='Saved'){ if(toastMsg && toastDialog){ toastMsg.textContent=msg; toastDialog.showModal(); } }
toastOk?.addEventListener('click', ()=> toastDialog.close());

/* ---------- Build auth overlay (multi provider) ---------- */
const authOverlay = document.createElement('div');
authOverlay.style.cssText = `position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:#f1f6f1; z-index:9999; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;`;
authOverlay.innerHTML = `
  <div style="width:min(92vw,420px); background:#fff; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,.08); padding:28px; text-align:center">
    <img src="assets/RGlogo.png" alt="RootGrowings" style="height:48px; margin-bottom:8px"/>
    <h2 style="margin:6px 0 14px; color:#14532d">Welcome</h2>
    <p style="color:#446; margin:0 0 18px">Sign in to save your rooms, plants, and photos.</p>

    <div style="display:grid; gap:10px">
      <button id="btnGoogle" style="width:100%; padding:12px 16px; font-weight:600; background:#14532d; color:#fff; border:none; border-radius:8px; cursor:pointer">Continue with Google</button>
      <button id="btnApple" style="width:100%; padding:12px 16px; font-weight:600; background:#000; color:#fff; border:none; border-radius:8px; cursor:pointer">Continue with Apple</button>
    </div>

    <div style="margin:14px 0 10px; color:#789; font-size:12px">or use email</div>
    <form id="emailForm" style="display:grid; gap:8px; text-align:left; margin-top:6px">
      <input id="emailInput" type="email" required placeholder="Email" style="padding:10px; border:1px solid #cfe0d6; border-radius:8px"/>
      <input id="passInput" type="password" required placeholder="Password" style="padding:10px; border:1px solid #cfe0d6; border-radius:8px"/>
      <div style="display:flex; gap:8px; margin-top:6px">
        <button id="btnEmailSignIn" type="button" style="flex:1; padding:10px 12px; border-radius:8px; border:0; background:#eef4f0; cursor:pointer">Sign in</button>
        <button id="btnEmailSignUp" type="button" style="flex:1; padding:10px 12px; border-radius:8px; border:0; background:#e6f4ea; cursor:pointer">Create account</button>
      </div>
      <button id="btnReset" type="button" style="margin-top:4px; background:none; border:0; color:#14532d; cursor:pointer; font-size:12px">Forgot password?</button>
    </form>
  </div>`;
document.body.appendChild(authOverlay);

/* ---------- Firebase ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
await setPersistence(auth, browserLocalPersistence).catch(()=>{});

/* ---------- Global state ---------- */
let user = null, rooms = [], plants = [], currentDetailsId = null, schedulerTimer = null;

/* ---------- Auth handlers ---------- */
$('#btnGoogle')?.addEventListener('click', async ()=>{
  try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch(e){ alert('Google sign-in failed'); }
});
$('#btnApple')?.addEventListener('click', async ()=>{
  try { await signInWithPopup(auth, new OAuthProvider('apple.com')); }
  catch(e){ alert('Apple sign-in failed'); }
});
$('#btnEmailSignIn')?.addEventListener('click', async ()=>{
  const email = $('#emailInput')?.value.trim(); const pass = $('#passInput')?.value;
  if(!email||!pass) return alert('Enter email & password');
  try { await signInWithEmailAndPassword(auth, email, pass); } catch(e){ alert(e?.message||'Sign-in failed'); }
});
$('#btnEmailSignUp')?.addEventListener('click', async ()=>{
  const email = $('#emailInput')?.value.trim(); const pass = $('#passInput')?.value;
  if(!email||!pass) return alert('Enter email & password');
  try { await createUserWithEmailAndPassword(auth, email, pass); } catch(e){ alert(e?.message||'Sign-up failed'); }
});
$('#btnReset')?.addEventListener('click', async ()=>{
  const email = $('#emailInput')?.value.trim(); if(!email) return alert('Enter your email first');
  try { await sendPasswordResetEmail(auth, email); alert('Reset email sent'); } catch(e){ alert(e?.message||'Could not send reset'); }
});

/* ---------- Auth state ---------- */
onAuthStateChanged(auth, async u=>{
  user = u || null;
  document.documentElement.classList.remove('auth-wait');
  if(!user){
    authOverlay.style.display='flex';
    Object.values(pages).forEach(p=>p && (p.style.display='none'));
    return;
  }
  authOverlay.style.display='none';
  Object.values(pages).forEach(p=>p && (p.style.display=''));
  activate('home');
  wireNav();
  wireHeader();
  wireProfile();
  startRooms();
  startPlants();
  startScheduler();
  if('Notification' in window && Notification.permission==='default'){ setTimeout(()=> notifyDialog?.showModal(), 600); }
});

/* ---------- Navigation ---------- */
function activate(key){
  Object.values(pages).forEach(p=>p?.classList.remove('active'));
  pages[key]?.classList.add('active');
  Object.keys(nav).forEach(k=> nav[k]?.classList.remove('active'));
  nav[key]?.classList.add('active');
  Object.keys(titles).forEach(k=> titles[k] && (titles[k].style.display=(k===key?'block':'none')));
  window.scrollTo({ top:0, behavior:'instant' });
}
function wireNav(){
  nav.home?.addEventListener('click', ()=> activate('home'));
  nav.settings?.addEventListener('click', ()=> activate('settings'));
  nav.insights?.addEventListener('click', ()=>{ activate('insights'); renderInsights(); });
  nav.chat?.addEventListener('click', ()=> activate('chat'));
}
function wireHeader(){
  plusBtn?.addEventListener('click', ()=> activate('settings'));
}

/* ---------- Profile ---------- */
function wireProfile(){
  profileBtn?.addEventListener('click', openProfile);
  choosePhotoBtn?.addEventListener('click', ()=> photoFileInput?.click());
  photoFileInput?.addEventListener('change', e=> fileName && (fileName.textContent = e.target.files?.[0]?.name || 'No photo chosen'));
  closeProfile?.addEventListener('click', ()=> profileDialog?.close());
  signOutBtn?.addEventListener('click', ()=> signOut(auth).catch(()=>{}).finally(()=>profileDialog?.close()));
  profileForm?.addEventListener('submit', saveProfile);
}
function openProfile(){
  if(!user) return;
  profileName && (profileName.textContent = user.displayName || 'Plant lover');
  profileEmail && (profileEmail.textContent = user.email || '');
  profileAvatar && (profileAvatar.src = user.photoURL || 'assets/RGicon.jpg');
  displayNameInput && (displayNameInput.value = user.displayName || '');
  fileName && (fileName.textContent = 'No photo chosen');
  photoFileInput && (photoFileInput.value = '');
  profileDialog?.showModal();
}
async function saveProfile(e){
  e.preventDefault(); if(!user) return;
  let newPhotoURL = null;
  const file = photoFileInput?.files?.[0];
  if(file && file.size){
    if(file.size > 2*1024*1024) return alert('Image too large, max 2MB');
    const ref = sRef(storage, `avatars/${user.uid}.jpg`);
    const bytes = await file.arrayBuffer();
    await uploadBytes(ref, new Uint8Array(bytes), { contentType:file.type||'image/jpeg' });
    newPhotoURL = await getDownloadURL(ref);
  }
  await updateProfile(user, {
    displayName: (displayNameInput?.value || '').trim() || user.displayName || null,
    photoURL: newPhotoURL || user.photoURL || null
  }).catch(()=>{});
  showToast('Profile updated');
  profileDialog?.close();
}

/* ---------- Rooms listeners & handlers ---------- */
function startRooms(){
  const qref = collection(db,'users',user.uid,'rooms');
  onSnapshot(qref, snap=>{
    rooms = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(rooms.length===0){
      [{name:'Bedroom',icon:'🛏️'},{name:'Living room',icon:'🛋️'},{name:'Kitchen',icon:'🍽️'}]
        .forEach(r=> addDoc(collection(db,'users',user.uid,'rooms'), r));
    }
    renderRoomOptions(); renderPickers(); renderHome();
  });
}
function populateIconGrid(container){
  const icons=['🛏️','🛋️','🍽️','🚿','🧺','🧑‍🍳','🖥️','🎮','📚','🧸','🚪','🌿','🔥','❄️','☕','🎧'];
  if(!container) return; container.innerHTML='';
  icons.forEach(ic=>{ const d=document.createElement('div'); d.className='iconPick'; d.textContent=ic;
    d.onclick=()=>{ for(const el of container.querySelectorAll('.iconPick')) el.classList.remove('selected'); d.classList.add('selected'); container.dataset.icon=ic; };
    container.append(d);
  });
}
$('#btnAddRoom')?.addEventListener('click', ()=>{ populateIconGrid(iconGrid); addRoomForm?.reset(); addRoomDialog?.showModal(); });
$('#btnEditRoom')?.addEventListener('click', ()=>{ populateIconGrid(iconGridEdit); editRoomDialog?.showModal(); });
$('#btnRemoveRoom')?.addEventListener('click', ()=> removeRoomDialog?.showModal());
addRoomCancel?.addEventListener('click', ()=> addRoomDialog?.close());
editRoomCancel?.addEventListener('click', ()=> editRoomDialog?.close());
$('#removeRoomCancel')?.addEventListener('click', ()=> removeRoomDialog?.close());

addRoomForm?.addEventListener('submit', async e=>{
  e.preventDefault();
  const fd = new FormData(addRoomForm);
  const name = (fd.get('roomName')||'').toString().trim();
  const icon = iconGrid?.querySelector('.iconPick.selected')?.textContent || '🏷️';
  if(!name) return;
  if(rooms.some(r=> r.name.toLowerCase()===name.toLowerCase())) return showToast('Room name already exists');
  await addDoc(collection(db,'users',user.uid,'rooms'), { name, icon });
  addRoomDialog?.close(); showToast('Room added');
});
editRoomForm?.addEventListener('submit', async e=>{
  e.preventDefault();
  const fd=new FormData(editRoomForm);
  const oldName=fd.get('roomToEdit'); const newName=(fd.get('newRoomName')||'').toString().trim();
  const newIcon=iconGridEdit?.querySelector('.iconPick.selected')?.textContent;
  const roomDoc=rooms.find(r=>r.name===oldName); if(!roomDoc) return;
  if(newName && rooms.some(r=> r.id!==roomDoc.id && r.name.toLowerCase()===newName.toLowerCase())) return showToast('Room name already exists');
  const patch={}; if(newName) patch.name=newName; if(newIcon) patch.icon=newIcon;
  if(Object.keys(patch).length) await updateDoc(doc(db,'users',user.uid,'rooms',roomDoc.id), patch);
  if(newName && newName!==oldName){
    const plantCol = collection(db,'users',user.uid,'plants');
    const snap = await getDocs(plantCol);
    await Promise.all(snap.docs
      .filter(d=> (d.data().location||'')===oldName)
      .map(d=> updateDoc(doc(db,'users',user.uid,'plants',d.id), { location:newName })));
  }
  editRoomDialog?.close(); showToast('Room updated');
});
removeRoomForm?.addEventListener('submit', async e=>{
  e.preventDefault();
  const name=new FormData(removeRoomForm).get('roomToRemove');
  const roomDoc=rooms.find(r=>r.name===name); if(!roomDoc) return;
  await deleteDoc(doc(db,'users',user.uid,'rooms',roomDoc.id));
  const plantCol = collection(db,'users',user.uid,'plants');
  const snap = await getDocs(plantCol);
  await Promise.all(snap.docs
    .filter(d=> (d.data().location||'')===name)
    .map(d=> updateDoc(doc(db,'users',user.uid,'plants',d.id), { location:'Unassigned' })));
  removeRoomDialog?.close(); showToast('Room removed');
});

/* ---------- Plants listeners & handlers ---------- */
function startPlants(){
  const qref = collection(db,'users',user.uid,'plants');
  onSnapshot(qref, snap=>{
    plants = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderPickers(); renderHome();
    if(pages.insights?.classList.contains('active')) renderInsights();
  });
}
function renderRoomOptions(){
  if(!roomSelect) return;
  roomSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
}
function renderPickers(){
  if(!roomEditSelect||!roomRemoveSelect||!plantEditSelect||!plantRemoveSelect) return;
  roomEditSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
  roomRemoveSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
  plantEditSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||'Unassigned'})</option>`).join('');
  plantRemoveSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||'Unassigned'})</option>`).join('');
}
const roomIcon = name => (rooms.find(x=>x.name===name)?.icon || '🏷️');
function groupByRoom(list){ const map={}; for(const r of rooms) map[r.name]=[]; for(const p of list){ const rn=p.location||'Unassigned'; if(!map[rn]) map[rn]=[]; map[rn].push(p);} return map; }

function renderHome(){
  if(!homeContent||!homeEmpty) return;
  const sorted=[...plants].sort((a,b)=> new Date(a.nextDueUtc)-new Date(b.nextDueUtc));
  const groups = groupByRoom(sorted);
  homeContent.innerHTML='';
  const any = plants.length>0; homeEmpty.hidden = any; if(!any) return;

  for(const room of Object.keys(groups)){
    if(groups[room].length===0) continue;
    const sec=document.createElement('div'); sec.className='section';
    sec.innerHTML=`<h3><span class="roomIcon">${roomIcon(room)}</span> ${room.toUpperCase()}</h3>`;
    const wrap=document.createElement('div'); wrap.className='group';
    const row=document.createElement('div'); row.className='row';

    for(const p of groups[room]){
      const total=daysBetween(new Date(p.lastWateredUtc||p.createdAt||Date.now()), new Date(p.nextDueUtc||Date.now()))||1;
      const left =Math.max(0, Math.ceil((new Date(p.nextDueUtc||Date.now())-new Date())/86400000));
      const pct  =Math.max(0,Math.min(100,Math.round(((total-left)/total)*100)));

      const card=document.createElement('div'); card.className='card';
      card.addEventListener('click', (e)=>{ if(e.target.closest('.gear')||e.target.closest('.btn')) return; openDetails(p.id); });

      const gear=document.createElement('button'); gear.className='gear';
      gear.innerHTML=`<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1l-.4-2.6H9.2l-.4 2.6c-.6.2-1.2.5-1.7 1l-2.4-1-2 3.5 2 1.6a7.4 7.4 0 0 0-.1 1c0 .3 0 .7.1 1l-2 1.6 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h5.6l.4-2.6c.6-.2 1.2-.5 1.7-1l2.4 1 2-3.5-2-1.6c.1-.3.1-.6.1-1Z" fill="currentColor"/></svg>`;
      gear.onclick=()=>openEdit(p.id);

      const photoWrap=document.createElement('div'); photoWrap.className='photoWrap';
      const img=document.createElement('div'); img.className='photo'; img.style.backgroundImage=`url('${p.photoUrl||DEFAULT_IMG}')`;
      const ring=document.createElement('div'); ring.className='ring'; ring.style.setProperty('--pct', pct+'%'); ring.innerHTML=`<span>${left}d</span>`;
      photoWrap.append(img, ring);

      const title=document.createElement('div');
      const due = p.nextDueUtc ? new Date(p.nextDueUtc).toLocaleString() : '—';
      title.innerHTML=`<div class="name">${p.name}</div><div class="nick">${p.nickname||''}</div>`;

      const meta=document.createElement('div'); meta.className='meta'; meta.textContent=`Next due ${due}`;

      const actions=document.createElement('div'); actions.className='actions';
      const water=document.createElement('button'); water.className='btn primary'; water.textContent='Water';
      water.onclick=async(e)=>{ e.stopPropagation(); await markWatered(p.id); };
      const snooze=document.createElement('button'); snooze.className='btn ghost'; snooze.textContent='Snooze';
      snooze.onclick=async(e)=>{ e.stopPropagation(); const d=new Date(p.nextDueUtc||Date.now()); d.setUTCMinutes(d.getUTCMinutes()+60*24); await updateDoc(doc(db,'users',user.uid,'plants',p.id),{nextDueUtc:d.toISOString(),updatedAt:new Date().toISOString()}); showToast('Snoozed 1 day'); };

      actions.append(water,snooze);
      card.append(gear,photoWrap,title,meta,actions);
      row.append(card);
    }
    wrap.append(row); sec.append(wrap); homeContent.append(sec);
  }
}

/* ---------- Plant CRUD ---------- */
$('#btnAddPlant')?.addEventListener('click', ()=> openAdd());
$('#btnEditPlant')?.addEventListener('click', ()=> editPlantChooser?.showModal());
$('#btnRemovePlant')?.addEventListener('click', ()=> removePlantDialog?.showModal());
editPlantCancel?.addEventListener('click', ()=> editPlantChooser?.close());
$('#removePlantCancel')?.addEventListener('click', ()=> removePlantDialog?.close());
cancelBtn?.addEventListener('click', ()=>{ plantForm?.reset(); delete plantForm.dataset.editing; plantDialog?.close(); });

function openAdd(){
  plantDialogTitle && (plantDialogTitle.textContent='Add plant');
  deletePlantBtn && (deletePlantBtn.style.display='none');
  plantForm?.reset(); renderRoomOptions(); delete plantForm.dataset.editing; plantDialog?.showModal();
}
function openEdit(id){
  const p=plants.find(x=>x.id===id); if(!p) return;
  plantDialogTitle && (plantDialogTitle.textContent='Edit plant');
  deletePlantBtn && (deletePlantBtn.style.display='inline-block');
  plantForm?.reset(); renderRoomOptions();

  plantForm.querySelector('[name="name"]').value=p.name||'';
  plantForm.querySelector('[name="nickname"]').value=p.nickname||'';
  plantForm.querySelector('[name="plantType"]').value=p.plantType||'';
  plantForm.querySelector('[name="location"]').value=p.location||'';
  plantForm.querySelector('[name="potSize"]').value=p.potSize||15;
  plantForm.querySelector('[name="lightLevel"]').value=p.lightLevel||'medium';
  plantForm.querySelector('[name="scheduleMode"]').value=p.scheduleMode||'suggested';
  plantForm.querySelector('[name="customIntervalDays"]').value=p.customIntervalDays||10;
  plantForm.querySelector('[name="preferredWaterTime"]').value=p.preferredWaterTime||'09:00';
  plantForm.querySelector('[name="fertilizerIntervalDays"]').value=p.fertilizerIntervalDays||30;
  const fertTimeEl = plantForm.querySelector('[name="preferredFertilizeTime"]'); if(fertTimeEl) fertTimeEl.value = p.preferredFertilizeTime || p.preferredWaterTime || '09:00';

  plantForm.dataset.editing=id;
  plantDialog?.showModal();
}
deletePlantBtn?.addEventListener('click', async ()=>{
  const id=plantForm.dataset.editing; if(!id) return;
  await deleteDoc(doc(db,'users',user.uid,'plants',id));
  plantDialog?.close(); showToast('Plant deleted');
});
editPlantChooserForm?.addEventListener('submit', e=>{
  e.preventDefault(); const id=new FormData(editPlantChooserForm).get('plantToEdit');
  if(id){ editPlantChooser?.close(); openEdit(id); }
});
removePlantForm?.addEventListener('submit', async e=>{
  e.preventDefault(); const id=new FormData(removePlantForm).get('plantToRemove'); if(!id) return;
  await deleteDoc(doc(db,'users',user.uid,'plants',id)); removePlantDialog?.close(); showToast('Plant removed');
});

plantForm?.addEventListener('submit', async e=>{
  e.preventDefault();
  const fd=new FormData(plantForm);
  const editing=plantForm.dataset.editing||'';
  const file=fd.get('photo');
  let photoUrl='';

  if(file && file.size && file.size>2*1024*1024){ alert('Image too large, max 2MB'); return; }
  if(file && file.size){
    const path=`plants/${user.uid}/${editing || crypto.randomUUID()}.jpg`;
    const ref=sRef(storage, path);
    const bytes=await file.arrayBuffer();
    await uploadBytes(ref, new Uint8Array(bytes), { contentType:file.type||'image/jpeg' });
    photoUrl=await getDownloadURL(ref);
  }

  const preferredWaterTime = (fd.get('preferredWaterTime')||'09:00').toString();
  const preferredFertilizeTime = (fd.get('preferredFertilizeTime')||preferredWaterTime||'09:00').toString();
  const fertDays = Number(fd.get('fertilizerIntervalDays')||30);

  if(editing){
    const prev = plants.find(x=>x.id===editing) || {};
    const nextDue = toNextWithTime(prev.lastWateredUtc || new Date().toISOString(), calcIntervalDays(prev), preferredWaterTime);
    const patch={
      name: fd.get('name'),
      nickname: fd.get('nickname')||'',
      plantType: fd.get('plantType')||'',
      location: fd.get('location')||'Unassigned',
      potSize: Number(fd.get('potSize')||15),
      lightLevel: fd.get('lightLevel')||'medium',
      scheduleMode: fd.get('scheduleMode')||'suggested',
      customIntervalDays: Number(fd.get('customIntervalDays')||10),
      preferredWaterTime,
      preferredFertilizeTime,
      fertilizerIntervalDays: fertDays,
      nextDueUtc: nextDue,
      updatedAt: new Date().toISOString()
    };
    if(photoUrl) patch.photoUrl=photoUrl;
    await updateDoc(doc(db,'users',user.uid,'plants',editing), patch);
    showToast('Plant updated');
  } else {
    const p={
      name: fd.get('name'),
      nickname: fd.get('nickname')||'',
      photoUrl: photoUrl || DEFAULT_IMG,
      plantType: fd.get('plantType')||'',
      location: fd.get('location')||'Unassigned',
      potSize: Number(fd.get('potSize')||15),
      lightLevel: fd.get('lightLevel')||'medium',
      scheduleMode: fd.get('scheduleMode')||'suggested',
      customIntervalDays: Number(fd.get('customIntervalDays')||10),
      preferredWaterTime,
      preferredFertilizeTime,
      fertilizerIntervalDays: fertDays,
      lastWateredUtc: new Date().toISOString(),
      lastFertilizedUtc: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    p.nextDueUtc = toNextWithTime(p.lastWateredUtc, calcIntervalDays(p), preferredWaterTime);
    p.nextFertilizeUtc = toNextWithTime(new Date().toISOString(), fertDays, preferredFertilizeTime);
    await addDoc(collection(db,'users',user.uid,'plants'), p);
    showToast('Plant added');
  }
  plantDialog?.close();
});

/* ---------- Details modal + logs ---------- */
async function addLog(plantId, type){
  await addDoc(collection(db,'users',user.uid,'plants',plantId,'logs'),{ type, ts:new Date().toISOString() });
}
async function markWatered(plantId){
  const ref = doc(db,'users',user.uid,'plants',plantId);
  const p = plants.find(x=>x.id===plantId); if(!p) return;
  const interval = calcIntervalDays(p);
  const next = toNextWithTime(new Date().toISOString(), interval, p.preferredWaterTime || '09:00');
  await updateDoc(ref,{ lastWateredUtc:new Date().toISOString(), nextDueUtc: next, updatedAt:new Date().toISOString() });
  await addLog(plantId,'water');
  showToast('Watered');
}
async function markFertilized(plantId){
  const ref = doc(db,'users',user.uid,'plants',plantId);
  const p = plants.find(x=>x.id===plantId); if(!p) return;
  const days = Number(p.fertilizerIntervalDays || 30);
  const next = toNextWithTime(new Date().toISOString(), days, p.preferredFertilizeTime || p.preferredWaterTime || '09:00');
  await updateDoc(ref,{ lastFertilizedUtc:new Date().toISOString(), nextFertilizeUtc: next, updatedAt:new Date().toISOString() });
  await addLog(plantId,'fertilize');
  showToast('Fertilized');
}
async function openDetails(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  currentDetailsId = id;
  detailsImage && (detailsImage.style.backgroundImage = `url('${p.photoUrl || DEFAULT_IMG}')`);
  detailsTitle && (detailsTitle.textContent = p.name + (p.nickname ? ` (${p.nickname})` : ''));
  const meta = [
    (p.location || 'UNASSIGNED'),
    `Water: next ${p.nextDueUtc ? new Date(p.nextDueUtc).toLocaleString() : '—'}`,
    `Fertilize: next ${p.nextFertilizeUtc ? new Date(p.nextFertilizeUtc).toLocaleString() : '—'}`
  ].join(' • ');
  detailsMeta && (detailsMeta.textContent = meta);

  // history
  if(detailsTbody) detailsTbody.innerHTML = '<tr><td>Loading…</td><td></td></tr>';
  try {
    const logsQ = query(collection(db,'users',user.uid,'plants',p.id,'logs'), orderBy('ts','desc'), limit(30));
    const snap = await getDocs(logsQ);
    const all=[]; snap.forEach(d=> all.push(d.data()));
    const waters = all.filter(l=>l.type==='water').slice(0,3);
    const ferts  = all.filter(l=>l.type==='fertilize').slice(0,3);

    if(detailsTbody){
      detailsTbody.innerHTML='';
      const fmt = iso => { try{ return new Date(iso).toLocaleString(); }catch{ return iso||'—'; } };
      waters.forEach(w=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>Watered</td><td>${fmt(w.ts)}</td>`; detailsTbody.appendChild(tr); });
      ferts.forEach(f=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>Fertilized</td><td>${fmt(f.ts)}</td>`; detailsTbody.appendChild(tr); });
      if(!waters.length && !ferts.length){ const tr=document.createElement('tr'); tr.innerHTML='<td>—</td><td>—</td>'; detailsTbody.appendChild(tr); }
    }
  } catch { if(detailsTbody){ detailsTbody.innerHTML='<tr><td>—</td><td>—</td></tr>'; } }

  detailsDeleteBtn?.addEventListener('click', async ()=>{ if(!currentDetailsId) return; await deleteDoc(doc(db,'users',user.uid,'plants',currentDetailsId)); plantDetailsDialog?.close(); showToast('Plant deleted'); }, { once:true });
  detailsEditBtn?.addEventListener('click', ()=>{ plantDetailsDialog?.close(); if(currentDetailsId) openEdit(currentDetailsId); }, { once:true });
  detailsCloseBtn?.addEventListener('click', ()=> plantDetailsDialog?.close(), { once:true });
  plantDetailsDialog?.showModal();
}

/* ---------- Notification prompt ---------- */
notifyAllow?.addEventListener('click', async ()=>{ try{ await Notification.requestPermission(); }catch{} notifyDialog?.close(); });
notifyLater?.addEventListener('click', ()=> notifyDialog?.close());

/* ---------- Foreground scheduler ---------- */
function startScheduler(){
  if(schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(checkDue, 60*1000);
  checkDue();
}
function checkDue(){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  const now = new Date();
  for(const p of plants){
    const due = p.nextDueUtc ? new Date(p.nextDueUtc) : null;
    if(due && Math.abs(due - now) < 60*1000){
      new Notification(`Water ${p.name}`, { body:`It’s time to water ${p.name}`, icon:'assets/RGicon.jpg' });
    }
    const fDue = p.nextFertilizeUtc ? new Date(p.nextFertilizeUtc) : null;
    if(fDue && Math.abs(fDue - now) < 60*1000){
      new Notification(`Fertilize ${p.name}`, { body:`Fertilizer reminder for ${p.name}`, icon:'assets/RGicon.jpg' });
    }
  }
}

/* ---------- Insights ---------- */
async function renderInsights(){
  if(!chart14Water || !chart14Fert || !chartByPlant || !chartByRoomWater || !chartByRoomFert) return;

  const end = new Date(); const start = new Date(); start.setDate(end.getDate()-13);
  const daysW={}; const daysF={}; for(let i=0;i<14;i++){ const x=new Date(start); x.setDate(start.getDate()+i); const k=dayKey(x); daysW[k]=0; daysF[k]=0; }
  const perPlantW = {}; const perRoomW = {}; const perRoomF = {};

  for(const p of plants){
    perPlantW[p.name]=0;
    perRoomW[p.location||'Unassigned'] = perRoomW[p.location||'Unassigned']||0;
    perRoomF[p.location||'Unassigned'] = perRoomF[p.location||'Unassigned']||0;

    const logsSnap = await getDocs(collection(db,'users',user.uid,'plants',p.id,'logs'));
    logsSnap.forEach(docu=>{
      const L = docu.data(); const t = new Date(L.ts);
      if(L.type==='water'){
        perPlantW[p.name] = (perPlantW[p.name]||0)+1;
        perRoomW[p.location||'Unassigned'] = (perRoomW[p.location||'Unassigned']||0)+1;
        if(t>=start && t<=end){ daysW[dayKey(t)] = (daysW[dayKey(t)]||0)+1; }
      }else if(L.type==='fertilize'){
        perRoomF[p.location||'Unassigned'] = (perRoomF[p.location||'Unassigned']||0)+1;
        if(t>=start && t<=end){ daysF[dayKey(t)] = (daysF[dayKey(t)]||0)+1; }
      }
    });
  }

  drawBars(chart14Water, Object.keys(daysW), Object.values(daysW));
  drawBars(chart14Fert,  Object.keys(daysF), Object.values(daysF));
  drawBars(chartByPlant, Object.keys(perPlantW), Object.values(perPlantW));
  drawBars(chartByRoomWater, Object.keys(perRoomW), Object.values(perRoomW));
  drawBars(chartByRoomFert,  Object.keys(perRoomF), Object.values(perRoomF));
}
function drawBars(svgEl, labels, values){
  const W=560, H=160, PAD=28; const max=Math.max(1, ...values); const bw=(W-2*PAD)/Math.max(1, values.length);
  svgEl.innerHTML=''; svgEl.innerHTML += `<line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD}" y2="${H-PAD}" stroke="#cfe0d6"/>`; svgEl.innerHTML += `<line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H-PAD}" stroke="#cfe0d6"/>`;
  values.forEach((v,i)=>{ const h=(H-2*PAD)*(v/max); const x=PAD+i*bw+4; const y=(H-PAD)-h; svgEl.innerHTML += `<rect x="${x}" y="${y}" width="${bw-8}" height="${h}" rx="4" fill="#2e7d4e"/>`; });
  const step=Math.ceil(values.length/7);
  labels.forEach((lab,i)=>{ if(i%step!==0) return; const x=PAD+i*bw+(bw/2); svgEl.innerHTML += `<text x="${x}" y="${H-8}" text-anchor="middle" font-size="9" fill="#4a7c63">${lab.slice(5)}</text>`; });
  svgEl.innerHTML += `<text x="${PAD-6}" y="${PAD-6}" text-anchor="end" font-size="10" fill="#4a7c63">${max}</text>`;
}
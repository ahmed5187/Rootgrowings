// app_cloud.js v13
// - Null-safety guards to avoid "reading 'style'" crash
// - Insights extended: fertilizer charts + per-room charts
// - (Keeps: due-time, fertilizer fields, local notifs, profile upload, logs)

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithRedirect, getRedirectResult, signOut, signInWithPopup,
  setPersistence, browserLocalPersistence, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, onSnapshot,
  updateDoc, deleteDoc, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const $ = s => document.querySelector(s);
const DEFAULT_IMG = 'assets/tempplant.jpg';

/* ---------- Auth overlay ---------- */
const authOverlay = document.createElement('div');
authOverlay.style.cssText = `
  position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
  background:#f1f6f1; z-index:9999; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
`;
authOverlay.innerHTML = `
  <div style="width:min(92vw,420px); background:#fff; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,.08); padding:28px; text-align:center">
    <img src="assets/RGlogo.png" alt="RootGrowings" style="height:48px; margin-bottom:8px"/>
    <h2 style="margin:6px 0 14px; color:#14532d">Welcome</h2>
    <p style="color:#446; margin:0 0 18px">Sign in to save your rooms, plants, and photos.</p>
    <button id="googleStart" style="width:100%; padding:12px 16px; font-weight:600; background:#14532d; color:#fff; border:none; border-radius:8px; cursor:pointer">
      Continue with Google
    </button>
  </div>`;
document.body.appendChild(authOverlay);

/* ---------- DOM refs ---------- */
const pages = {
  home: $('#homePage'),
  settings: $('#settingsPage'),
  insights: $('#insightsPage'),
  chat: $('#chatPage'),
};
const titles = {
  home: $('#homeTitle'),
  settings: $('#settingsTitle'),
  insights: $('#insightsTitle')
};
const nav = {
  home: $('#navHome'),
  settings: $('#navSettings'),
  insights: $('#navInsights'),
  chat: $('#navChat'),
};

const plusBtn = $('#plusBtn');
const profileBtn = $('#profileBtn');
const homeContent = $('#homeContent');
const homeEmpty = $('#homeEmpty');

/* plant dialogs */
const plantDialog = $('#plantDialog');
const plantForm = $('#plantForm');
const plantDialogTitle = $('#plantDialogTitle');
const deletePlantBtn = $('#deletePlantBtn');
const cancelBtn = $('#cancelBtn');
const roomSelect = $('#roomSelect');

/* room dialogs */
const addRoomDialog = $('#addRoomDialog');
const addRoomForm = $('#addRoomForm');
const addRoomCancel = $('#addRoomCancel');
const iconGrid = $('#iconGrid');

const editRoomDialog = $('#editRoomDialog');
const editRoomForm = $('#editRoomForm');
const editRoomCancel = $('#editRoomCancel');
const roomEditSelect = $('#roomEditSelect');
const iconGridEdit = $('#iconGridEdit');

const removeRoomDialog = $('#removeRoomDialog');
const removeRoomForm = $('#removeRoomForm');
const roomRemoveSelect = $('#roomRemoveSelect');

/* plant chooser dialogs */
const editPlantChooser = $('#editPlantChooser');
const editPlantChooserForm = $('#editPlantChooserForm');
const editPlantCancel = $('#editPlantCancel');
const removePlantDialog = $('#removePlantDialog');
const removePlantForm = $('#removePlantForm');
const plantEditSelect = $('#plantEditSelect');
const plantRemoveSelect = $('#plantRemoveSelect');

/* profile */
const profileDialog = $('#profileDialog');
const profileForm = $('#profileForm');
const profileAvatar = $('#profileAvatar');
const profileName = $('#profileName');
const profileEmail = $('#profileEmail');
const displayNameInput = $('#displayNameInput');
const photoFileInput = $('#photoFileInput');
const closeProfile = $('#closeProfile');
const signOutBtn = $('#signOutBtn');

/* notifications */
const notifyDialog = $('#notifyDialog');
const notifyAllow = $('#notifyAllow');
const notifyLater = $('#notifyLater');

/* toast */
const toastDialog = $('#toastDialog');
const toastMsg = $('#toastMsg');
const toastOk = $('#toastOk');

/* details */
const plantDetailsDialog = $('#plantDetailsDialog');
const detailsImage = $('#detailsImage');
const detailsTitle = $('#detailsTitle');
const detailsMeta = $('#detailsMeta');
const detailsEditBtn = $('#detailsEditBtn');
const detailsDeleteBtn = $('#detailsDeleteBtn');
const detailsCloseBtn = $('#detailsCloseBtn');
const detailsFertBtn = $('#detailsFertBtn');

/* insights charts */
const chart14Water = $('#chart14Water');
const chart14Fert = $('#chart14Fert');
const chartByPlant = $('#chartByPlant');
const chartByRoomWater = $('#chartByRoomWater');
const chartByRoomFert = $('#chartByRoomFert');

function showToast(msg='Saved'){ if (toastMsg && toastDialog){ toastMsg.textContent=msg; toastDialog.showModal(); } }
toastOk?.addEventListener('click', ()=> toastDialog.close());

notifyAllow?.addEventListener('click', async ()=>{ try{ await Notification.requestPermission(); }catch{} notifyDialog.close(); });
notifyLater?.addEventListener('click', ()=> notifyDialog.close());

/* ---------- App init ---------- */
(function init(){
  (async () => {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    try { await setPersistence(auth, browserLocalPersistence); } catch {}

    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'googleStart') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try { await signInWithPopup(auth, provider); }
        catch (err) {
          if (err?.code === 'auth/operation-not-supported-in-this-environment' || err?.code === 'auth/popup-blocked') {
            await signInWithRedirect(auth, provider).catch(()=>{});
          }
        }
      }
    });

    try { const rr = await getRedirectResult(auth); if (rr?.user) boot(rr.user); } catch {}

    onAuthStateChanged(auth, (u) => {
      if (!u) {
        Object.values(pages).forEach(p => p && (p.style.display='none')); // null-safe
        authOverlay.style.display='flex';
        return;
      }
      boot(u);
    });

    let booted=false, rooms=[], plants=[];
    let schedulerTimer=null, currentDetailsId=null;

    function boot(u){
      if (booted) return; booted=true;
      authOverlay.style.display='none';
      Object.values(pages).forEach(p => p && (p.style.display='')); // null-safe
      activate('home');

      startRooms();
      startPlants();
      startScheduler();

      if ('Notification' in window && Notification.permission === 'default'){
        setTimeout(()=> notifyDialog?.showModal(), 600);
      }

      plusBtn?.addEventListener('click', ()=> activate('settings'));
      profileBtn?.addEventListener('click', openProfile);

      nav.home?.addEventListener('click', ()=> activate('home'));
      nav.settings?.addEventListener('click', ()=> activate('settings'));
      nav.insights?.addEventListener('click', ()=>{ activate('insights'); renderInsights(); });
      nav.chat?.addEventListener('click', ()=> activate('chat'));
    }

    function activate(key){
      if (!pages[key]) return;
      Object.keys(pages).forEach(k=> pages[k]?.classList.remove('active'));
      pages[key]?.classList.add('active');
      Object.keys(nav).forEach(k=> nav[k]?.classList.remove('active'));
      nav[key]?.classList.add('active');
      Object.keys(titles).forEach(k=> titles[k] && (titles[k].style.display = (k===key ? 'block' : 'none')));
      window.scrollTo({ top:0, behavior:'instant' });
    }

    /* -------- Profile -------- */
    async function openProfile(){
      const u = auth.currentUser; if(!u) return;
      if (profileName) profileName.textContent = u.displayName || 'Plant lover';
      if (profileEmail) profileEmail.textContent = u.email || '';
      if (profileAvatar) profileAvatar.src = u.photoURL || 'assets/RGicon.jpg';
      if (displayNameInput) displayNameInput.value = u.displayName || '';
      if (photoFileInput) photoFileInput.value = '';
      profileDialog?.showModal();
    }
    closeProfile?.addEventListener('click', ()=> profileDialog.close());
    signOutBtn?.addEventListener('click', ()=> signOut(auth).catch(()=>{}).finally(()=>profileDialog.close()));
    profileForm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const u=auth.currentUser; if(!u) return;

      let newPhotoURL = null;
      const file = photoFileInput?.files?.[0];
      if (file && file.size){
        if (file.size > 2*1024*1024){ alert('Image too large, max 2MB'); return; }
        const ref = sRef(storage, `avatars/${u.uid}.jpg`);
        const bytes = await file.arrayBuffer();
        await uploadBytes(ref, new Uint8Array(bytes), { contentType:file.type||'image/jpeg' });
        newPhotoURL = await getDownloadURL(ref);
      }
      try{
        await updateProfile(u,{
          displayName: (displayNameInput?.value || '').trim() || null,
          photoURL: newPhotoURL || u.photoURL || null
        });
        showToast('Profile updated');
      }catch{ showToast('Could not update profile'); }
      profileDialog?.close();
    });

    /* -------- Listeners -------- */
    function startRooms(){
      const q = collection(db,'users',auth.currentUser.uid,'rooms');
      onSnapshot(q, s=>{
        rooms = s.docs.map(d=>({id:d.id, ...d.data()}));
        if (rooms.length===0){
          [{name:'Bedroom',icon:'🛏️'},{name:'Living room',icon:'🛋️'},{name:'Kitchen',icon:'🍽️'}]
            .forEach(r=>addDoc(collection(db,'users',auth.currentUser.uid,'rooms'),r));
        }
        renderRoomOptions(); renderHome(); renderPickers();
      });
    }
    function startPlants(){
      const q = collection(db,'users',auth.currentUser.uid,'plants');
      onSnapshot(q, s=>{
        plants = s.docs.map(d=>({id:d.id, ...d.data()}));
        renderHome(); renderPickers();
        if (pages.insights?.classList.contains('active')) renderInsights();
      });
    }

    /* -------- Schedule helpers -------- */
    const baseIntervalDays = (t)=>({ 'Monstera deliciosa':7,'Epipremnum aureum':7,'Spathiphyllum':6,'Sansevieria':14,'Ficus elastica':10 }[t]||8);
    const lightFactor = v => v==='bright'?0.8 : v==='low'?1.2 : 1.0;
    const seasonFactor = d => { const m=d.getMonth()+1; if(m>=6&&m<=8) return 0.9; if(m===12||m<=2) return 1.1; return 1.0; };
    const potFactor = cm => !cm?1.0 : cm<12?0.9 : cm>18?1.1 : 1.0;
    function calcIntervalDays(p){ if(p.scheduleMode==='custom') return Number(p.customIntervalDays||10); const base=p.suggestedIntervalDays||baseIntervalDays(p.plantType); const f=lightFactor(p.lightLevel)*seasonFactor(new Date())*potFactor(Number(p.potSize)); return Math.max(2,Math.round(base*f)); }
    function toNextWithTime(baseDateISO, intervalDays, hhmm='09:00'){
      const base = baseDateISO ? new Date(baseDateISO) : new Date();
      const [hh,mm] = (hhmm||'09:00').split(':').map(n=>parseInt(n,10));
      const n = new Date(base);
      n.setMinutes(0); n.setSeconds(0); n.setMilliseconds(0);
      n.setDate(n.getDate()+intervalDays);
      n.setHours(hh||9, mm||0, 0, 0);
      return n.toISOString();
    }
    const daysBetween = (a,b)=>Math.max(0,Math.ceil((b-a)/86400000));
    const roomIcon = name => (rooms.find(x=>x.name===name)?.icon || '🏷️');
    const allRoomNames = ()=> rooms.map(r=>r.name);
    const groupByRoom = list => { const map={}; for(const r of rooms) map[r.name]=[]; for(const p of list){ const rn=p.location||'Unassigned'; if(!map[rn]) map[rn]=[]; map[rn].push(p);} return map; };

    /* -------- Render -------- */
    function renderRoomOptions(){
      if (!roomSelect) return;
      roomSelect.innerHTML = allRoomNames().map(r=>`<option value="${r}">${r}</option>`).join('');
    }
    function renderPickers(){
      if (!roomEditSelect || !roomRemoveSelect || !plantEditSelect || !plantRemoveSelect) return;
      roomEditSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
      roomRemoveSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
      plantEditSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||'Unassigned'})</option>`).join('');
      plantRemoveSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||'Unassigned'})</option>`).join('');
    }

    function renderHome(){
      if (!homeContent || !homeEmpty) return;
      const sorted=[...plants].sort((a,b)=>new Date(a.nextDueUtc)-new Date(b.nextDueUtc));
      const groups=groupByRoom(sorted);
      homeContent.innerHTML='';
      const any = plants.length>0; homeEmpty.hidden = any; if(!any) return;

      for(const room of Object.keys(groups)){
        if(groups[room].length===0) continue;
        const sec=document.createElement('div'); sec.className='section';
        sec.innerHTML=`<h3><span class="roomIcon">${roomIcon(room)}</span> ${room.toUpperCase()}</h3>`;
        const wrap=document.createElement('div'); wrap.className='group';
        const row=document.createElement('div'); row.className='row';

        for(const p of groups[room]){
          const total=daysBetween(new Date(p.lastWateredUtc), new Date(p.nextDueUtc))||1;
          const left =Math.max(0, Math.ceil((new Date(p.nextDueUtc)-new Date())/86400000));
          const pct  =Math.max(0,Math.min(100,Math.round(((total-left)/total)*100)));

          const card=document.createElement('div'); card.className='card';
          card.addEventListener('click', (e)=>{
            if (e.target.closest('.gear') || e.target.closest('.btn')) return;
            openDetails(p.id);
          });

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
          const due = new Date(p.nextDueUtc).toLocaleString();
          title.innerHTML=`<div class="name">${p.name}</div><div class="nick">${p.nickname||''}</div>`;

          const meta=document.createElement('div'); meta.className='meta';
          meta.textContent = `Next due ${due}`;

          const actions=document.createElement('div'); actions.className='actions';
          const water=document.createElement('button'); water.className='btn primary'; water.textContent='Water';
          water.onclick=async(e)=>{ e.stopPropagation(); await markWatered(p.id); };
          const snooze=document.createElement('button'); snooze.className='btn ghost'; snooze.textContent='Snooze';
          snooze.onclick=async(e)=>{ e.stopPropagation(); const d=new Date(p.nextDueUtc); d.setUTCMinutes(d.getUTCMinutes()+60*24); await updateDoc(doc(db,'users',auth.currentUser.uid,'plants',p.id),{nextDueUtc:d.toISOString(),updatedAt:new Date().toISOString()}); showToast('Snoozed 1 day'); };
          actions.append(water,snooze);

          card.append(gear,photoWrap,title,meta,actions);
          row.append(card);
        }
        wrap.append(row); sec.append(wrap); homeContent.append(sec);
      }
    }

    /* ---- Water/Fertilize + logs ---- */
    async function addLog(plantId, type){
      await addDoc(collection(db,'users',auth.currentUser.uid,'plants',plantId,'logs'),{
        type, ts: new Date().toISOString()
      });
    }
    async function markWatered(plantId){
      const ref = doc(db,'users',auth.currentUser.uid,'plants',plantId);
      const p = plants.find(x=>x.id===plantId); if(!p) return;
      const interval = calcIntervalDays(p);
      const next = toNextWithTime(new Date().toISOString(), interval, p.preferredWaterTime || '09:00');
      await updateDoc(ref,{ lastWateredUtc:new Date().toISOString(), nextDueUtc: next, updatedAt:new Date().toISOString() });
      await addLog(plantId,'water');
      showToast('Watered');
    }
    async function markFertilized(plantId){
      const ref = doc(db,'users',auth.currentUser.uid,'plants',plantId);
      const p = plants.find(x=>x.id===plantId); if(!p) return;
      const days = Number(p.fertilizerIntervalDays || 30);
      const next = toNextWithTime(new Date().toISOString(), days, p.preferredWaterTime || '09:00');
      await updateDoc(ref,{ lastFertilizedUtc:new Date().toISOString(), nextFertilizeUtc: next, updatedAt:new Date().toISOString() });
      await addLog(plantId,'fertilize');
      showToast('Fertilized');
    }

    function openDetails(id){
      const p = plants.find(x=>x.id===id); if(!p) return;
      currentDetailsId = id;
      detailsImage && (detailsImage.style.backgroundImage = `url('${p.photoUrl || DEFAULT_IMG}')`);
      detailsTitle && (detailsTitle.textContent = p.name + (p.nickname ? ` (${p.nickname})` : ''));
      const meta = [
        (p.location || 'Unassigned'),
        `Water: next ${new Date(p.nextDueUtc).toLocaleString()}`,
        `Fertilize: next ${p.nextFertilizeUtc ? new Date(p.nextFertilizeUtc).toLocaleDateString() : '—'}`
      ].join(' • ');
      detailsMeta && (detailsMeta.textContent = meta);
      plantDetailsDialog?.showModal();
    }
    detailsCloseBtn?.addEventListener('click', ()=> plantDetailsDialog.close());
    detailsEditBtn?.addEventListener('click', ()=> { plantDetailsDialog.close(); if(currentDetailsId) openEdit(currentDetailsId); });
    detailsDeleteBtn?.addEventListener('click', async ()=>{
      if(!currentDetailsId) return;
      await deleteDoc(doc(db,'users',auth.currentUser.uid,'plants',currentDetailsId));
      plantDetailsDialog.close();
      showToast('Plant deleted');
    });
    detailsFertBtn?.addEventListener('click', async ()=>{ if(currentDetailsId){ await markFertilized(currentDetailsId); plantDetailsDialog.close(); } });

    /* -------- Icon grid -------- */
    function populateIconGrid(container){
      const icons=['🛏️','🛋️','🍽️','🚿','🧺','🧑‍🍳','🖥️','🎮','📚','🧸','🚪','🌿','🔥','❄️','☕','🎧'];
      if (!container) return;
      container.innerHTML='';
      icons.forEach(ic=>{
        const d=document.createElement('div'); d.className='iconPick'; d.textContent=ic;
        d.onclick=()=>{ for(const el of container.querySelectorAll('.iconPick')) el.classList.remove('selected'); d.classList.add('selected'); container.dataset.icon=ic; };
        container.append(d);
      });
    }

    /* -------- Rooms (unique names) -------- */
    $('#btnAddRoom')?.addEventListener('click', ()=>{ populateIconGrid(iconGrid); addRoomForm?.reset(); addRoomDialog?.showModal(); });
    $('#btnEditRoom')?.addEventListener('click', ()=>{ populateIconGrid(iconGridEdit); editRoomDialog?.showModal(); });
    $('#btnRemoveRoom')?.addEventListener('click', ()=> removeRoomDialog?.showModal());
    addRoomCancel?.addEventListener('click', ()=> addRoomDialog.close());
    editRoomCancel?.addEventListener('click', ()=> editRoomDialog.close());
    $('#removeRoomCancel')?.addEventListener('click', ()=> removeRoomDialog.close());

    addRoomForm?.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd=new FormData(addRoomForm);
      const name=(fd.get('roomName')||'').toString().trim();
      const icon=iconGrid?.querySelector('.iconPick.selected')?.textContent || '🏷️';
      if(!name) return;

      const exists = rooms.some(r => r.name.toLowerCase() === name.toLowerCase());
      if (exists){ showToast('Room name already exists'); return; }

      await addDoc(collection(db,'users',auth.currentUser.uid,'rooms'),{ name, icon });
      addRoomDialog?.close();
      showToast('Room added');
    });

    editRoomForm?.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd=new FormData(editRoomForm);
      const oldName=fd.get('roomToEdit');
      const newName=(fd.get('newRoomName')||'').toString().trim();
      const newIcon=iconGridEdit?.querySelector('.iconPick.selected')?.textContent;

      const roomDoc=rooms.find(r=>r.name===oldName); if(!roomDoc) return;

      if (newName && rooms.some(r => r.id!==roomDoc.id && r.name.toLowerCase() === newName.toLowerCase())){
        showToast('Room name already exists'); return;
      }

      const patch={}; if(newName) patch.name=newName; if(newIcon) patch.icon=newIcon;
      if(Object.keys(patch).length) await updateDoc(doc(db,'users',auth.currentUser.uid,'rooms',roomDoc.id),patch);

      if(newName && newName!==oldName){
        for(const p of plants.filter(p=>p.location===oldName)){
          await updateDoc(doc(db,'users',auth.currentUser.uid,'plants',p.id),{ location:newName });
        }
      }
      editRoomDialog?.close();
      showToast('Room updated');
    });

    removeRoomForm?.addEventListener('submit', async e=>{
      e.preventDefault();
      const name=new FormData(removeRoomForm).get('roomToRemove');
      const roomDoc=rooms.find(r=>r.name===name); if(!roomDoc) return;
      await deleteDoc(doc(db,'users',auth.currentUser.uid,'rooms',roomDoc.id));
      for(const p of plants.filter(p=>p.location===name)){
        await updateDoc(doc(db,'users',auth.currentUser.uid,'plants',p.id),{ location:'Unassigned' });
      }
      removeRoomDialog?.close();
      showToast('Room removed');
    });

    /* -------- Plants -------- */
    $('#btnAddPlant')?.addEventListener('click', ()=>openAdd());
    $('#btnEditPlant')?.addEventListener('click', ()=>editPlantChooser?.showModal());
    $('#btnRemovePlant')?.addEventListener('click', ()=>removePlantDialog?.showModal());
    editPlantCancel?.addEventListener('click', ()=>editPlantChooser?.close());
    $('#removePlantCancel')?.addEventListener('click', ()=>removePlantDialog?.close());

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

      plantForm.dataset.editing=id;
      plantDialog?.showModal();
    }
    deletePlantBtn?.addEventListener('click', async ()=>{ const id=plantForm.dataset.editing; if(!id) return; await deleteDoc(doc(db,'users',auth.currentUser.uid,'plants',id)); plantDialog?.close(); showToast('Plant deleted'); });
    editPlantChooserForm?.addEventListener('submit', e=>{ e.preventDefault(); const id=new FormData(editPlantChooserForm).get('plantToEdit'); if(id){ editPlantChooser?.close(); openEdit(id);} });
    removePlantForm?.addEventListener('submit', async e=>{ e.preventDefault(); const id=new FormData(removePlantForm).get('plantToRemove'); if(!id) return; await deleteDoc(doc(db,'users',auth.currentUser.uid,'plants',id)); removePlantDialog?.close(); showToast('Plant removed'); });
    cancelBtn?.addEventListener('click', ()=>{ plantForm?.reset(); delete plantForm.dataset.editing; plantDialog?.close(); });

    plantForm?.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd=new FormData(plantForm);
      const editing=plantForm.dataset.editing||'';
      const file=fd.get('photo');
      let photoUrl='';

      if(file && file.size && file.size>2*1024*1024){ alert('Image too large, max 2MB'); return; }
      if(file && file.size){
        const path=`plants/${auth.currentUser.uid}/${editing || crypto.randomUUID()}.jpg`;
        const ref=sRef(storage, path);
        const bytes=await file.arrayBuffer();
        await uploadBytes(ref, new Uint8Array(bytes), { contentType:file.type||'image/jpeg' });
        photoUrl=await getDownloadURL(ref);
      }

      const preferredWaterTime = (fd.get('preferredWaterTime')||'09:00').toString();
      const fertDays = Number(fd.get('fertilizerIntervalDays')||30);

      if(editing){
        const p = plants.find(x=>x.id===editing) || {};
        const nextDue = toNextWithTime(p.lastWateredUtc || new Date().toISOString(), calcIntervalDays(p), preferredWaterTime);
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
          fertilizerIntervalDays: fertDays,
          nextDueUtc: nextDue,
          updatedAt: new Date().toISOString()
        };
        if(photoUrl) patch.photoUrl=photoUrl;
        await updateDoc(doc(db,'users',auth.currentUser.uid,'plants',editing), patch);
        showToast('Plant updated');
      } else {
        const dummy = {
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
          fertilizerIntervalDays: fertDays,
          lastWateredUtc: new Date().toISOString(),
          lastFertilizedUtc: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const nextWater = toNextWithTime(dummy.lastWateredUtc, calcIntervalDays(dummy), preferredWaterTime);
        const nextFert = toNextWithTime(new Date().toISOString(), fertDays, preferredWaterTime);
        dummy.nextDueUtc = nextWater;
        dummy.nextFertilizeUtc = nextFert;
        await addDoc(collection(db,'users',auth.currentUser.uid,'plants'), dummy);
        showToast('Plant added');
      }
      plantDialog?.close();
    });

    /* -------- Foreground scheduler -------- */
    function startScheduler(){
      if (schedulerTimer) clearInterval(schedulerTimer);
      schedulerTimer = setInterval(checkDue, 60*1000);
      checkDue();
    }
    function checkDue(){
      if (!('Notification' in window) || Notification.permission!=='granted') return;
      const now = new Date();
      for (const p of plants){
        const due = p.nextDueUtc ? new Date(p.nextDueUtc) : null;
        if (due && Math.abs(due - now) < 60*1000){
          new Notification(`Water ${p.name}`, { body:`It’s time to water ${p.name}`, icon:'assets/RGicon.jpg' });
        }
        const fDue = p.nextFertilizeUtc ? new Date(p.nextFertilizeUtc) : null;
        if (fDue && Math.abs(fDue - now) < 60*1000){
          new Notification(`Fertilize ${p.name}`, { body:`Fertilizer reminder for ${p.name}`, icon:'assets/RGicon.jpg' });
        }
      }
    }

    /* -------- Insights -------- */
    async function renderInsights(){
      if (!chart14Water || !chart14Fert || !chartByPlant || !chartByRoomWater || !chartByRoomFert) return;

      const end = new Date();
      const start = new Date(); start.setDate(end.getDate()-13);
      const dayKey = d => d.toISOString().slice(0,10);

      const daysW = {}, daysF = {};
      for(let i=0;i<14;i++){ const x=new Date(start); x.setDate(start.getDate()+i); const k=dayKey(x); daysW[k]=0; daysF[k]=0; }

      const perPlantW = {};
      const perRoomW = {};
      const perRoomF = {};

      for (const p of plants){
        perPlantW[p.name]=0;
        perRoomW[p.location||'Unassigned'] = perRoomW[p.location||'Unassigned']||0;
        perRoomF[p.location||'Unassigned'] = perRoomF[p.location||'Unassigned']||0;

        const logsSnap = await getDocs(collection(db,'users',auth.currentUser.uid,'plants',p.id,'logs'));
        logsSnap.forEach(docu=>{
          const L = docu.data(); const t = new Date(L.ts);
          if (L.type==='water'){
            perPlantW[p.name] = (perPlantW[p.name]||0)+1;
            perRoomW[p.location||'Unassigned'] = (perRoomW[p.location||'Unassigned']||0)+1;
            if (t>=start && t<=end){ daysW[dayKey(t)] = (daysW[dayKey(t)]||0)+1; }
          } else if (L.type==='fertilize'){
            perRoomF[p.location||'Unassigned'] = (perRoomF[p.location||'Unassigned']||0)+1;
            if (t>=start && t<=end){ daysF[dayKey(t)] = (daysF[dayKey(t)]||0)+1; }
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
      const W=560, H=160, PAD=28;
      const max=Math.max(1, ...values);
      const bw=(W-2*PAD)/Math.max(1, values.length);
      svgEl.innerHTML='';
      svgEl.innerHTML += `<line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD}" y2="${H-PAD}" stroke="#cfe0d6"/>`;
      svgEl.innerHTML += `<line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H-PAD}" stroke="#cfe0d6"/>`;

      values.forEach((v,i)=>{
        const h = (H-2*PAD) * (v/max);
        const x = PAD + i*bw + 4;
        const y = (H-PAD) - h;
        svgEl.innerHTML += `<rect x="${x}" y="${y}" width="${bw-8}" height="${h}" rx="4" fill="#2e7d4e"/>`;
      });

      const step = Math.ceil(values.length/7);
      labels.forEach((lab,i)=>{
        if (i%step!==0) return;
        const x = PAD + i*bw + (bw/2);
        svgEl.innerHTML += `<text x="${x}" y="${H-8}" text-anchor="middle" font-size="9" fill="#4a7c63">${lab.slice(5)}</text>`;
      });

      svgEl.innerHTML += `<text x="${PAD-6}" y="${PAD-6}" text-anchor="end" font-size="10" fill="#4a7c63">${max}</text>`;
    }

  })();
})();

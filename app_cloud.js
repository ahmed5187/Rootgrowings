// app_cloud.js v10
// Centered UI, hero taller, card click -> details dialog,
// rooms shown UPPERCASE, room names unique (case-insensitive) on add/rename.

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithRedirect, getRedirectResult, signOut, signInWithPopup,
  setPersistence, browserLocalPersistence, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, onSnapshot,
  updateDoc, deleteDoc
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
const homePage = $('#homePage');
const settingsPage = $('#settingsPage');
const chatPage = $('#chatPage');
const navHome = $('#navHome');
const navSettings = $('#navSettings');
const navChat = $('#navChat');
const plusBtn = $('#plusBtn');
const profileBtn = $('#profileBtn');
const homeTitle = $('#homeTitle');
const settingsTitle = $('#settingsTitle');
const homeContent = $('#homeContent');
const homeEmpty = $('#homeEmpty');

const plantDialog = $('#plantDialog');
const plantForm = $('#plantForm');
const plantDialogTitle = $('#plantDialogTitle');
const deletePlantBtn = $('#deletePlantBtn');
const cancelBtn = $('#cancelBtn');
const roomSelect = $('#roomSelect');

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

const editPlantChooser = $('#editPlantChooser');
const editPlantChooserForm = $('#editPlantChooserForm');
const editPlantCancel = $('#editPlantCancel');
const removePlantDialog = $('#removePlantDialog');
const removePlantForm = $('#removePlantForm');
const plantEditSelect = $('#plantEditSelect');
const plantRemoveSelect = $('#plantRemoveSelect');

/* Profile */
const profileDialog = $('#profileDialog');
const profileForm = $('#profileForm');
const profileAvatar = $('#profileAvatar');
const profileName = $('#profileName');
const profileEmail = $('#profileEmail');
const displayNameInput = $('#displayNameInput');
const photoUrlInput = $('#photoUrlInput');
const closeProfile = $('#closeProfile');
const signOutBtn = $('#signOutBtn');

/* Toast dialog */
const toastDialog = $('#toastDialog');
const toastMsg = $('#toastMsg');
const toastOk = $('#toastOk');

/* Plant details dialog */
const plantDetailsDialog = $('#plantDetailsDialog');
const detailsImage = $('#detailsImage');
const detailsTitle = $('#detailsTitle');
const detailsMeta = $('#detailsMeta');
const detailsEditBtn = $('#detailsEditBtn');
const detailsDeleteBtn = $('#detailsDeleteBtn');
const detailsCloseBtn = $('#detailsCloseBtn');

function showAppFrame(show){
  [homePage, settingsPage, chatPage].forEach(p => p && (p.style.display = show ? '' : 'none'));
}
showAppFrame(false);

/* ---------- Init ---------- */
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
    onAuthStateChanged(auth, (u) => { if (!u) { showAppFrame(false); authOverlay.style.display='flex'; return; } boot(u); });

    let booted=false, rooms=[], plants=[];
    function boot(u){
      if (booted) return; booted=true;
      authOverlay.style.display='none';
      showAppFrame(true);
      activate(homePage);

      startRooms();
      startPlants();

      plusBtn.onclick = () => activate(settingsPage);
      profileBtn.onclick = openProfile;

      navHome.onclick = () => activate(homePage);
      navSettings.onclick = () => activate(settingsPage);
      navChat.onclick = () => activate(chatPage);
    }

    function activate(page){
      for (const el of document.querySelectorAll('.page')) el.classList.remove('active');
      page.classList.add('active');
      for (const b of [navHome, navSettings, navChat]) b && b.classList.remove('active');
      if (page===homePage){ navHome.classList.add('active'); homeTitle.style.display='block'; settingsTitle.style.display='none'; }
      if (page===settingsPage){ navSettings.classList.add('active'); homeTitle.style.display='none'; settingsTitle.style.display='block'; }
      if (page===chatPage){ navChat.classList.add('active'); homeTitle.style.display='none'; settingsTitle.style.display='none'; }
      window.scrollTo({ top:0, behavior:'instant' });
    }

    /* -------- Profile -------- */
    function openProfile(){
      const u = auth.currentUser;
      if (!u) return;
      profileName.textContent = u.displayName || 'Anonymous plant lover';
      profileEmail.textContent = u.email || '';
      profileAvatar.src = u.photoURL || 'assets/RGicon.jpg';
      displayNameInput.value = u.displayName || '';
      photoUrlInput.value = u.photoURL || '';
      profileDialog.showModal();
    }
    closeProfile.onclick = () => profileDialog.close();
    signOutBtn.onclick = () => signOut(auth).catch(()=>{}).finally(()=>profileDialog.close());
    profileForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const u=auth.currentUser; if(!u) return;
      try{
        await updateProfile(u,{
          displayName: displayNameInput.value.trim() || null,
          photoURL: photoUrlInput.value.trim() || null
        });
        showToast('Profile updated');
      }catch{ showToast('Could not update profile'); }
      profileDialog.close();
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
      });
    }

    /* -------- Schedules -------- */
    const baseIntervalDays = (t)=>({ 'Monstera deliciosa':7,'Epipremnum aureum':7,'Spathiphyllum':6,'Sansevieria':14,'Ficus elastica':10 }[t]||8);
    const lightFactor = v => v==='bright'?0.8 : v==='low'?1.2 : 1.0;
    const seasonFactor = d => { const m=d.getMonth()+1; if(m>=6&&m<=8) return 0.9; if(m===12||m<=2) return 1.1; return 1.0; };
    const potFactor = cm => !cm?1.0 : cm<12?0.9 : cm>18?1.1 : 1.0;
    function calcIntervalDays(p){ if(p.scheduleMode==='custom') return Number(p.customIntervalDays||10); const base=p.suggestedIntervalDays||baseIntervalDays(p.plantType); const f=lightFactor(p.lightLevel)*seasonFactor(new Date())*potFactor(Number(p.potSize)); return Math.max(2,Math.round(base*f)); }
    function setNextDue(p){ const last=p.lastWateredUtc?new Date(p.lastWateredUtc):new Date(); const n=new Date(last); n.setUTCDate(n.getUTCDate()+calcIntervalDays(p)); p.suggestedIntervalDays=calcIntervalDays(p); p.nextDueUtc=n.toISOString(); }
    const daysBetween = (a,b)=>Math.max(0,Math.ceil((b-a)/86400000));
    const roomIcon = name => (rooms.find(x=>x.name===name)?.icon || '🏷️');
    const allRoomNames = ()=> rooms.map(r=>r.name);
    const groupByRoom = list => { const map={}; for(const r of rooms) map[r.name]=[]; for(const p of list){ const rn=p.location||'Unassigned'; if(!map[rn]) map[rn]=[]; map[rn].push(p);} return map; };

    /* -------- Render -------- */
    function renderRoomOptions(){
      roomSelect.innerHTML = allRoomNames().map(r=>`<option value="${r}">${r}</option>`).join('');
    }
    function renderPickers(){
      roomEditSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
      roomRemoveSelect.innerHTML = rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
      plantEditSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||'Unassigned'})</option>`).join('');
      plantRemoveSelect.innerHTML = plants.map(p=>`<option value="${p.id}">${p.name} (${p.location||'Unassigned'})</option>`).join('');
    }

    function renderHome(){
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
          const left =daysBetween(new Date(), new Date(p.nextDueUtc));
          const pct  =Math.max(0,Math.min(100,Math.round(((total-left)/total)*100)));

          const card=document.createElement('div'); card.className='card';
          // clicking card -> details (ignore internal buttons/gear)
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
          title.innerHTML=`<div class="name">${p.name}</div><div class="nick">${p.nickname||''}</div>`;

          const meta=document.createElement('div'); meta.className='meta';
          meta.textContent = `Next due ${new Date(p.nextDueUtc).toLocaleDateString()}`;

          const actions=document.createElement('div'); actions.className='actions';
          const water=document.createElement('button'); water.className='btn primary'; water.textContent='Water';
          water.onclick=async(e)=>{ e.stopPropagation(); const ref=doc(db,'users',auth.currentUser.uid,'plants',p.id); const now=new Date().toISOString(); await updateDoc(ref,{lastWateredUtc:now,updatedAt:now}); showToast('Watered'); };
          const snooze=document.createElement('button'); snooze.className='btn ghost'; snooze.textContent='Snooze';
          snooze.onclick=async(e)=>{ e.stopPropagation(); const d=new Date(p.nextDueUtc); d.setUTCDate(d.getUTCDate()+1); await updateDoc(doc(db,'users',auth.currentUser.uid,'plants',p.id),{nextDueUtc:d.toISOString(),updatedAt:new Date().toISOString()}); showToast('Snoozed 1 day'); };
          actions.append(water,snooze);

          card.append(gear,photoWrap,title,meta,actions);
          row.append(card);
        }
        wrap.append(row); sec.append(wrap); homeContent.append(sec);
      }
    }

    /* -------- Details dialog -------- */
    let currentDetailsId = null;
    function openDetails(id){
      const p = plants.find(x=>x.id===id); if(!p) return;
      currentDetailsId = id;
      detailsImage.style.backgroundImage = `url('${p.photoUrl || DEFAULT_IMG}')`;
      detailsTitle.textContent = p.name + (p.nickname ? ` (${p.nickname})` : '');
      const meta = [
        (p.location || 'Unassigned'),
        `Next: ${new Date(p.nextDueUtc).toLocaleDateString()}`,
        `Last: ${new Date(p.lastWateredUtc || new Date()).toLocaleDateString()}`
      ].join(' • ');
      detailsMeta.textContent = meta;
      plantDetailsDialog.showModal();
    }
    detailsCloseBtn.onclick = ()=> plantDetailsDialog.close();
    detailsEditBtn.onclick = ()=> { plantDetailsDialog.close(); if(currentDetailsId) openEdit(currentDetailsId); };
    detailsDeleteBtn.onclick = async ()=>{
      if(!currentDetailsId) return;
      await deleteDoc(doc(db,'users',auth.currentUser.uid,'plants',currentDetailsId));
      plantDetailsDialog.close();
      showToast('Plant deleted');
    };

    /* -------- Icon grid helper -------- */
    function populateIconGrid(container){
      const icons=['🛏️','🛋️','🍽️','🚿','🧺','🧑‍🍳','🖥️','🎮','📚','🧸','🚪','🌿','🔥','❄️','☕','🎧'];
      container.innerHTML='';
      icons.forEach(ic=>{
        const d=document.createElement('div'); d.className='iconPick'; d.textContent=ic;
        d.onclick=()=>{ for(const el of container.querySelectorAll('.iconPick')) el.classList.remove('selected'); d.classList.add('selected'); container.dataset.icon=ic; };
        container.append(d);
      });
    }

    /* -------- Rooms (unique names) -------- */
    $('#btnAddRoom').onclick = ()=>{ populateIconGrid(iconGrid); addRoomForm.reset(); addRoomDialog.showModal(); };
    $('#btnEditRoom').onclick = ()=>{ populateIconGrid(iconGridEdit); editRoomDialog.showModal(); };
    $('#btnRemoveRoom').onclick = ()=> removeRoomDialog.showModal();
    addRoomCancel.onclick = ()=> addRoomDialog.close();
    editRoomCancel.onclick = ()=> editRoomDialog.close();
    $('#removeRoomCancel').onclick = ()=> removeRoomDialog.close();

    addRoomForm.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd=new FormData(addRoomForm);
      const name=(fd.get('roomName')||'').toString().trim();
      const icon=iconGrid.querySelector('.iconPick.selected')?.textContent || '🏷️';
      if(!name) return;

      // Unique (case-insensitive)
      const exists = rooms.some(r => r.name.toLowerCase() === name.toLowerCase());
      if (exists){ showToast('Room name already exists'); return; }

      await addDoc(collection(db,'users',auth.currentUser.uid,'rooms'),{ name, icon });
      addRoomDialog.close();
      showToast('Room added');
    });

    editRoomForm.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd=new FormData(editRoomForm);
      const oldName=fd.get('roomToEdit');
      const newName=(fd.get('newRoomName')||'').toString().trim();
      const newIcon=iconGridEdit.querySelector('.iconPick.selected')?.textContent;

      const roomDoc=rooms.find(r=>r.name===oldName); if(!roomDoc) return;

      // If changing name, validate uniqueness (case-insensitive)
      if (newName && rooms.some(r => r.id!==roomDoc.id && r.name.toLowerCase() === newName.toLowerCase())){
        showToast('Room name already exists');
        return;
      }

      const patch={}; if(newName) patch.name=newName; if(newIcon) patch.icon=newIcon;
      if(Object.keys(patch).length) await updateDoc(doc(db,'users',auth.currentUser.uid,'rooms',roomDoc.id),patch);

      if(newName && newName!==oldName){
        for(const p of plants.filter(p=>p.location===oldName)){
          await updateDoc(doc(db,'users',auth.currentUser.uid,'plants',p.id),{ location:newName });
        }
      }
      editRoomDialog.close();
      showToast('Room updated');
    });

    removeRoomForm.addEventListener('submit', async e=>{
      e.preventDefault();
      const name=new FormData(removeRoomForm).get('roomToRemove');
      const roomDoc=rooms.find(r=>r.name===name); if(!roomDoc) return;
      await deleteDoc(doc(db,'users',auth.currentUser.uid,'rooms',roomDoc.id));
      for(const p of plants.filter(p=>p.location===name)){
        await updateDoc(doc(db,'users',auth.currentUser.uid,'plants',p.id),{ location:'Unassigned' });
      }
      removeRoomDialog.close();
      showToast('Room removed');
    });

    /* -------- Plants -------- */
    $('#btnAddPlant').onclick = ()=>openAdd();
    $('#btnEditPlant').onclick = ()=>editPlantChooser.showModal();
    $('#btnRemovePlant').onclick = ()=>removePlantDialog.showModal();
    editPlantCancel.onclick = ()=>editPlantChooser.close();
    $('#removePlantCancel').onclick = ()=>removePlantDialog.close();

    function openAdd(){
      plantDialogTitle.textContent='Add plant';
      deletePlantBtn.style.display='none';
      plantForm.reset(); renderRoomOptions(); delete plantForm.dataset.editing; plantDialog.showModal();
    }
    function openEdit(id){
      const p=plants.find(x=>x.id===id); if(!p) return;
      plantDialogTitle.textContent='Edit plant';
      deletePlantBtn.style.display='inline-block';
      plantForm.reset(); renderRoomOptions();
      plantForm.querySelector('[name="name"]').value=p.name;
      plantForm.querySelector('[name="nickname"]').value=p.nickname;
      plantForm.querySelector('[name="plantType"]').value=p.plantType;
      plantForm.querySelector('[name="location"]').value=p.location;
      plantForm.querySelector('[name="potSize"]').value=p.potSize;
      plantForm.querySelector('[name="lightLevel"]').value=p.lightLevel;
      plantForm.querySelector('[name="scheduleMode"]').value=p.scheduleMode;
      plantForm.querySelector('[name="customIntervalDays"]').value=p.customIntervalDays;
      plantForm.dataset.editing=id;
      plantDialog.showModal();
    }
    deletePlantBtn.onclick = async ()=>{ const id=plantForm.dataset.editing; if(!id) return; await deleteDoc(doc(db,'users',auth.currentUser.uid,'plants',id)); plantDialog.close(); showToast('Plant deleted'); };
    editPlantChooserForm.addEventListener('submit', e=>{ e.preventDefault(); const id=new FormData(editPlantChooserForm).get('plantToEdit'); if(id){ editPlantChooser.close(); openEdit(id);} });
    removePlantForm.addEventListener('submit', async e=>{ e.preventDefault(); const id=new FormData(removePlantForm).get('plantToRemove'); if(!id) return; await deleteDoc(doc(db,'users',auth.currentUser.uid,'plants',id)); removePlantDialog.close(); showToast('Plant removed'); });
    cancelBtn.onclick = ()=>{ plantForm.reset(); delete plantForm.dataset.editing; plantDialog.close(); };

    plantForm.addEventListener('submit', async e=>{
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

      if(editing){
        const patch={
          name: fd.get('name'),
          nickname: fd.get('nickname')||'',
          plantType: fd.get('plantType')||'',
          location: fd.get('location')||'Unassigned',
          potSize: Number(fd.get('potSize')||15),
          lightLevel: fd.get('lightLevel')||'medium',
          scheduleMode: fd.get('scheduleMode')||'suggested',
          customIntervalDays: Number(fd.get('customIntervalDays')||10),
          updatedAt: new Date().toISOString()
        };
        if(photoUrl) patch.photoUrl=photoUrl;
        await updateDoc(doc(db,'users',auth.currentUser.uid,'plants',editing), patch);
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
          lastWateredUtc: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setNextDue(p);
        await addDoc(collection(db,'users',auth.currentUser.uid,'plants'), p);
        showToast('Plant added');
      }
      plantDialog.close();
    });

    /* -------- Toast -------- */
    function showToast(msg='Saved'){ toastMsg.textContent=msg; toastDialog.showModal(); }
    toastOk.onclick = ()=> toastDialog.close();

  })();
})();

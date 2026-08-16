/* RamoXN - application complète
 * Google Drive + Gmail + PDF
 * Refonte complète : synchronisation sûre, PDF, attestations et e-mail.
 */
(() => {
  'use strict';

  const STORE = 'ramoxn_local_v2';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
  const GOOGLE_SCOPES = `${DRIVE_SCOPE} ${GMAIL_SCOPE}`;
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

  let db = loadLocal();
  let lines = [];
  let tokenClient = null;
  let accessToken = null;
  let folderId = null;
  let dataFileId = null;
  let busy = false;

  function defaultDb() {
    return { clients: {}, lots: {}, invoices: [], next: 1, settings: { clientId: '' } };
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return defaultDb();
      return normalizeDb(JSON.parse(raw));
    } catch (e) {
      console.error('Lecture locale impossible', e);
      return defaultDb();
    }
  }

  function normalizeDb(x) {
    x = x && typeof x === 'object' ? x : {};
    x.clients = x.clients && typeof x.clients === 'object' ? x.clients : {};
    x.lots = x.lots && typeof x.lots === 'object' ? x.lots : {};
    x.invoices = Array.isArray(x.invoices) ? x.invoices : [];
    x.settings = x.settings && typeof x.settings === 'object' ? x.settings : {};
    x.settings.clientId = typeof x.settings.clientId === 'string' && x.settings.clientId.includes('.apps.googleusercontent.com')
      ? x.settings.clientId : '';
    x.invoices = x.invoices.map(normalizeInvoice);
    const max = x.invoices.reduce((m, i) => Math.max(m, invoiceSequence(i.number)), 0);
    x.next = Math.max(Number(x.next) || 1, max + 1);
    return x;
  }

  function normalizeInvoice(x) {
    x = x && typeof x === 'object' ? x : {};
    x.number = String(x.number || '');
    x.date = String(x.date || today());
    x.client = String(x.client || '');
    x.clientInfo = x.clientInfo || {};
    x.lot = String(x.lot || '');
    x.lotInfo = x.lotInfo || {};
    x.payment = String(x.payment || 'Virement');
    x.type = String(x.type || 'Ramonage cheminée bois');
    x.lines = Array.isArray(x.lines) ? x.lines : [];
    x.total = Number(x.total) || x.lines.reduce((s, a) => s + Number(a.prix || 0), 0);
    x.status = x.status === 'Payée' ? 'Payée' : 'Non payée';
    if (!x.driveFiles || typeof x.driveFiles !== 'object' || Array.isArray(x.driveFiles)) {
      const old = Array.isArray(x.driveFiles) ? x.driveFiles : [];
      x.driveFiles = { invoice: old[0] || null, attestations: {} };
      x.lines.forEach((a, i) => { if (old[i + 1]) x.driveFiles.attestations[a.app || String(i)] = old[i + 1]; });
    }
    x.driveFiles.attestations = x.driveFiles.attestations || {};
    x.mailSent = !!x.mailSent;
    x.mailId = x.mailId || null;
    return x;
  }

  function invoiceSequence(number) {
    const m = String(number || '').match(/-(\d+)$/);
    return m ? Number(m[1]) : 0;
  }

  function persist(renderIt = true) {
    localStorage.setItem(STORE, JSON.stringify(db));
    if (renderIt) render();
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function eur(n) { return Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m])); }
  function safe(s) { return String(s ?? '').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'document'; }
  function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function toastMessage(t, ms = 3500) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = t; el.style.display = 'block';
    clearTimeout(toastMessage.timer);
    toastMessage.timer = setTimeout(() => el.style.display = 'none', ms);
  }

  window.menu = () => document.getElementById('nav')?.classList.toggle('open');
  window.page = id => {
    document.querySelectorAll('.pg').forEach(x => x.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    document.getElementById('nav')?.classList.remove('open');
    render();
  };

  // ---------------- Clients / lotissements ----------------
  window.resetClient = () => { document.getElementById('clientForm')?.reset(); document.getElementById('oldClient').value = ''; };
  window.editClient = n => {
    const x = db.clients[n]; if (!x) return;
    oldClient.value = n; cNom.value = n; cRue.value = x.rue || ''; cVille.value = x.ville || '';
    cTel.value = x.telephone || ''; cEmail.value = x.email || ''; page('clients');
  };
  window.delClient = n => { if (confirm(`Supprimer le client « ${n} » ?`)) { delete db.clients[n]; persist(); toastMessage('Client supprimé'); } };
  clientForm.onsubmit = e => {
    e.preventDefault();
    const old = oldClient.value, n = cNom.value.trim();
    if (!n) return;
    if (old && old !== n) delete db.clients[old];
    db.clients[n] = { rue:cRue.value.trim(), ville:cVille.value.trim(), telephone:cTel.value.trim(), email:cEmail.value.trim() };
    persist(); toastMessage('Client enregistré');
    if (accessToken) syncNow(false).catch(console.error);
  };

  window.resetLot = () => { document.getElementById('lotForm')?.reset(); document.getElementById('oldLot').value = ''; };
  window.editLot = n => {
    const x = db.lots[n]; if (!x) return;
    oldLot.value = n; lNom.value = n; lRue.value = x.rue || ''; lVille.value = x.ville || ''; page('lots');
  };
  window.delLot = n => { if (confirm(`Supprimer le lotissement « ${n} » ?`)) { delete db.lots[n]; persist(); toastMessage('Lotissement supprimé'); } };
  lotForm.onsubmit = e => {
    e.preventDefault();
    const old = oldLot.value, n = lNom.value.trim(); if (!n) return;
    if (old && old !== n) delete db.lots[old];
    db.lots[n] = { rue:lRue.value.trim(), ville:lVille.value.trim() };
    persist(); toastMessage('Lotissement enregistré');
    if (accessToken) syncNow(false).catch(console.error);
  };

  function fillSelects() {
    const c = rClient.value, l = rLot.value;
    rClient.innerHTML = '<option value="">— Sélectionner —</option>' + Object.keys(db.clients).sort().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    rLot.innerHTML = '<option value="">— Sélectionner —</option>' + Object.keys(db.lots).sort().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    rClient.value = c; rLot.value = l;
  }

  rClient.onchange = () => {
    const c = db.clients[rClient.value];
    if (c && !rLot.value) {
      const z = Object.entries(db.lots).find(([, x]) => x.rue === c.rue && x.ville === c.ville);
      if (z) rLot.value = z[0];
    }
  };

  window.useClientName = () => { sNom.value = rClient.value || ''; };
  window.addLine = () => {
    const nom=sNom.value.trim(), app=sApp.value.trim(), type=sType.value.trim(), prix=sPrix.value;
    if (!nom || !app || !type || prix === '') { toastMessage('Remplis les 4 champs'); return; }
    lines.push({ nom, app, type, prix:Number(prix) });
    sNom.value=sApp.value=sType.value=sPrix.value=''; renderLines();
  };
  window.removeLine = i => { lines.splice(i,1); renderLines(); };
  function renderLines() {
    linesDiv.innerHTML = lines.map((x,i) => `<div class="line"><span>${esc(x.nom)}</span><span>${esc(x.app)}</span><span>${esc(x.type)}</span><span>${eur(x.prix)}</span><button type="button" onclick="removeLine(${i})">✕</button></div>`).join('');
    total.textContent = eur(lines.reduce((s,x)=>s+Number(x.prix||0),0));
  }
  window.resetNew = () => {
    lines=[]; rClient.value=''; rLot.value=''; rDate.value=today(); rPay.value='Virement'; rNum.value=nextInvoiceNumber(); rType.value='Ramonage cheminée bois'; renderLines(); render();
  };

  function nextInvoiceNumber() {
    const d = new Date(); const mm=String(d.getMonth()+1).padStart(2,'0'); const yy=String(d.getFullYear()).slice(-2);
    return `${mm}-${yy}-${String(db.next).padStart(3,'0')}`;
  }

  // ---------------- PDF ----------------
  function makePDF(x, kind, apartment = null) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    doc.setFont('helvetica', 'normal');
    let y=18;
    const title = kind === 'facture' ? `FACTURE N° ${x.number}` : 'CERTIFICAT DE RAMONAGE';
    doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text(title,105,y,{align:'center'}); y+=12;
    doc.setFontSize(10); doc.setFont('helvetica','normal');
    const common=[
      'RamoXN','5 Font Bonne','66210 Puyvalador','Tel : 06.18.51.75.64','contact.ramoxn@gmail.com',''
    ];
    const content = kind === 'facture' ? common.concat([
      `Client : ${x.client}`, `${x.clientInfo.rue || ''}, ${x.clientInfo.ville || ''}`, `Date : ${x.date}`,
      `Lotissement : ${x.lot}`, `${x.lotInfo.rue || ''}, ${x.lotInfo.ville || ''}`, '',
      ...x.lines.map(a => `${a.type} — ${a.app} — ${a.nom} : ${eur(a.prix)}`), '',
      `TOTAL TTC : ${eur(x.total)}`, `Mode de règlement : ${x.payment}`,
      'TVA non applicable, art. 293 B du Code général des impôts.'
    ]) : common.concat([
      `Certificat N° : ${x.number}`, `Client : ${apartment?.nom || ''}`, `Appartement : ${apartment?.app || ''}`,
      `Adresse : ${x.lotInfo.rue || ''}, ${x.lotInfo.ville || ''}`, `Date : ${x.date}`, `Nature du conduit : ${apartment?.type || x.type}`,'',
      'Je soussigné, ICKX Nicolaï, déclare avoir effectué le ramonage du conduit indiqué ci-dessus.', '',
      'Le ramonage a été réalisé conformément aux règles de sécurité et aux dispositions applicables.',
      'La présente attestation est délivrée pour servir et valoir ce que de droit.', '', `Fait à Puyvalador, le ${x.date}`, 'ICKX Nicolaï'
    ]);
    for (const t of content) {
      const arr=doc.splitTextToSize(String(t),175);
      if (y + arr.length*5 > 280) { doc.addPage(); y=18; }
      doc.text(arr,18,y); y += arr.length*5;
    }
    return doc.output('blob');
  }

  function downloadBlob(filename, blob) {
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  }
  window.downloadInvoice = i => {
    const x=db.invoices[i]; if(!x) return;
    downloadBlob(`Facture_${safe(x.number)}.pdf`, makePDF(x,'facture'));
    x.lines.forEach(a=>downloadBlob(`Attestation_${safe(x.number)}_${safe(a.app)}.pdf`,makePDF(x,'attestation',a)));
  };

  // ---------------- Google Drive ----------------
  async function googleFetch(url, options={}) {
    if(!accessToken) throw new Error('Google n’est pas connecté.');
    const headers={...(options.headers||{}), Authorization:`Bearer ${accessToken}`};
    const r=await fetch(url,{...options,headers});
    if(!r.ok){ let text=''; try{text=await r.text();}catch{}; throw new Error(`Google ${r.status}: ${text || r.statusText}`); }
    return r;
  }

  async function ensureDriveFolder() {
    if(folderId) return folderId;
    const q=encodeURIComponent("name='RamoXN' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const data=await googleFetch(`${DRIVE_API}/files?q=${q}&spaces=drive&fields=files(id,name,createdTime)&orderBy=createdTime`).then(r=>r.json());
    if(data.files?.length){ folderId=data.files[0].id; return folderId; }
    const created=await googleFetch(`${DRIVE_API}/files`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'RamoXN',mimeType:'application/vnd.google-apps.folder'})}).then(r=>r.json());
    folderId=created.id; return folderId;
  }

  async function findDataFile() {
    await ensureDriveFolder();
    const q=encodeURIComponent(`'${folderId}' in parents and name='RamoXN_data.json' and trashed=false`);
    const data=await googleFetch(`${DRIVE_API}/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`).then(r=>r.json());
    dataFileId=data.files?.[0]?.id || null; return dataFileId;
  }

  async function downloadDriveJson() {
    await findDataFile();
    if(!dataFileId) return null;
    return googleFetch(`${DRIVE_API}/files/${dataFileId}?alt=media`).then(r=>r.json());
  }

  function mergeDb(remote, local) {
    remote=normalizeDb(remote || defaultDb()); local=normalizeDb(local || defaultDb());
    const merged=defaultDb();
    merged.clients={...remote.clients,...local.clients};
    merged.lots={...remote.lots,...local.lots};
    const map=new Map();
    remote.invoices.forEach(x=>map.set(x.number,normalizeInvoice(x)));
    local.invoices.forEach(x=>{
      const old=map.get(x.number);
      if(!old) map.set(x.number,normalizeInvoice(x));
      else map.set(x.number, normalizeInvoice({...old,...x,driveFiles:{...old.driveFiles,...x.driveFiles,attestations:{...old.driveFiles.attestations,...x.driveFiles.attestations}},mailSent:old.mailSent||x.mailSent,mailId:x.mailId||old.mailId}));
    });
    merged.invoices=Array.from(map.values()).sort((a,b)=>String(a.number).localeCompare(String(b.number)));
    merged.next=Math.max(remote.next||1,local.next||1,merged.invoices.reduce((m,x)=>Math.max(m,invoiceSequence(x.number)+1),1));
    merged.settings={...remote.settings,...local.settings};
    if(!merged.settings.clientId) merged.settings.clientId='';
    return merged;
  }

  function multipartBody(metadata, blob, mime) {
    const boundary='----RamoXNBoundary'+Date.now()+Math.random().toString(16).slice(2);
    const body=new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob,
      `\r\n--${boundary}--`
    ]);
    return {body,boundary};
  }

  async function driveUpload(name, blob, mime, existingId=null) {
    await ensureDriveFolder();
    const metadata={name,mimeType:mime};
    if(!existingId) metadata.parents=[folderId];
    const {body,boundary}=multipartBody(metadata,blob,mime);
    const url=existingId ? `${DRIVE_API}/files/${existingId}?uploadType=multipart` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    return googleFetch(url,{method:existingId?'PATCH':'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body}).then(r=>r.json());
  }

  async function syncNow(show=true) {
    if(!accessToken) throw new Error('Connecte Google avant de synchroniser.');
    await ensureDriveFolder();
    const remote=await downloadDriveJson();
    if(remote) db=mergeDb(remote,db);
    persist(false);
    const uploaded=await driveUpload('RamoXN_data.json',new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),'application/json',dataFileId);
    dataFileId=uploaded.id || dataFileId;
    persist(false); render();
    if(show) toastMessage('Données synchronisées dans Google Drive');
  }

  async function uploadInvoiceFiles(x) {
    await ensureDriveFolder();
    x.driveFiles=x.driveFiles || {invoice:null,attestations:{}};
    const invoiceBlob=makePDF(x,'facture');
    const invoiceFile=await driveUpload(`Facture_${x.number}.pdf`,invoiceBlob,'application/pdf',x.driveFiles.invoice || null);
    x.driveFiles.invoice=invoiceFile.id;
    for(const a of x.lines){
      const key=String(a.app || a.nom);
      const attBlob=makePDF(x,'attestation',a);
      const oldId=x.driveFiles.attestations[key] || null;
      const f=await driveUpload(`Attestation_${x.number}_${safe(a.app)}.pdf`,attBlob,'application/pdf',oldId);
      x.driveFiles.attestations[key]=f.id;
    }
    persist(false);
    return x;
  }

  // ---------------- Gmail ----------------
  function bytesToBase64(bytes) {
    let binary=''; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
    return btoa(binary);
  }
  function base64UrlFromBytes(bytes) { return bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  async function blobBase64Url(blob) { return base64UrlFromBytes(new Uint8Array(await blob.arrayBuffer())); }
  function headerSafe(s){return String(s).replace(/[\r\n]/g,' ');}

  async function sendInvoiceEmail(x,to) {
    if(!to) throw new Error('Adresse e-mail client absente.');
    const boundary='RamoXN_MIXED_'+Date.now();
    const attachments=[];
    attachments.push({name:`Facture_${x.number}.pdf`,data:await blobBase64Url(makePDF(x,'facture'))});
    for(const a of x.lines) attachments.push({name:`Attestation_${x.number}_${safe(a.app)}.pdf`,data:await blobBase64Url(makePDF(x,'attestation',a))});
    const parts=[
      `From: me`,`To: ${headerSafe(to)}`,`Subject: RamoXN - Facture ${headerSafe(x.number)}`,
      'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',
      `--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',
      `Bonjour,\r\n\r\nVeuillez trouver en pièces jointes votre facture ${x.number} ainsi que votre/vos attestation(s) de ramonage.\r\n\r\nCordialement,\r\nRamoXN`
    ];
    for(const a of attachments){
      parts.push(`--${boundary}`,`Content-Type: application/pdf; name="${a.name}"`,`Content-Disposition: attachment; filename="${a.name}"`,'Content-Transfer-Encoding: base64','',a.data);
    }
    parts.push(`--${boundary}--`);
    const raw=base64UrlFromBytes(new TextEncoder().encode(parts.join('\r\n')));
    const response=await googleFetch(`${GMAIL_API}/users/me/messages/send`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw})}).then(r=>r.json());
    if(!response.id) throw new Error('Gmail n’a pas retourné d’identifiant de message.');
    x.mailSent=true; x.mailId=response.id; return response.id;
  }

  // ---------------- Création facture ----------------
  window.createInvoice = async () => {
    if(busy) return;
    if(!rClient.value || !rLot.value || !rDate.value || !lines.length){ toastMessage('Client, lotissement, date et au moins une ligne sont requis'); return; }
    const client=db.clients[rClient.value], lot=db.lots[rLot.value];
    if(!client || !lot){ toastMessage('Client ou lotissement introuvable'); return; }
    const number=nextInvoiceNumber();
    const x=normalizeInvoice({
      number,date:rDate.value,client:rClient.value,clientInfo:{...client},lot:rLot.value,lotInfo:{...lot},
      payment:rPay.value,type:rType.value,lines:structuredClone(lines),total:lines.reduce((s,a)=>s+Number(a.prix||0),0),
      status:['Espèce','Carte bancaire'].includes(rPay.value)?'Payée':'Non payée',driveFiles:{invoice:null,attestations:{}},mailSent:false
    });
    db.invoices.push(x); db.next=Math.max(db.next,invoiceSequence(number)+1); persist(false); render();
    // Une facture est toujours téléchargée localement, même si Google échoue.
    downloadInvoice(db.invoices.length-1);
    busy=true; toastMessage('Création des PDF et synchronisation…',10000);
    try {
      if(!accessToken){
        persist(); toastMessage('Facture créée. Connecte Google pour Drive et l’e-mail.');
        return;
      }
      await ensureDriveFolder();
      await uploadInvoiceFiles(x); persist(false);
      await syncNow(false);
      if(client.email){
        await sendInvoiceEmail(x,client.email);
        persist(false);
        await syncNow(false);
        toastMessage(`Facture ${x.number} créée, PDF enregistrés et e-mail envoyé.`);
      } else {
        toastMessage(`Facture ${x.number} créée et PDF enregistrés. Aucun e-mail client.`);
      }
      persist();
    } catch(e) {
      console.error(e);
      persist();
      toastMessage(`Facture créée mais opération Google incomplète : ${e.message}`,8000);
    } finally {
      busy=false; resetNew(); page('invoices');
    }
  };

  window.sendExisting = async i => {
    const x=db.invoices[i]; if(!x) return;
    if(!accessToken){toastMessage('Connecte Google d’abord');return;}
    const email=x.clientInfo?.email || db.clients[x.client]?.email;
    if(!email){toastMessage('Ce client n’a pas d’e-mail');return;}
    try{
      await uploadInvoiceFiles(x); persist(false); await syncNow(false);
      await sendInvoiceEmail(x,email); persist(false); await syncNow(false); persist();
      toastMessage('PDF enregistrés et e-mail envoyé');
    }catch(e){console.error(e);persist();toastMessage('Erreur : '+e.message,7000);}
  };

  window.togglePaid = async i => {
    if(!db.invoices[i]) return;
    db.invoices[i].status=db.invoices[i].status==='Payée'?'Non payée':'Payée'; persist();
    if(accessToken) syncNow(false).catch(e=>toastMessage('Synchronisation impossible : '+e.message));
  };

  // ---------------- OAuth ----------------
  window.saveClientId = () => {
    const id=clientId.value.trim();
    if(!/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(id)){ toastMessage('Le Client ID doit ressembler à 123456789-xxxxx.apps.googleusercontent.com'); return; }
    db.settings.clientId=id; persist(); toastMessage('Client ID enregistré');
  };

  window.connectGoogle = () => {
    const id=(db.settings.clientId || clientId.value || '').trim();
    if(!/\.apps\.googleusercontent\.com$/i.test(id)){toastMessage('Entre d’abord le Client ID OAuth Web dans Paramètres');page('settings');return;}
    if(!window.google?.accounts?.oauth2){toastMessage('Google n’est pas encore chargé. Attends quelques secondes puis réessaie.');return;}
    tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:id, scope:GOOGLE_SCOPES,
      callback: async resp => {
        if(resp.error){console.error(resp);toastMessage('Connexion Google refusée : '+resp.error);return;}
        accessToken=resp.access_token; render(); toastMessage('Google connecté, lecture de Drive…',5000);
        try{
          await ensureDriveFolder();
          const remote=await downloadDriveJson();
          if(remote){ db=mergeDb(remote,db); persist(false); toastMessage(`${db.invoices.length} facture(s) récupérée(s) depuis Drive`,3000); }
          await syncNow(false);
          render(); toastMessage('🟢 Google Drive + Gmail connectés');
        }catch(e){console.error(e);render();toastMessage('Google connecté mais Drive est inaccessible : '+e.message,8000);}
      }
    });
    tokenClient.requestAccessToken({prompt:'consent'});
  };

  window.disconnectGoogle = () => { accessToken=null;folderId=null;dataFileId=null;render();toastMessage('Google déconnecté'); };

  window.restoreFromDrive = async () => {
    if(!accessToken){toastMessage('Connecte Google d’abord');return;}
    try{
      const remote=await downloadDriveJson();
      if(!remote){toastMessage('Aucun RamoXN_data.json trouvé dans le dossier RamoXN');return;}
      db=normalizeDb(remote); persist(); toastMessage(`${db.invoices.length} facture(s) restaurée(s) depuis Drive`);
    }catch(e){toastMessage('Erreur de restauration : '+e.message,7000);}
  };

  // ---------------- Backup local ----------------
  window.exportBackup = () => downloadBlob('RamoXN_sauvegarde.json',new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));
  window.importBackup = e => {
    const f=e.target.files?.[0]; if(!f)return;
    const reader=new FileReader(); reader.onload=()=>{try{db=normalizeDb(JSON.parse(reader.result));persist();toastMessage('Sauvegarde importée');}catch(err){toastMessage('Fichier JSON invalide');}}; reader.readAsText(f);
    e.target.value='';
  };

  // ---------------- Affichage ----------------
  function render(){
    const nC=document.getElementById('nClients'), nL=document.getElementById('nLots'), nI=document.getElementById('nInvoices'), nD=document.getElementById('nDue');
    if(nC)nC.textContent=Object.keys(db.clients).length; if(nL)nL.textContent=Object.keys(db.lots).length; if(nI)nI.textContent=db.invoices.length; if(nD)nD.textContent=db.invoices.filter(x=>x.status!=='Payée').length;
    const cl=document.getElementById('clientList');
    if(cl)cl.innerHTML=Object.entries(db.clients).sort().map(([n,x])=>`<div class="item"><b>${esc(n)}</b><br>${esc(x.rue)}, ${esc(x.ville)}<br>${esc(x.telephone)} · ${esc(x.email)}<div class="actions"><button onclick="editClient('${q(n)}')">Modifier</button><button onclick="delClient('${q(n)}')">Supprimer</button></div></div>`).join('')||'<p class="muted">Aucun client.</p>';
    const ll=document.getElementById('lotList');
    if(ll)ll.innerHTML=Object.entries(db.lots).sort().map(([n,x])=>`<div class="item"><b>${esc(n)}</b><br>${esc(x.rue)}, ${esc(x.ville)}<div class="actions"><button onclick="editLot('${q(n)}')">Modifier</button><button onclick="delLot('${q(n)}')">Supprimer</button></div></div>`).join('')||'<p class="muted">Aucun lotissement.</p>';
    fillSelects();
    if(document.activeElement!==rNum) rNum.value=nextInvoiceNumber();
    if(!rDate.value)rDate.value=today();
    renderLines();
    const list=document.getElementById('invoiceList');
    if(list){const invs=db.invoices;list.innerHTML=invs.slice().reverse().map((x,k)=>{const i=invs.length-1-k;return `<tr><td>${esc(x.number)}</td><td>${esc(x.date)}</td><td>${esc(x.client)}</td><td>${eur(x.total)}</td><td class="${x.status==='Payée'?'paid':'due'}">${esc(x.status)}</td><td><button onclick="downloadInvoice(${i})">PDF</button> <button onclick="sendExisting(${i})">✉️</button> <button onclick="togglePaid(${i})">${x.status==='Payée'?'Non payée':'Payée'}</button></td></tr>`}).join('')||'<tr><td colspan="6">Aucune facture enregistrée.</td></tr>';}
    if(clientId)clientId.value=db.settings.clientId||'';
    if(status)status.textContent=accessToken?'🟢 Google Drive + Gmail connectés.':'🔴 Google non connecté.';
    if(cloudText)cloudText.textContent=accessToken?'Google Drive + Gmail connectés':'Google Drive non connecté';
    const dot=document.getElementById('cloudDot'); if(dot)dot.style.color=accessToken?'#16a34a':'#dc2626';
  }

  // Restauration de la base fournie avec le projet si aucune base locale n'existe.
  (function bootstrap(){
    try{
      if(!localStorage.getItem(STORE)){
        // Le JSON inclus dans le dépôt n'est qu'une base de départ. Google Drive reste la source de synchronisation.
        fetch('RamoXN_data.json').then(r=>r.ok?r.json():null).then(seed=>{if(seed && db.invoices.length===0){db=normalizeDb(seed);persist();}}).catch(()=>{});
      }
    }catch(e){}
    render();
  })();
})();

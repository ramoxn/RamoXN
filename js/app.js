/* RamoXN - application logic
 * Version corrigée : Google Drive/Gmail + factures/PDF/attestations.
 */
const STORE = "ramoxn_gdrive_v2";
// Full Drive access is required to read/update an existing RamoXN folder/file.
// After changing this scope, Google must be authorized again.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GOOGLE_SCOPES = `${DRIVE_SCOPE} ${GMAIL_SCOPE}`;

let db = loadLocalDB();
let lines = [];
let tokenClient = null;
let accessToken = null;
let folderId = null;
let dataFileId = null;
let syncing = false;

function defaultDB() {
  return { clients: {}, lots: {}, invoices: [], next: 1, settings: { clientId: "" } };
}

function normalizeDB(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  d.clients = d.clients && typeof d.clients === "object" ? d.clients : {};
  d.lots = d.lots && typeof d.lots === "object" ? d.lots : {};
  d.invoices = Array.isArray(d.invoices) ? d.invoices : [];
  d.settings = d.settings && typeof d.settings === "object" ? d.settings : {};
  d.settings.clientId = d.settings.clientId || "";

  const nums = d.invoices
    .map(x => String(x?.number || "").match(/-(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number);
  const maxNumber = nums.length ? Math.max(...nums) : 0;
  d.next = Math.max(Number(d.next) || 1, maxNumber + 1);

  d.invoices.forEach(x => {
    x.driveFiles = Array.isArray(x.driveFiles) ? x.driveFiles : [];
    x.mailSent = !!x.mailSent;
  });
  return d;
}

function loadLocalDB() {
  try { return normalizeDB(JSON.parse(localStorage.getItem(STORE) || "null")); }
  catch { return defaultDB(); }
}

function save(renderUI = true) {
  db = normalizeDB(db);
  localStorage.setItem(STORE, JSON.stringify(db));
  if (renderUI) render();
}

function page(id) {
  document.querySelectorAll(".pg").forEach(x => x.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");
  if (typeof nav !== "undefined" && nav) nav.classList.remove("open");
  render();
}
function menu() { if (typeof nav !== "undefined" && nav) nav.classList.toggle("open"); }
function eur(n) { return Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }
function q(s) { return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function safe(s) { return String(s || "").replace(/[^a-z0-9_-]+/gi, "_"); }
function msg(t) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.textContent = t;
  box.style.display = "block";
  clearTimeout(msg._timer);
  msg._timer = setTimeout(() => box.style.display = "none", 3500);
}
function today() { return new Date().toISOString().slice(0, 10); }
function invNo() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = String(d.getFullYear()).slice(-2);
  return `${m}-${y}-${String(db.next).padStart(3, "0")}`;
}

// ---------- Clients ----------
clientForm.onsubmit = e => {
  e.preventDefault();
  const old = oldClient.value;
  const n = cNom.value.trim();
  if (!n) return msg("Le nom du client est obligatoire");
  if (old && old !== n) delete db.clients[old];
  db.clients[n] = { rue: cRue.value.trim(), ville: cVille.value.trim(), telephone: cTel.value.trim(), email: cEmail.value.trim() };
  resetClient();
  save();
  msg("Client enregistré");
  syncAfterChange();
};
function resetClient() { clientForm.reset(); oldClient.value = ""; }
function editClient(n) {
  const x = db.clients[n]; if (!x) return;
  oldClient.value = n; cNom.value = n; cRue.value = x.rue || ""; cVille.value = x.ville || ""; cTel.value = x.telephone || ""; cEmail.value = x.email || "";
  page("clients");
}
function delClient(n) { if (confirm("Supprimer ce client ?")) { delete db.clients[n]; save(); syncAfterChange(); } }

// ---------- Lotissements ----------
lotForm.onsubmit = e => {
  e.preventDefault();
  const old = oldLot.value;
  const n = lNom.value.trim();
  if (!n) return msg("Le nom du lotissement est obligatoire");
  if (old && old !== n) delete db.lots[old];
  db.lots[n] = { rue: lRue.value.trim(), ville: lVille.value.trim() };
  resetLot();
  save();
  msg("Lotissement enregistré");
  syncAfterChange();
};
function resetLot() { lotForm.reset(); oldLot.value = ""; }
function editLot(n) {
  const x = db.lots[n]; if (!x) return;
  oldLot.value = n; lNom.value = n; lRue.value = x.rue || ""; lVille.value = x.ville || "";
  page("lots");
}
function delLot(n) { if (confirm("Supprimer ce lotissement ?")) { delete db.lots[n]; save(); syncAfterChange(); } }

function fill() {
  const c = rClient.value, l = rLot.value;
  rClient.innerHTML = '<option value="">— Sélectionner —</option>' + Object.keys(db.clients).map(x => `<option>${esc(x)}</option>`).join("");
  rLot.innerHTML = '<option value="">— Sélectionner —</option>' + Object.keys(db.lots).map(x => `<option>${esc(x)}</option>`).join("");
  rClient.value = c; rLot.value = l;
}
rClient.onchange = () => {
  const c = db.clients[rClient.value];
  if (c && !rLot.value) {
    const z = Object.entries(db.lots).find(([, x]) => x.rue === c.rue && x.ville === c.ville);
    if (z) rLot.value = z[0];
  }
};
function useClientName() { sNom.value = rClient.value || ""; }
function addLine() {
  if (!sNom.value.trim() || !sApp.value.trim() || !sType.value.trim() || !sPrix.value) return msg("Remplis les 4 champs");
  lines.push({ nom: sNom.value.trim(), app: sApp.value.trim(), type: sType.value.trim(), prix: Number(sPrix.value) });
  sNom.value = sApp.value = sType.value = sPrix.value = "";
  renderLines();
}
function removeLine(i) { lines.splice(i, 1); renderLines(); }
function renderLines() {
  linesDiv.innerHTML = lines.map((x, i) => `<div class="line"><span>${esc(x.nom)}</span><span>${esc(x.app)}</span><span>${esc(x.type)}</span><span>${eur(x.prix)}</span><button onclick="removeLine(${i})">✕</button></div>`).join("");
  total.textContent = eur(lines.reduce((a, x) => a + Number(x.prix || 0), 0));
}
function resetNew() {
  lines = [];
  rClient.value = rLot.value = "";
  rDate.value = today();
  rPay.value = "Virement";
  rType.value = "Ramonage cheminée bois";
  renderLines();
  render();
}

// ---------- PDF ----------
function makePDF(x, type, a = null) {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) throw new Error("jsPDF n'est pas chargé");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica");
  doc.setFontSize(16); doc.setFont(undefined, "bold");
  let y = 18;
  doc.text(type === "facture" ? "FACTURE N° " + x.number : "CERTIFICAT DE RAMONAGE", 105, y, { align: "center" });
  y += 12; doc.setFontSize(10); doc.setFont(undefined, "normal");
  const lines0 = type === "facture" ? [
    "RamoXN", "5 Font Bonne", "66210 Puyvalador", "Tel : 06.18.51.75.64", "contact.ramoxn@gmail.com", "",
    "Client : " + x.client, `${x.clientInfo?.rue || ""}, ${x.clientInfo?.ville || ""}`, "Date : " + x.date,
    `Lieu : ${x.lot} — ${x.lotInfo?.rue || ""}, ${x.lotInfo?.ville || ""}`, "",
    ...x.lines.map(z => `${z.type} — ${z.app} — ${z.nom} : ${eur(z.prix)}`), "", "TOTAL TTC : " + eur(x.total),
    "Mode de règlement : " + x.payment, "TVA non applicable en raison de l'article 293 B du Code général des impôts."
  ] : [
    "RamoXN", "5 Font Bonne — 66210 Puyvalador", "Tel : 06.18.51.75.64 — contact.ramoxn@gmail.com", "",
    "Certificat N° : " + x.number, "Je soussigné, ICKX Nicolaï, déclare avoir effectué le ramonage des conduits de cheminée.",
    "Client : " + a.nom, "Appartement : " + a.app, "Adresse : " + (x.lotInfo?.rue || "") + ", " + (x.lotInfo?.ville || ""),
    "Date : " + x.date, "Nature du conduit : " + a.type, "",
    "Nous certifions que le ramonage a été réalisé conformément aux normes en vigueur et dans le respect des règles de sécurité.",
    "En foi de quoi, nous délivrons la présente attestation pour servir et valoir ce que de droit.", "",
    "Fait à Puyvalador, le " + x.date, "ICKX Nicolaï"
  ];
  for (const t of lines0) {
    const arr = doc.splitTextToSize(String(t), 175);
    if (y + arr.length * 5 > 280) { doc.addPage(); y = 18; }
    doc.text(arr, 18, y); y += arr.length * 5;
  }
  return doc.output("blob");
}
function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function downloadInvoice(i) {
  const x = db.invoices[i]; if (!x) return;
  download(`Facture_${safe(x.number)}.pdf`, makePDF(x, "facture"));
  x.lines.forEach(a => download(`Attestation_${safe(x.number)}_${safe(a.app)}.pdf`, makePDF(x, "attestation", a)));
}

// ---------- Factures ----------
async function createInvoice() {
  if (!rClient.value || !rLot.value || !lines.length) return msg("Client, lotissement et au moins une ligne sont requis");
  const n = invNo(), c = db.clients[rClient.value], l = db.lots[rLot.value];
  const x = {
    number: n, date: rDate.value, client: rClient.value, clientInfo: structuredClone(c), lot: rLot.value, lotInfo: structuredClone(l),
    payment: rPay.value, type: rType.value, lines: structuredClone(lines), total: lines.reduce((a, z) => a + Number(z.prix || 0), 0),
    status: ["Espèce", "Carte bancaire"].includes(rPay.value) ? "Payée" : "Non payée", driveFiles: [], mailSent: false
  };
  db.invoices.push(x); db.next++;
  save(); page("invoices");

  // Sans Google : les PDF restent téléchargeables localement.
  if (!accessToken) {
    msg("Facture enregistrée localement. Connecte Google pour Drive + e-mail.");
    downloadInvoice(db.invoices.length - 1);
    resetNew();
    return;
  }

  try {
    await ensureDriveFolder();
    await findDataFile();

    // 1) Sauvegarde immédiate de la facture dans le JSON.
    await syncNow(false);

    // 2) Génération + upload des PDF.
    await uploadPDFs(x);
    db.invoices[db.invoices.length - 1] = x;
    save(false);
    await syncNow(false);

    // 3) E-mail uniquement après que les PDF sont disponibles.
    if (c.email) {
      await sendInvoiceEmail(x, c.email);
      db.invoices[db.invoices.length - 1] = x;
      save(false);
      await syncNow(false);
      msg("Facture + attestations enregistrées dans Drive et e-mail envoyé.");
    } else {
      msg("PDF enregistrés dans Drive. Aucun e-mail client renseigné.");
    }
  } catch (e) {
    console.error(e);
    // On conserve toujours la facture locale, même si Drive/Gmail échoue.
    db.invoices[db.invoices.length - 1] = x;
    save(false);
    msg("Facture créée, mais une étape Google a échoué : " + friendlyGoogleError(e));
  }
  resetNew(); page("invoices");
}

async function sendExisting(i) {
  if (!accessToken) return msg("Connecte Google d'abord");
  const x = db.invoices[i]; if (!x) return;
  const email = x.clientInfo?.email;
  if (!email) return msg("Ce client n'a pas d'e-mail");
  try {
    await ensureDriveFolder();
    await uploadPDFs(x);
    db.invoices[i] = x; save(false); await syncNow(false);
    await sendInvoiceEmail(x, email);
    db.invoices[i] = x; save(false); await syncNow(false);
    msg("Documents stockés et e-mail envoyé");
  } catch (e) {
    console.error(e); msg("Erreur d'envoi : " + friendlyGoogleError(e));
  }
}

function togglePaid(i) {
  db.invoices[i].status = db.invoices[i].status === "Payée" ? "Non payée" : "Payée";
  save();
  syncAfterChange();
}

// ---------- Google OAuth ----------
function saveClientId() { db.settings.clientId = clientId.value.trim(); save(); msg("Client ID enregistré"); }

function connectGoogle() {
  if (!db.settings.clientId) return msg("Ajoute le Client ID Google dans Paramètres");
  if (!window.google?.accounts?.oauth2) return msg("Google n'est pas encore chargé. Réessaie dans quelques secondes.");
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: db.settings.clientId,
    scope: GOOGLE_SCOPES,
    callback: async resp => {
      if (resp.error) { console.error(resp); return msg("Connexion Google refusée : " + resp.error); }
      accessToken = resp.access_token;
      render();
      try {
        await loadAndMergeDriveData();
        render();
        msg(`🟢 Google connecté — ${db.invoices.length} facture(s) chargée(s)`);
      } catch (e) {
        console.error(e); render(); msg("Google connecté mais Drive est inaccessible : " + friendlyGoogleError(e));
      }
    }
  });
  // force a fresh consent once after installing this corrected version.
  tokenClient.requestAccessToken({ prompt: "consent" });
}
function disconnectGoogle() { accessToken = null; folderId = null; dataFileId = null; render(); msg("Google déconnecté"); }

async function googleFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: "Bearer " + accessToken };
  const r = await fetch(url, { ...options, headers });
  if (!r.ok) {
    let text = "";
    try { text = await r.text(); } catch {}
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch {}
    throw new Error(`Google ${r.status}: ${detail || r.statusText}`);
  }
  return r;
}

async function ensureDriveFolder() {
  if (folderId) return folderId;
  const query = encodeURIComponent("name='RamoXN' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const r = await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=100`).then(x => x.json());
  if (r.files?.length) {
    // Prefer exact folder name. If several exist, use the first one.
    folderId = r.files[0].id;
  } else {
    const x = await googleFetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "RamoXN", mimeType: "application/vnd.google-apps.folder" })
    }).then(x => x.json());
    folderId = x.id;
  }
  return folderId;
}

async function findDataFile() {
  await ensureDriveFolder();
  const query = encodeURIComponent(`'${folderId}' in parents and name='RamoXN_data.json' and trashed=false`);
  const r = await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,modifiedTime,size)&pageSize=100`).then(x => x.json());
  dataFileId = r.files?.[0]?.id || null;
  return dataFileId;
}

async function readRemoteDB() {
  await findDataFile();
  if (!dataFileId) return null;
  const r = await googleFetch(`https://www.googleapis.com/drive/v3/files/${dataFileId}?alt=media`);
  const remote = await r.json();
  if (!remote || typeof remote !== "object" || !Array.isArray(remote.invoices)) throw new Error("RamoXN_data.json invalide dans Google Drive");
  return normalizeDB(remote);
}

// Merge without deleting Drive data. Remote is the base; local-only records are added.
function mergeDatabases(remote, local) {
  const result = normalizeDB(structuredClone(remote || defaultDB()));
  const loc = normalizeDB(structuredClone(local || defaultDB()));
  result.clients = { ...loc.clients, ...result.clients };
  result.lots = { ...loc.lots, ...result.lots };

  const byNumber = new Map(result.invoices.map(x => [String(x.number), x]));
  for (const lx of loc.invoices) {
    const key = String(lx.number || "");
    if (!key) continue;
    if (!byNumber.has(key)) byNumber.set(key, lx);
    else {
      const rx = byNumber.get(key);
      // Keep the remote document links/mail state when they already exist.
      byNumber.set(key, {
        ...lx, ...rx,
        driveFiles: rx.driveFiles?.length ? rx.driveFiles : (lx.driveFiles || []),
        mailSent: !!(rx.mailSent || lx.mailSent)
      });
    }
  }
  result.invoices = Array.from(byNumber.values()).sort((a, b) => String(a.number).localeCompare(String(b.number), "fr", { numeric: true }));
  result.next = Math.max(result.next, loc.next, ...result.invoices.map(x => Number(String(x.number).match(/-(\d+)$/)?.[1] || 0) + 1));
  result.settings = { ...loc.settings, ...result.settings };
  return normalizeDB(result);
}

async function loadAndMergeDriveData() {
  const localBefore = structuredClone(db);
  const remote = await readRemoteDB();
  if (remote) {
    db = mergeDatabases(remote, localBefore);
    save(false);
    // If local contained genuinely new data, write the merged database back.
    await syncNow(false);
  } else {
    // No JSON exists: create it from the current local data.
    await syncNow(false);
  }
  render();
}

async function driveUpload(name, blob, mime, existingId = null) {
  const metadata = { name, mimeType: mime };
  if (!existingId) metadata.parents = [folderId];
  const boundary = "ramoxn_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ]);
  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id,name,modifiedTime`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime`;
  return googleFetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  }).then(x => x.json());
}

async function syncNow(show = true) {
  if (!accessToken) throw new Error("Google n'est pas connecté");
  if (syncing) return;
  syncing = true;
  try {
    await ensureDriveFolder();
    await findDataFile();
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const r = await driveUpload("RamoXN_data.json", blob, "application/json", dataFileId);
    dataFileId = r.id || dataFileId;
    if (show) msg("Données synchronisées dans Google Drive");
  } finally { syncing = false; }
}

async function uploadPDFs(x) {
  await ensureDriveFolder();
  const ids = [];
  const facture = await driveUpload(`Facture_${x.number}.pdf`, makePDF(x, "facture"), "application/pdf");
  ids.push(facture.id);
  for (const a of x.lines) {
    const r = await driveUpload(`Attestation_${x.number}_${safe(a.app)}.pdf`, makePDF(x, "attestation", a), "application/pdf");
    ids.push(r.id);
  }
  x.driveFiles = ids;
  return ids;
}

// ---------- Gmail ----------
function bytesToB64(bytes) {
  let s = ""; const u = new Uint8Array(bytes);
  const chunk = 0x8000;
  for (let i = 0; i < u.length; i += chunk) s += String.fromCharCode(...u.subarray(i, i + chunk));
  return btoa(s);
}
function b64url(s) { return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
async function blobB64(blob) { return b64url(bytesToB64(await blob.arrayBuffer())); }

async function sendInvoiceEmail(x, to) {
  const attachments = [
    { name: `Facture_${x.number}.pdf`, mime: "application/pdf", b64: await blobB64(makePDF(x, "facture")) }
  ];
  for (const a of x.lines) attachments.push({
    name: `Attestation_${x.number}_${safe(a.app)}.pdf`, mime: "application/pdf", b64: await blobB64(makePDF(x, "attestation", a))
  });

  const boundary = "RamoXN-Mail-" + Date.now();
  const parts = [
    "From: me", `To: ${to}`, `Subject: RamoXN - Facture ${x.number}`,
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "",
    `Bonjour,\r\n\r\nVeuillez trouver en pièces jointes votre facture ${x.number} ainsi que votre/vos attestation(s) de ramonage.\r\n\r\nCordialement,\r\nRamoXN`
  ];
  for (const a of attachments) parts.push(
    `--${boundary}`, `Content-Type: ${a.mime}; name="${a.name}"`, `Content-Disposition: attachment; filename="${a.name}"`,
    "Content-Transfer-Encoding: base64", "", a.b64
  );
  parts.push(`--${boundary}--`, "");

  const raw = b64url(bytesToB64(new TextEncoder().encode(parts.join("\r\n"))));
  const response = await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw })
  }).then(x => x.json());
  if (!response.id) throw new Error("Gmail n'a pas retourné d'identifiant de message");
  x.mailSent = true; x.mailId = response.id;
  return response;
}

// ---------- Restore / backup ----------
async function restoreFromDrive() {
  if (!accessToken) return msg("Connecte Google d'abord");
  try {
    const remote = await readRemoteDB();
    if (!remote) return msg("Aucune sauvegarde RamoXN trouvée");
    db = remote; save();
    msg(`Données restaurées : ${db.invoices.length} facture(s)`);
  } catch (e) { console.error(e); msg("Restauration impossible : " + friendlyGoogleError(e)); }
}
function exportBackup() { download("RamoXN_sauvegarde.json", new Blob([JSON.stringify(db, null, 2)], { type: "application/json" })); }
function importBackup(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { db = normalizeDB(JSON.parse(r.result)); save(); msg("Sauvegarde importée"); syncAfterChange(); } catch { msg("Fichier invalide"); } };
  r.readAsText(f);
}
function friendlyGoogleError(e) {
  const s = String(e?.message || e || "Erreur inconnue");
  if (/403|insufficient|permission|forbidden/i.test(s)) return s + " — vérifie que le scope Google Drive complet est autorisé et reconnecte Google.";
  if (/401|unauthenticated/i.test(s)) return s + " — reconnecte Google.";
  return s;
}
function syncAfterChange() {
  if (accessToken) syncNow(false).catch(e => console.error("Synchronisation:", e));
}

// ---------- UI ----------
function render() {
  nClients.textContent = Object.keys(db.clients || {}).length;
  nLots.textContent = Object.keys(db.lots || {}).length;
  nInvoices.textContent = (db.invoices || []).length;
  nDue.textContent = (db.invoices || []).filter(x => x.status !== "Payée").length;

  clientList.innerHTML = Object.entries(db.clients || {}).map(([n, x]) => `<div class="item"><b>${esc(n)}</b><br>${esc(x.rue)}, ${esc(x.ville)}<br>${esc(x.telephone)} · ${esc(x.email)}<div class="actions"><button onclick="editClient('${q(n)}')">Modifier</button><button onclick="delClient('${q(n)}')">Supprimer</button></div></div>`).join("") || '<p class="muted">Aucun client.</p>';
  lotList.innerHTML = Object.entries(db.lots || {}).map(([n, x]) => `<div class="item"><b>${esc(n)}</b><br>${esc(x.rue)}, ${esc(x.ville)}<div class="actions"><button onclick="editLot('${q(n)}')">Modifier</button><button onclick="delLot('${q(n)}')">Supprimer</button></div></div>`).join("") || '<p class="muted">Aucun lotissement.</p>';

  fill();
  rNum.value = invNo();
  if (!rDate.value) rDate.value = today();
  renderLines();

  const list = document.getElementById("invoiceList");
  const invs = db.invoices || [];
  list.innerHTML = invs.slice().reverse().map((x, k) => {
    const i = invs.length - 1 - k;
    return `<tr><td>${esc(x.number)}</td><td>${esc(x.date)}</td><td>${esc(x.client)}</td><td>${eur(x.total)}</td><td class="${x.status === "Payée" ? "paid" : "due"}">${esc(x.status)}</td><td><button onclick="downloadInvoice(${i})">PDF</button> <button onclick="sendExisting(${i})">✉️</button> <button onclick="togglePaid(${i})">${x.status === "Payée" ? "Non payée" : "Payée"}</button></td></tr>`;
  }).join("") || '<tr><td colspan="6">Aucune facture enregistrée.</td></tr>';

  clientId.value = db.settings.clientId || "";
  status.textContent = accessToken ? "🟢 Google Drive + Gmail connectés." : "🔴 Google non connecté.";
  cloudText.textContent = accessToken ? "Google Drive + Gmail connectés" : "Google Drive non connecté";
  cloudDot.parentElement.parentElement.className = "cloud " + (accessToken ? "ok" : "bad");
}

render();

const STORE="ramoxn_gdrive_v1";
const DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
const DISCOVERY="https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
let db=JSON.parse(localStorage.getItem(STORE)||'{"clients":{},"lots":{},"invoices":[],"next":1,"settings":{"clientId":""}}');
let lines=[],tokenClient=null,accessToken=null,driveReady=false,folderId=null,dataFileId=null;

function save(){localStorage.setItem(STORE,JSON.stringify(db));render()}
function page(id){document.querySelectorAll(".pg").forEach(x=>x.classList.remove("active"));document.getElementById(id).classList.add("active");nav.classList.remove("open");render()}
function menu(){nav.classList.toggle("open")}
function eur(n){return Number(n||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function q(s){return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
function safe(s){return String(s).replace(/[^a-z0-9_-]+/gi,"_")}
function msg(t){toast.textContent=t;toast.style.display="block";setTimeout(()=>toast.style.display="none",2500)}
function today(){return new Date().toISOString().slice(0,10)}
function invNo(){let d=new Date(),m=String(d.getMonth()+1).padStart(2,"0"),y=String(d.getFullYear()).slice(-2);return `${m}-${y}-${String(db.next).padStart(3,"0")}`}

clientForm.onsubmit=e=>{e.preventDefault();let old=oldClient.value,n=cNom.value.trim();if(old&&old!==n)delete db.clients[old];db.clients[n]={rue:cRue.value,ville:cVille.value,telephone:cTel.value,email:cEmail.value};resetClient();save();msg("Client enregistré")};
function resetClient(){clientForm.reset();oldClient.value=""}
function editClient(n){let x=db.clients[n];oldClient.value=n;cNom.value=n;cRue.value=x.rue;cVille.value=x.ville;cTel.value=x.telephone;cEmail.value=x.email;page("clients")}
function delClient(n){if(confirm("Supprimer ce client ?")){delete db.clients[n];save()}}

lotForm.onsubmit=e=>{e.preventDefault();let old=oldLot.value,n=lNom.value.trim();if(old&&old!==n)delete db.lots[old];db.lots[n]={rue:lRue.value,ville:lVille.value};resetLot();save();msg("Lotissement enregistré")};
function resetLot(){lotForm.reset();oldLot.value=""}
function editLot(n){let x=db.lots[n];oldLot.value=n;lNom.value=n;lRue.value=x.rue;lVille.value=x.ville;page("lots")}
function delLot(n){if(confirm("Supprimer ce lotissement ?")){delete db.lots[n];save()}}

function fill(){let c=rClient.value,l=rLot.value;rClient.innerHTML='<option value="">— Sélectionner —</option>'+Object.keys(db.clients).map(x=>`<option>${esc(x)}</option>`).join("");rLot.innerHTML='<option value="">— Sélectionner —</option>'+Object.keys(db.lots).map(x=>`<option>${esc(x)}</option>`).join("");rClient.value=c;rLot.value=l}
rClient.onchange=()=>{let c=db.clients[rClient.value];if(c&&!rLot.value){let z=Object.entries(db.lots).find(([n,x])=>x.rue===c.rue&&x.ville===c.ville);if(z)rLot.value=z[0]}};
function useClientName(){sNom.value=rClient.value||""}
function addLine(){if(!sNom.value.trim()||!sApp.value.trim()||!sType.value.trim()||!sPrix.value){msg("Remplis les 4 champs");return}lines.push({nom:sNom.value.trim(),app:sApp.value.trim(),type:sType.value.trim(),prix:+sPrix.value});sNom.value=sApp.value=sType.value=sPrix.value="";renderLines()}
function removeLine(i){lines.splice(i,1);renderLines()}
function renderLines(){linesDiv.innerHTML=lines.map((x,i)=>`<div class="line"><span>${esc(x.nom)}</span><span>${esc(x.app)}</span><span>${esc(x.type)}</span><span>${eur(x.prix)}</span><button onclick="removeLine(${i})">✕</button></div>`).join("");total.textContent=eur(lines.reduce((a,x)=>a+x.prix,0))}
function resetNew(){lines=[];rClient.value=rLot.value="";rDate.value=today();rPay.value="Virement";rType.value="Ramonage cheminée bois";renderLines();render()}

async function createInvoice(){
 if(!rClient.value||!rLot.value||!lines.length){msg("Client, lotissement et au moins une ligne sont requis");return}
 let n=invNo(),c=db.clients[rClient.value],l=db.lots[rLot.value];
 let x={number:n,date:rDate.value,client:rClient.value,clientInfo:c,lot:rLot.value,lotInfo:l,payment:rPay.value,type:rType.value,lines:structuredClone(lines),total:lines.reduce((a,z)=>a+z.prix,0),status:["Espèce","Carte bancaire"].includes(rPay.value)?"Payée":"Non payée"};
 db.invoices.push(x);db.next++;save();
 if(accessToken){try{await syncNow();await uploadPDFs(x);msg("Facture, attestations et données synchronisées dans Drive")}catch(e){console.error(e);msg("Facture créée, mais synchronisation Drive impossible")}}
 else {download("Facture_"+n+".pdf",makePDF(x,"facture"));x.lines.forEach((a,i)=>download("Attestation_"+n+"_"+safe(a.app)+".pdf",makePDF(x,"attestation",a,i)));msg("Documents PDF créés")}
 resetNew();page("invoices")
}

function makePDF(x,type,a=null,i=0){
 const {jsPDF}=window.jspdf,doc=new jsPDF({unit:"mm",format:"a4"});doc.setFont("helvetica");doc.setFontSize(16);doc.setFont(undefined,"bold");
 let y=18;doc.text(type==="facture"?"FACTURE N° "+x.number:"CERTIFICAT DE RAMONAGE",105,y,{align:"center"});y+=12;doc.setFontSize(10);doc.setFont(undefined,"normal");
 const lines0=type==="facture"?[
 "RamoXN","5 Font Bonne","66210 Puyvalador","Tel : 06.18.51.75.64","contact.ramoxn@gmail.com","",
 "Client : "+x.client,x.clientInfo.rue+", "+x.clientInfo.ville,"Date : "+x.date,"Lieu : "+x.lot+" — "+x.lotInfo.rue+", "+x.lotInfo.ville,"",
 ...x.lines.map(z=>z.type+" — "+z.app+" — "+z.nom+" : "+eur(z.prix)),"","TOTAL TTC : "+eur(x.total),"Mode de règlement : "+x.payment,
 "TVA non applicable en raison de l'article 293 B du Code général des impôts."
 ]:[
 "RamoXN","5 Font Bonne — 66210 Puyvalador","Tel : 06.18.51.75.64 — contact.ramoxn@gmail.com","",
 "Certificat N° : "+x.number,"Je soussigné, ICKX Nicolaï, déclare avoir effectué le ramonage des conduits de cheminée.",
 "Client : "+a.nom,"Appartement : "+a.app,"Adresse : "+x.lotInfo.rue+", "+x.lotInfo.ville,"Date : "+x.date,"Nature du conduit : "+a.type,
 "","Nous certifions que le ramonage a été réalisé conformément aux normes en vigueur et dans le respect des règles de sécurité.",
 "En foi de quoi, nous délivrons la présente attestation pour servir et valoir ce que de droit.","","Fait à Puyvalador, le "+x.date,"ICKX Nicolaï"
 ];
 for(const t of lines0){let arr=doc.splitTextToSize(t,175);if(y+arr.length*5>280){doc.addPage();y=18}doc.text(arr,18,y);y+=arr.length*5}
 return doc.output("blob")
}
function download(name,blob){let a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}

function render(){
 nClients.textContent=Object.keys(db.clients).length;nLots.textContent=Object.keys(db.lots).length;nInvoices.textContent=db.invoices.length;nDue.textContent=db.invoices.filter(x=>x.status!=="Payée").length;
 clientList.innerHTML=Object.entries(db.clients).map(([n,x])=>`<div class="item"><b>${esc(n)}</b><br>${esc(x.rue)}, ${esc(x.ville)}<br>${esc(x.telephone)} · ${esc(x.email)}<div class="actions"><button onclick="editClient('${q(n)}')">Modifier</button><button onclick="delClient('${q(n)}')">Supprimer</button></div></div>`).join("")||'<p class="muted">Aucun client.</p>';
 lotList.innerHTML=Object.entries(db.lots).map(([n,x])=>`<div class="item"><b>${esc(n)}</b><br>${esc(x.rue)}, ${esc(x.ville)}<div class="actions"><button onclick="editLot('${q(n)}')">Modifier</button><button onclick="delLot('${q(n)}')">Supprimer</button></div></div>`).join("")||'<p class="muted">Aucun lotissement.</p>';
 fill();rNum.value=invNo();if(!rDate.value)rDate.value=today();renderLines();
 invoiceList.innerHTML=db.invoices.slice().reverse().map((x,k)=>{let i=db.invoices.length-1-k;return `<tr><td>${esc(x.number)}</td><td>${esc(x.date)}</td><td>${esc(x.client)}</td><td>${eur(x.total)}</td><td class="${x.status==="Payée"?"paid":"due"}">${x.status}</td><td><button onclick="togglePaid(${i})">${x.status==="Payée"?"Non payée":"Payée"}</button><button onclick="download('Facture_${safe(x.number)}.pdf',makePDF(db.invoices[${i}],'facture'))"> PDF</button></td></tr>`}).join("");
 clientId.value=db.settings.clientId||"";status.textContent=accessToken?"Google Drive connecté.":"Google Drive non connecté.";
 cloudText.textContent=accessToken?"Google Drive connecté":"Google Drive non connecté";cloudDot.parentElement.parentElement.className="cloud "+(accessToken?"ok":"bad");
}
function togglePaid(i){db.invoices[i].status=db.invoices[i].status==="Payée"?"Non payée":"Payée";save();if(accessToken)syncNow()}
function saveClientId(){db.settings.clientId=clientId.value.trim();save();msg("Client ID enregistré")}

async function initDrive(){
 if(!db.settings.clientId){msg("Ajoute ton Client ID Google dans Paramètres");return}
 await new Promise(resolve=>gapi.load("client",resolve));await gapi.client.init({discoveryDocs:[DISCOVERY]});
 tokenClient=google.accounts.oauth2.initTokenClient({client_id:db.settings.clientId,scope:DRIVE_SCOPE,callback:async(resp)=>{if(resp.error){msg("Connexion Google refusée");return}accessToken=resp.access_token;await findOrCreateFolder();await findDataFile();render();msg("Google Drive connecté")}});
 tokenClient.requestAccessToken({prompt:"consent"})
}
function connectGoogle(){initDrive().catch(e=>{console.error(e);msg("Erreur de connexion Google")})}
function disconnectGoogle(){accessToken=null;folderId=null;dataFileId=null;render();msg("Google Drive déconnecté")}

async function findOrCreateFolder(){
 let r=await gapi.client.drive.files.list({q:"name='RamoXN' and mimeType='application/vnd.google-apps.folder' and trashed=false",fields:"files(id,name)"});
 if(r.result.files.length)folderId=r.result.files[0].id;else{let c=await gapi.client.drive.files.create({resource:{name:"RamoXN",mimeType:"application/vnd.google-apps.folder"},fields:"id"});folderId=c.result.id}
}
async function findDataFile(){
 let r=await gapi.client.drive.files.list({q:`'${folderId}' in parents and name='RamoXN_data.json' and trashed=false`,fields:"files(id,name)"});
 dataFileId=r.result.files.length?r.result.files[0].id:null;
}
async function driveUpload(name,blob,mime,existingId=null){
 let meta={name,parents:existingId?undefined:[folderId],mimeType:mime};let url=existingId?`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`:"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
 let boundary="ramoxn_boundary_"+Date.now();let body=new Blob(["--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",JSON.stringify(meta),"\r\n--"+boundary+"\r\nContent-Type: "+mime+"\r\n\r\n",blob,"\r\n--"+boundary+"--"]);
 let res=await fetch(url,{method:existingId?"PATCH":"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"multipart/related; boundary="+boundary},body});if(!res.ok)throw new Error(await res.text());return res.json()
}
async function syncNow(){
 if(!accessToken){msg("Connecte Google Drive d'abord");return}
 await findOrCreateFolder();await findDataFile();let blob=new Blob([JSON.stringify(db)],{type:"application/json"});await driveUpload("RamoXN_data.json",blob,"application/json",dataFileId);await findDataFile();msg("Données synchronisées")
}
async function uploadPDFs(x){
 await findOrCreateFolder();await driveUpload("Facture_"+x.number+".pdf",makePDF(x,"facture"),"application/pdf");
 for(let i=0;i<x.lines.length;i++){let a=x.lines[i];await driveUpload("Attestation_"+x.number+"_"+safe(a.app)+".pdf",makePDF(x,"attestation",a,i),"application/pdf")}
}
async function restoreFromDrive(){
 if(!accessToken){msg("Connecte Google Drive d'abord");return}
 await findOrCreateFolder();await findDataFile();if(!dataFileId){msg("Aucune sauvegarde RamoXN dans Drive");return}
 let r=await gapi.client.drive.files.get({fileId:dataFileId,alt:"media"});db=r.result;localStorage.setItem(STORE,JSON.stringify(db));render();msg("Données restaurées depuis Drive")
}
function exportBackup(){download("RamoXN_sauvegarde.json",new Blob([JSON.stringify(db,null,2)],{type:"application/json"}))}
function importBackup(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{db=JSON.parse(r.result);save();msg("Sauvegarde importée")}catch{msg("Fichier invalide")}};r.readAsText(f)}

render();
const KEY="ramoxn_data_v1";
let db=JSON.parse(localStorage.getItem(KEY)||'{"clients":{},"lots":{},"invoices":[],"next":1}');
let lines=[];

function save(){localStorage.setItem(KEY,JSON.stringify(db));refresh();}
function money(v){return Number(v||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});}
function toast(t){const e=document.getElementById("toast");e.textContent=t;e.style.display="block";setTimeout(()=>e.style.display="none",2200)}
function toggleMenu(){document.getElementById("nav").classList.toggle("open")}
function showPage(id){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.getElementById(id).classList.add("active");document.getElementById("nav").classList.remove("open");refresh()}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>showPage(b.dataset.page));

function today(){return new Date().toISOString().slice(0,10)}
function number(){let d=new Date();let mm=String(d.getMonth()+1).padStart(2,"0"), yy=String(d.getFullYear()).slice(-2);return `${mm}-${yy}-${String(db.next).padStart(3,"0")}`}
function refresh(){
 document.getElementById("statClients").textContent=Object.keys(db.clients).length;
 document.getElementById("statLots").textContent=Object.keys(db.lots).length;
 document.getElementById("statFactures").textContent=db.invoices.length;
 document.getElementById("statImpayees").textContent=db.invoices.filter(x=>x.status!=="Payée").length;
 renderClients();renderLots();fillSelects();renderLines();renderInvoices();
 document.getElementById("rNumero").value=number();
 if(!document.getElementById("rDate").value)document.getElementById("rDate").value=today();
}
function renderClients(){
 const e=document.getElementById("clientsList");e.innerHTML="";
 Object.entries(db.clients).forEach(([n,c])=>e.innerHTML+=`<div class="item"><b>${esc(n)}</b><br>${esc(c.rue)}, ${esc(c.ville)}<br><span class="muted">${esc(c.telephone)} · ${esc(c.email)}</span><div class="actions"><button onclick="editClient('${js(n)}')">Modifier</button><button onclick="deleteClient('${js(n)}')">Supprimer</button></div></div>`);
 if(!e.innerHTML)e.innerHTML='<p class="muted">Aucun client.</p>';
}
function renderLots(){
 const e=document.getElementById("lotsList");e.innerHTML="";
 Object.entries(db.lots).forEach(([n,c])=>e.innerHTML+=`<div class="item"><b>${esc(n)}</b><br>${esc(c.rue)}, ${esc(c.ville)}<div class="actions"><button onclick="editLot('${js(n)}')">Modifier</button><button onclick="deleteLot('${js(n)}')">Supprimer</button></div></div>`);
 if(!e.innerHTML)e.innerHTML='<p class="muted">Aucun lotissement.</p>';
}
function fillSelects(){
 const rc=document.getElementById("rClient"),rl=document.getElementById("rLot");
 const oc=rc.value,ol=rl.value;
 rc.innerHTML='<option value="">— Sélectionner —</option>'+Object.keys(db.clients).map(n=>`<option>${esc(n)}</option>`).join("");
 rl.innerHTML='<option value="">— Sélectionner —</option>'+Object.keys(db.lots).map(n=>`<option>${esc(n)}</option>`).join("");
 rc.value=oc;rl.value=ol;
}
document.getElementById("clientForm").onsubmit=e=>{e.preventDefault();let old=clientOldName.value,n=clientNom.value.trim();if(old&&old!==n)delete db.clients[old];db.clients[n]={rue:clientRue.value,ville:clientVille.value,telephone:clientTel.value,email:clientEmail.value};resetClient();save();toast("Client enregistré")};
function editClient(n){let c=db.clients[n];clientOldName.value=n;clientNom.value=n;clientRue.value=c.rue;clientVille.value=c.ville;clientTel.value=c.telephone;clientEmail.value=c.email;showPage("clients")}
function deleteClient(n){if(confirm("Supprimer ce client ?")){delete db.clients[n];save()}}
function resetClient(){clientForm.reset();clientOldName.value=""}

document.getElementById("lotForm").onsubmit=e=>{e.preventDefault();let old=lotOldName.value,n=lotNom.value.trim();if(old&&old!==n)delete db.lots[old];db.lots[n]={rue:lotRue.value,ville:lotVille.value};resetLot();save();toast("Lotissement enregistré")};
function editLot(n){let c=db.lots[n];lotOldName.value=n;lotNom.value=n;lotRue.value=c.rue;lotVille.value=c.ville;showPage("lotissements")}
function deleteLot(n){if(confirm("Supprimer ce lotissement ?")){delete db.lots[n];save()}}
function resetLot(){lotForm.reset();lotOldName.value=""}

document.getElementById("rClient").onchange=()=>{let c=db.clients[rClient.value];if(c&&!document.getElementById("rLot").value){let l=Object.entries(db.lots).find(([n,x])=>x.rue===c.rue&&x.ville===c.ville);if(l)rLot.value=l[0]}};
function copyClientName(){sNom.value=rClient.value||""}
function addLine(){
 if(!sNom.value.trim()||!sApp.value.trim()||!sType.value.trim()||!sPrix.value){toast("Remplis les 4 champs");return}
 lines.push({nom:sNom.value.trim(),app:sApp.value.trim(),type:sType.value.trim(),prix:Number(sPrix.value)});
 sNom.value="";sApp.value="";sType.value="";sPrix.value="";renderLines()
}
function renderLines(){
 linesDiv=document.getElementById("lines");linesDiv.innerHTML=lines.map((x,i)=>`<div class="line"><span>${esc(x.nom)}</span><span>${esc(x.app)}</span><span>${esc(x.type)}</span><span>${money(x.prix)}</span><button onclick="removeLine(${i})">✕</button></div>`).join("");
 total.textContent=money(lines.reduce((a,x)=>a+x.prix,0));
}
function removeLine(i){lines.splice(i,1);renderLines()}
function resetRamonage(){lines=[];rClient.value="";rLot.value="";rDate.value=today();rPaiement.value="Virement";rType.value="";renderLines();refresh()}

function generateDocuments(){
 if(!rClient.value||!rLot.value||!lines.length){toast("Client, lotissement et au moins une ligne sont requis");return}
 const n=number(),c=db.clients[rClient.value],l=db.lots[rLot.value];
 const inv={number:n,date:rDate.value,client:rClient.value,clientInfo:c,lot:rLot.value,lotInfo:l,payment:rPaiement.value,type:rType.value,lines:structuredClone(lines),total:lines.reduce((a,x)=>a+x.prix,0),status:["Espèce","Carte bancaire"].includes(rPaiement.value)?"Payée":"Non payée"};
 db.invoices.push(inv);db.next++;
 localStorage.setItem(KEY,JSON.stringify(db));
 downloadText(`Facture_${n}.html`,invoiceHtml(inv));
 lines.forEach((x,i)=>downloadText(`Attestation_${n}_${safe(x.nom)}_${safe(x.app)}.html`,attestationHtml(inv,x)));
 toast("Documents générés. Tu peux les imprimer en PDF.");
 resetRamonage();showPage("factures");
}
function togglePaid(i){db.invoices[i].status=db.invoices[i].status==="Payée"?"Non payée":"Payée";save()}
function renderInvoices(){
 const e=document.getElementById("invoiceTable");e.innerHTML="";
 db.invoices.slice().reverse().forEach((x,ri)=>{let i=db.invoices.length-1-ri;e.innerHTML+=`<tr><td>${esc(x.number)}</td><td>${esc(x.date)}</td><td>${esc(x.client)}</td><td>${money(x.total)}</td><td class="${x.status==="Payée"?"status-paid":"status-unpaid"}">${x.status}</td><td><button onclick="togglePaid(${i})">${x.status==="Payée"?"Marquer non payée":"Marquer payée"}</button> <button onclick="downloadText('Facture_${safe(x.number)}.html',invoiceHtml(db.invoices[${i}]))">Facture</button></td></tr>`})
}
function downloadText(name,text){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/html;charset=utf-8"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function safe(s){return s.replace(/[^a-z0-9_-]+/gi,"_")}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function js(s){return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
function base(title,body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial;margin:35px;color:#222}h1{text-align:center;background:#87cefa;padding:12px;border:1px solid #222}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border:1px solid #333;padding:8px}footer{position:fixed;bottom:20px;width:90%;text-align:center;font-size:12px}@media print{button{display:none}}</style></head><body>${body}<button onclick="window.print()">🖨️ Imprimer / PDF</button><footer>Entreprise ICKX · 5 Font Bonne · 66210 Puyvalador · SIRET 94942204200026</footer></body></html>`}
function invoiceHtml(x){return base("Facture "+x.number,`<h1>FACTURE N° ${esc(x.number)}</h1><p><b>RamoXN</b><br>5 Font Bonne<br>66210 Puyvalador<br>Tel : 06.18.51.75.64<br>Mail : contact.ramoxn@gmail.com</p><hr><p><b>Client :</b> ${esc(x.client)}<br>${esc(x.clientInfo.rue)}, ${esc(x.clientInfo.ville)}<br>Tel : ${esc(x.clientInfo.telephone)} · ${esc(x.clientInfo.email)}</p><p><b>Date :</b> ${esc(x.date)}<br><b>Lieu :</b> ${esc(x.lot)} — ${esc(x.lotInfo.rue)}, ${esc(x.lotInfo.ville)}</p><table><tr><th>Désignation</th><th>Quantité</th><th>Prix TTC</th><th>Total TTC</th></tr>${x.lines.map(l=>`<tr><td>${esc(l.type)} - ${esc(l.app)} - ${esc(l.nom)}</td><td>1</td><td>${money(l.prix)}</td><td>${money(l.prix)}</td></tr>`).join("")}<tr><th colspan="3">Total TTC</th><th>${money(x.total)}</th></tr></table><p><b>Mode de règlement :</b> ${esc(x.payment)}</p><p>TVA non applicable en raison de l'article 293 B du Code général des impôts.</p>`)}
function attestationHtml(x,l){return base("Certificat de ramonage",`<h1>CERTIFICAT DE RAMONAGE</h1><p><b>RamoXN</b><br>5 Font Bonne · 66210 Puyvalador<br>Tel : 06.18.51.75.64 · contact.ramoxn@gmail.com</p><h3>Certificat N° ${esc(x.number)}</h3><p>Je soussigné, ICKX Nicolaï, déclare avoir effectué le ramonage des conduits de cheminée situés à l'adresse suivante :</p><table><tr><td>Résidence, Lot</td><td>Res. ${esc(x.lot)} Lot. ${esc(l.app)}</td></tr><tr><td>Adresse du lieu</td><td>${esc(x.lotInfo.rue)}, ${esc(x.lotInfo.ville)}</td></tr><tr><td>Date de l'intervention</td><td>${esc(x.date)}</td></tr><tr><td>Nature du conduit</td><td>${esc(l.type || x.type || "Ramonage")} cheminée bois</td></tr></table><p>Nous certifions que le ramonage a été réalisé conformément aux normes en vigueur et dans le respect des règles de sécurité.</p><p>En foi de quoi, nous délivrons la présente attestation pour servir et valoir ce que de droit.</p><p>Fait à Puyvalador, le ${esc(x.date)}</p><p><b>ICKX Nicolaï</b></p>`)}

refresh();

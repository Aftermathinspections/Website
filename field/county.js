/* AIS Field: private provider paperwork (Monroe County official pages; AIS-letterhead copy for cities, Collier and Lee).
   Fills the county's own form pages (forms/monroe-report.pdf, forms/monroe-cert.pdf)
   with job + inspection data and Luigi's signature, then hands back a PDF to upload to Oracle. */
const PP={firm:"Aftermath Inspection Services LLC",name:"Luigi Vaccaro",addr:"Summerland Key, FL 33042",
  lic:"BU2239 (Bldg Code Admin) / BN7700",phone:"305-900-7529",email:"Luigi@aftermathinspections.com",
  byLine:"LUIGI VACCARO, BU2239",certName:"LUIGI VACCARO, Building Code Administrator BU2239"};
const SIG_PATH="sig/signature.png";
const FINAL_CODES=/^(199|291|292|293|294|295|296|297|399|499|599|699|798|799|891|892)$/;
let SIG_STATE=null, SIG_BYTES=null, CTY_BUSY=null;

const JURS=["Monroe County","City of Key West","City of Marathon","Islamorada","City of Key Colony Beach","City of Layton","Collier County","Lee County"];
function ctyJur(j){if(!j)return"Monroe County";const t=String(j.jurisdiction||"").trim();
  if(t){const m=JURS.find(x=>x.toLowerCase()===t.toLowerCase());if(m)return m;if(/collier/i.test(t))return"Collier County";if(/\blee\b/i.test(t))return"Lee County";if(/key west/i.test(t))return"City of Key West";return t}
  const c=j.county||"Monroe";if(c==="Monroe"&&/^BLD\d{4}-\d+/i.test(j.permit||""))return"City of Key West";return c==="Monroe"?"Monroe County":c+" County"}
const ctyOfficial=j=>ctyJur(j)==="Monroe County";
const ctyMonroe=j=>true; // every job gets paperwork now; Monroe County uses the county's own pages, others the AIS-letterhead copy
const ctyD=v=>{if(!v)return"";const d=new Date(String(v).length<=10?v+"T12:00":v);return isNaN(d)?"":`${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`};
const ctyIsFinal=i=>FINAL_CODES.test(String(i.code||"").trim())||/final/i.test(i.name||"");
const ctyFile=s=>String(s||"").replace(/[^A-Za-z0-9-]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"job";

function ctyLib(){if(window.PDFLib)return Promise.resolve(window.PDFLib);
  return new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
    s.onload=()=>window.PDFLib?ok(window.PDFLib):no(new Error("PDF tool didn't load"));s.onerror=()=>no(new Error("PDF tool didn't load. Check your signal."));document.head.appendChild(s)})}
async function ctySig(force){if(SIG_BYTES&&!force)return SIG_BYTES;
  try{const{data,error}=await sb.storage.from(BUCKET).download(SIG_PATH);if(error||!data)throw error||new Error("none");SIG_BYTES=new Uint8Array(await data.arrayBuffer());SIG_STATE="yes"}
  catch(e){SIG_BYTES=null;SIG_STATE="no"}return SIG_BYTES}
async function ctyCheckSig(){if(SIG_STATE)return;SIG_STATE="checking";await ctySig(true);renderOffice()}

/* Contractor papers on the inspection date: yes = all current, no = something expired, unknown = not on file */
function ctyPapers(job,onDate){const c=(CLIENTS||[]).find(x=>x.id===job.client_id);if(!c)return{state:"unknown",why:"contractor not linked to an AIS client"};
  const day=(onDate?new Date(onDate):new Date());const miss=[],bad=[];
  const chk=(d,label)=>{if(!d){miss.push(label);return}if(new Date(d+"T23:59")<day)bad.push(label+" expired "+ctyD(d))};
  chk(c.license_exp,"license");chk(c.gl_exp,"liability insurance");if(!c.wc_exempt)chk(c.wc_exp,"workers' comp");
  if(bad.length)return{state:"no",why:bad.join(", ")};if(miss.length)return{state:"unknown",why:miss.join(", ")+" not on file"};return{state:"yes",why:""}}

function ctyWrap(text,font,size,width){const out=[];
  for(const para of String(text||"").replace(/\r/g,"").split("\n")){const words=para.trim().split(/\s+/).filter(Boolean);let line="";
    for(const w of words){const t=line?line+" "+w:w;if(font.widthOfTextAtSize(t,size)<=width)line=t;else{if(line)out.push(line);line=w}}
    if(line)out.push(line)}return out}
function ctyFit(s,font,size,width){s=String(s||"");while(s&&font.widthOfTextAtSize(s,size)>width)s=s.slice(0,-1);return s}

async function ctyTemplate(name){const r=await fetch("forms/"+name);if(!r.ok)throw new Error("Couldn't load the county form. Check your signal.");return r.arrayBuffer()}

function ctyHead(pg,font,bold,blue,job,date,rows){const H=792;const T=(x,y,s,sz=9,b=false)=>pg.drawText(String(s||""),{x,y:H-y,size:sz,font:b?bold:font,color:blue});
  const addr=[job.address,job.area].filter(Boolean).join(", ")+", FL";
  T(110,rows[0],job.permit);T(345,rows[0],date);
  T(145,rows[1],ctyFit(addr,font,8.5,160),8.5);T(365,rows[1],job.parcel_re||"");
  T(145,rows[2],ctyFit(job.owner_name||"",font,9,160));T(375,rows[2],ctyFit(job.contractor||"",font,9,185));
  T(145,rows[3],PP.firm,8);T(395,rows[3],PP.name);
  T(145,rows[4],PP.addr);T(395,rows[4],PP.lic,8);
  T(145,rows[5],PP.phone);T(395,rows[5],PP.email,8)}

async function ctyMonroeReport(insp){const L=await ctyLib();const job=(RAW.jobs||[]).find(j=>j.id===insp.job_id)||{};
  const doc=await L.PDFDocument.load(await ctyTemplate("monroe-report.pdf"));const pg=doc.getPage(0);const H=792;
  const font=await doc.embedFont(L.StandardFonts.Helvetica),bold=await doc.embedFont(L.StandardFonts.HelveticaBold);const blue=L.rgb(.05,.15,.55);
  const date=ctyD(insp.done_at||insp.scheduled_date);
  ctyHead(pg,font,bold,blue,job,date,[193,216,242,280,304,340]);
  const T=(x,y,s,sz=9,b=false)=>pg.drawText(String(s||""),{x,y:H-y,size:sz,font:b?bold:font,color:blue});
  const X=(cx,cy)=>{const d=6;pg.drawLine({start:{x:cx-d,y:H-cy-d},end:{x:cx+d,y:H-cy+d},thickness:1.8,color:blue});pg.drawLine({start:{x:cx-d,y:H-cy+d},end:{x:cx+d,y:H-cy-d},thickness:1.8,color:blue})};
  T(190,366,insp.code||"",10,true);T(445,366,date,10,true);T(185,381,ctyFit(insp.name||"",bold,10,355),10,true);
  const pap=ctyPapers(job,insp.done_at);X(67,pap.state==="no"?446:419);
  X(67,581); // Certificate of Elevation: NO, not required at this time
  const res=insp.result,rx={pass:68,fail:175,partial:331,cancelled:450}[res];if(rx)X(rx,621); // "corr" ticks nothing: Failed only when marked Fail
  if(res&&res!=="pass"){let lines=ctyWrap(insp.corrections||insp.notes||"",font,7.2,395);
    if(lines.length>3){lines=lines.slice(0,3);lines[2]=ctyFit(lines[2],font,7.2,300)+" … (full list on AIS report)"}
    lines.forEach((ln,k)=>T(158,647+k*8.6,ln,7.2))}
  T(80,718,PP.byLine,10,true);
  const sig=await ctySig();if(sig){const im=await doc.embedPng(sig);const h=24,w=Math.min(210,im.width*h/im.height);pg.drawImage(im,{x:118,y:H-753,width:w,height:h})}
  return doc.save()}

async function ctyMonroeCert(jobId){const L=await ctyLib();const job=(RAW.jobs||[]).find(j=>j.id===jobId)||{};
  const passed=(RAW.insp||[]).filter(i=>i.job_id===jobId&&i.result==="pass"&&i.done_at).sort((a,b)=>String(a.done_at).localeCompare(String(b.done_at)));
  const tpl=await ctyTemplate("monroe-cert.pdf");const src=await L.PDFDocument.load(tpl);const doc=await L.PDFDocument.create();
  const font=await doc.embedFont(L.StandardFonts.Helvetica),bold=await doc.embedFont(L.StandardFonts.HelveticaBold);const blue=L.rgb(.05,.15,.55);
  const sig=await ctySig();const im=sig?await doc.embedPng(sig):null;const H=792,today=ctyD(new Date().toISOString());
  const rowsY=[531,542,553,564,575,586,598,609,620,631,642,653],per=24,pages=Math.max(1,Math.ceil(passed.length/per));
  for(let p=0;p<pages;p++){const[cp]=await doc.copyPages(src,[0]);doc.addPage(cp);const pg=cp;
    const T=(x,y,s,sz=9,b=false)=>pg.drawText(String(s||""),{x,y:H-y,size:sz,font:b?bold:font,color:blue});
    ctyHead(pg,font,bold,blue,job,today,[191,213,247,290,310,342]);
    passed.slice(p*per,(p+1)*per).forEach((i,k)=>{const col=k<12?0:1,y=rowsY[k%12];
      T(col?300:61,y,ctyFit([i.code,i.name].filter(Boolean).join(" "),font,8,col?200:172),8);T(col?506:241,y,ctyD(i.done_at),8)});
    if(pages>1)T(470,672,`Page ${p+1} of ${pages}`,8,true);
    T(63,714,PP.certName,9,true);T(95,749,today,9);T(385,749,PP.phone,9);
    if(im){const h=22,w=Math.min(230,im.width*h/im.height);pg.drawImage(im,{x:318,y:H-716,width:w,height:h})}}
  return doc.save()}

function ctySave(bytes,name){const blob=new Blob([bytes],{type:"application/pdf"});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;a.rel="noopener";document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000)}

/* ---- Office panels ---- */
function ctyPanels(){const R=RAW||{jobs:[],insp:[]},jobs=R.jobs||[],ins=R.insp||[];const J=id=>jobs.find(j=>j.id===id);
  const reps=ins.filter(i=>i.done_at&&i.result&&!i.county_up_at&&J(i.job_id)&&ctyMonroe(J(i.job_id))).sort((a,b)=>String(a.done_at).localeCompare(String(b.done_at)));
  const certs=jobs.filter(j=>ctyMonroe(j)&&!j.cert_up_at&&ins.some(i=>i.job_id===j.id&&i.result==="pass"&&i.done_at));
  const RL={pass:"Passed",fail:"Failed",corr:"Corrections (no result box ticked)",partial:"Incomplete",cancelled:"Cancelled"};
  const RC={pass:"var(--pass)",fail:"var(--fail)",corr:"var(--part)",partial:"var(--part)",cancelled:"var(--mute)"};
  const miss=j=>[!j.parcel_re&&"Site RE #",!j.owner_name&&"owner name"].filter(Boolean);
  const sigRow=SIG_STATE==="yes"?`<p class="m" style="margin:0 0 8px">Your signature is on file and goes on every form. <button class="edbtn" id="sig_new" style="min-height:32px;padding:0 10px">Re-sign</button></p>`
    :SIG_STATE==="no"?`<div class="ctywarn">Your signature isn't on file yet. Forms will have a blank signature line. <button class="edbtn" id="sig_new" style="background:var(--maroon);color:#fff;border-color:var(--maroon)">Sign once</button></div>`:"";
  const repLi=reps.map(i=>{const j=J(i.job_id),m=miss(j),p=ctyPapers(j,i.done_at);
    return`<li><div><b>${esc(j.address||"")}</b> · ${esc([i.code,i.name].filter(Boolean).join(" "))}<br><span class="m"><b class="jur">${esc(ctyJur(j))}</b> · Permit ${esc(j.permit||"")} · ${ctyD(i.done_at)} · <b style="color:${RC[i.result]||"inherit"}">${RL[i.result]||esc(i.result)}</b></span>
      ${m.length?`<br><span class="ctyflag">Missing ${m.join(" and ")}. Add it on the job's Inspection tab.</span>`:""}
      ${p.state==="no"?`<br><span class="ctyflag red">Contractor papers: ${esc(p.why)}. Form says NO; county will cancel until current.</span>`:p.state==="unknown"?`<br><span class="ctyflag">Contractor papers: ${esc(p.why)}. Form says YES; check before uploading.</span>`:""}</div>
      <div class="cbtns"><button class="edbtn" data-crep="${esc(i.id)}">${CTY_BUSY===i.id?"Making PDF…":"View / Download"}</button><button class="edbtn" data-cup="${esc(i.id)}">Mark uploaded</button></div></li>`}).join("");
  const certLi=certs.map(j=>{const ps=ins.filter(i=>i.job_id===j.id&&i.result==="pass"&&i.done_at),fin=ps.some(ctyIsFinal),m=miss(j);
    return`<li><div><b>${esc(j.address||"")}</b> · Permit ${esc(j.permit||"")}<br><span class="m"><b class="jur">${esc(ctyJur(j))}</b> · ${ps.length} passed inspection${ps.length===1?"":"s"} listed · </span>${fin?`<b style="color:var(--pass)">READY: final passed</b>`:`<span class="m">running list, not final yet</span>`}
      ${m.length?`<br><span class="ctyflag">Missing ${m.join(" and ")}.</span>`:""}</div>
      <div class="cbtns"><button class="edbtn" data-ccert="${esc(j.id)}">${CTY_BUSY===j.id?"Making PDF…":"View / Download"}</button>${fin?`<button class="edbtn" data-ccup="${esc(j.id)}">Mark uploaded</button>`:""}</div></li>`}).join("");
  return`<div class="oc wide"><h3>County &amp; city reports to upload (${reps.length})</h3>${sigRow}${reps.length?`<ul class="olist">${repLi}</ul><p class="m" style="margin:8px 0 0;font-size:13px;color:var(--mute)">Monroe County: upload to the permit in Oracle (Online Permitting), or email upperkeysinspections / lowerkeysinspections for legacy permits. City of Key West, other cities, Collier and Lee: these use the AIS-letterhead form. Submit the way that building department asks.</p>`:`<p class="oempty">Nothing to upload. Every inspection report is in.</p>`}</div>
  <div class="oc wide"><h3>Certificates of compliance (${certs.length})</h3>${certs.length?`<ul class="olist">${certLi}</ul><p class="m" style="margin:8px 0 0;font-size:13px;color:var(--mute)">Each job's certificate adds a line every time an inspection passes. When the final passes: schedule "Private Provider Certificate of Inspection Compliance" on the permit, then upload this.</p>`:`<p class="oempty">No jobs with passed inspections yet.</p>`}</div>`}

function ctyBind(el){ctyCheckSig();
  el.querySelectorAll("[data-crep]").forEach(b=>b.onclick=async()=>{const i=(RAW.insp||[]).find(x=>x.id===b.dataset.crep);if(!i||CTY_BUSY)return;CTY_BUSY=i.id;b.textContent="Making PDF…";
    try{const j=(RAW.jobs||[]).find(x=>x.id===i.job_id)||{};ctySave(await ctyReportPdf(i),`${ctyFile(ctyJur(j))}-PP-Report_${ctyFile(j.permit)}_${ctyFile(i.code||"insp")}_${ctyD(i.done_at).replace(/\//g,"-")}.pdf`)}
    catch(e){console.error(e);toast("Couldn't make the PDF: "+(e.message||e))}CTY_BUSY=null;renderOffice()});
  el.querySelectorAll("[data-ccert]").forEach(b=>b.onclick=async()=>{const id=b.dataset.ccert;if(CTY_BUSY)return;CTY_BUSY=id;b.textContent="Making PDF…";
    try{const j=(RAW.jobs||[]).find(x=>x.id===id)||{};ctySave(await ctyCertPdf(id),`${ctyFile(ctyJur(j))}-PP-Certificate_${ctyFile(j.permit)}.pdf`)}
    catch(e){console.error(e);toast("Couldn't make the PDF: "+(e.message||e))}CTY_BUSY=null;renderOffice()});
  el.querySelectorAll("[data-cup]").forEach(b=>b.onclick=async()=>{const id=b.dataset.cup,now=new Date().toISOString();
    const{error}=await sb.from("inspections").update({county_up_at:now}).eq("id",id);if(error)return toast("Couldn't mark it: "+error.message);
    const i=(RAW.insp||[]).find(x=>x.id===id);if(i)i.county_up_at=now;toast("Marked uploaded");renderOffice()});
  el.querySelectorAll("[data-ccup]").forEach(b=>b.onclick=async()=>{const id=b.dataset.ccup,now=new Date().toISOString();
    if(!confirm("Mark this certificate as uploaded to the county?"))return;
    const{error}=await sb.from("jobs").update({cert_up_at:now}).eq("id",id);if(error)return toast("Couldn't mark it: "+error.message);
    const j=(RAW.jobs||[]).find(x=>x.id===id);if(j)j.cert_up_at=now;toast("Certificate marked uploaded");renderOffice()});
  const sn=el.querySelector("#sig_new");if(sn)sn.onclick=ctySigPad}

/* ---- one-time signature pad ---- */
function ctySigPad(){const ov=document.createElement("div");ov.className="sigov";ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");ov.setAttribute("aria-label","Sign once");
  ov.innerHTML=`<div class="sigbox"><h2>Sign once</h2><p class="m">Sign with your finger or Apple Pencil. This goes on every county form the app makes.</p>
    <canvas id="sigc" width="1200" height="360" aria-label="Signature area"></canvas>
    <div class="sigbtns"><button class="edbtn" id="sig_clear">Clear</button><button class="edbtn" id="sig_cancel">Cancel</button><button class="edbtn" id="sig_save" style="background:var(--maroon);color:#fff;border-color:var(--maroon)">Save signature</button></div></div>`;
  document.body.appendChild(ov);const c=ov.querySelector("#sigc"),x=c.getContext("2d");let draw=false,inked=false,last=null;
  x.lineWidth=5;x.lineCap="round";x.lineJoin="round";x.strokeStyle="#0d2680";
  const pt=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}};
  c.onpointerdown=e=>{draw=true;last=pt(e);c.setPointerCapture(e.pointerId);e.preventDefault()};
  c.onpointermove=e=>{if(!draw)return;const p=pt(e);x.beginPath();x.moveTo(last.x,last.y);x.lineTo(p.x,p.y);x.stroke();last=p;inked=true;e.preventDefault()};
  c.onpointerup=c.onpointercancel=()=>{draw=false};
  ov.querySelector("#sig_clear").onclick=()=>{x.clearRect(0,0,c.width,c.height);inked=false};
  ov.querySelector("#sig_cancel").onclick=()=>ov.remove();
  ov.querySelector("#sig_save").onclick=async e=>{if(!inked)return toast("Sign in the box first.");const btn=e.target;btn.disabled=true;btn.textContent="Saving…";
    const d=x.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;
    for(let yy=0;yy<c.height;yy++)for(let xx=0;xx<c.width;xx++)if(d[(yy*c.width+xx)*4+3]){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy}
    const pad=8,w=Math.min(c.width,x1-x0+pad*2),h=Math.min(c.height,y1-y0+pad*2),o=document.createElement("canvas");o.width=w;o.height=h;
    o.getContext("2d").drawImage(c,Math.max(0,x0-pad),Math.max(0,y0-pad),w,h,0,0,w,h);
    const blob=await new Promise(r=>o.toBlob(r,"image/png"));
    const{error}=await sb.storage.from(BUCKET).upload(SIG_PATH,blob,{upsert:true,contentType:"image/png",cacheControl:"0"});
    if(error){btn.disabled=false;btn.textContent="Save signature";return toast("Couldn't save: "+error.message)}
    SIG_BYTES=new Uint8Array(await blob.arrayBuffer());SIG_STATE="yes";ov.remove();toast("Signature saved");renderOffice()}}

/* ---- job Inspection tab: owner + Site RE # ---- */
function ctyJobFields(j){const jb=(RAW.jobs||[]).find(x=>x.id===j.jobId)||{};const need=ctyMonroe(jb);const cj=ctyJur(jb);const opts=JURS.includes(cj)?JURS:[...JURS,cj];
  return`<dt>Jurisdiction</dt><dd><select class="jin" id="ji_jur" aria-label="Jurisdiction">${opts.map(o=>`<option${o===cj?" selected":""}>${esc(o)}</option>`).join("")}</select><br><span class="m" style="font-size:12.5px">${cj==="Monroe County"?"County forms: Monroe's own pages.":"County forms: AIS letterhead, addressed to "+esc(cj)+"."}</span></dd><dt>Owner</dt><dd><input class="jin" id="ji_owner" value="${esc(jb.owner_name||"")}" placeholder="Owner name" aria-label="Owner name"></dd>
    <dt>Site RE #</dt><dd><input class="jin" id="ji_re" value="${esc(jb.parcel_re||"")}" placeholder="e.g. 00123456-000100" aria-label="Site RE number" style="font-family:var(--mono)">
    <button class="edbtn" id="ji_save" data-job="${esc(j.jobId)}" style="margin-left:6px">Save</button>${need&&(!jb.owner_name||!jb.parcel_re)?`<br><span class="ctyflag">Needed for the Monroe county forms.</span>`:""}</dd>`}
document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("#ji_save");if(!b)return;
  const id=b.dataset.job,f={owner_name:$("#ji_owner").value.trim()||null,parcel_re:$("#ji_re").value.trim()||null,jurisdiction:$("#ji_jur").value};
  b.disabled=true;b.textContent="Saving…";const{error}=await sb.from("jobs").update(f).eq("id",id);b.disabled=false;b.textContent="Save";
  if(error)return toast("Couldn't save: "+error.message);const jb=(RAW.jobs||[]).find(x=>x.id===id);if(jb)Object.assign(jb,f);
  JOBS.forEach(x=>{if(x.jobId===id){x.owner=f.owner_name||"";x.jur=f.jurisdiction}});toast("Saved for the county forms");if(typeof render==="function")render()});

/* ---- AIS-letterhead copy of the county forms, for City of Key West, other cities, Collier and Lee ---- */
const AIS_C={maroon:[.427,.157,.176],black:[.078,.078,.078],slate:[.239,.29,.361],gray:[.35,.37,.42],ink:[.08,.08,.1],blue:[.05,.15,.55]};
async function ctyAisPage(L,doc,jurName,title){const pg=doc.addPage([612,792]);const H=792;
  const F={r:await doc.embedFont(L.StandardFonts.Helvetica),b:await doc.embedFont(L.StandardFonts.HelveticaBold),i:await doc.embedFont(L.StandardFonts.HelveticaOblique)};
  const C=a=>L.rgb(a[0],a[1],a[2]);
  const T=(x,top,s,o={})=>pg.drawText(String(s??""),{x,y:H-top,size:o.size||9,font:o.b?F.b:o.i?F.i:F.r,color:C(o.c||AIS_C.ink)});
  const TC=(top,s,o={})=>{const f=o.b?F.b:o.i?F.i:F.r,sz=o.size||9;T(306-f.widthOfTextAtSize(String(s),sz)/2,top,s,o)};
  const R=(x,top,w,h,o={})=>pg.drawRectangle({x,y:H-top-h,width:w,height:h,color:o.fill?C(o.fill):undefined,borderColor:o.line?C(o.line):undefined,borderWidth:o.line?(o.lw||.8):0});
  const Ln=(x1,t1,x2,t2,w=.8)=>pg.drawLine({start:{x:x1,y:H-t1},end:{x:x2,y:H-t2},thickness:w,color:C(AIS_C.black)});
  const W=(x,top,text,width,o={})=>{const f=o.b?F.b:o.i?F.i:F.r,sz=o.size||8.5,lh=o.lh||sz*1.25;const lines=ctyWrap(text,f,sz,width);lines.forEach((ln,k)=>T(x,top+k*lh,ln,o));return top+lines.length*lh};
  const BOX=(x,top,on)=>{R(x,top,11,11,{line:AIS_C.black,lw:1});if(on){pg.drawLine({start:{x:x+2,y:H-top-2},end:{x:x+9,y:H-top-9},thickness:1.6,color:C(AIS_C.blue)});pg.drawLine({start:{x:x+2,y:H-top-9},end:{x:x+9,y:H-top-2},thickness:1.6,color:C(AIS_C.blue)})}};
  // letterhead
  R(36,30,92,40,{fill:AIS_C.maroon});T(52,61,"AIS",{b:1,size:26,c:[1,1,1]});
  R(128,30,448,40,{fill:AIS_C.black});T(142,55,"AFTERMATH INSPECTION SERVICES LLC",{b:1,size:15,c:[1,1,1]});
  R(36,70,540,14,{fill:AIS_C.slate});TC(80,"PRIVATE PROVIDER INSPECTION AND PLAN REVIEW  ·  FLORIDA STATUTES 553.791",{b:1,size:7.5,c:[1,1,1]});
  TC(97,`${PP.addr}  ·  ${PP.phone}  ·  ${PP.email}  ·  aftermathinspections.com`,{size:8,c:AIS_C.gray});
  TC(124,title,{b:1,size:15});TC(141,"Submitted to: "+jurName+" Building Department",{b:1,size:10,c:AIS_C.maroon});
  T(36,784,"AIS private provider form · same fields and certification as the Monroe County Building Department private provider form",{size:6.5,c:AIS_C.gray});
  return{pg,F,T,TC,R,Ln,W,BOX,H}}
function ctyAisInfo(k,top,job,date){const{T,R,Ln,W,F}=k;const rows=[["Permit #",job.permit,"Date:",date],["Site Address:",[job.address,job.area].filter(Boolean).join(", ")+", FL","Site RE #:",job.parcel_re],["Owner Name:",job.owner_name,"Contractor:",job.contractor],["Private Provider Firm:",PP.firm,"Private Provider Name:",PP.name],["Private Provider Address:",PP.addr,"Florida License, Registration or Certificate #:",PP.lic],["Private Provider Telephone:",PP.phone,"Private Provider Email Address:",PP.email]];
  const rh=23;R(36,top,540,rh*rows.length,{line:AIS_C.black});Ln(306,top,306,top+rh*rows.length);
  rows.forEach((r,i)=>{const t=top+i*rh;if(i)Ln(36,t,576,t,.6);
    [[40,r[0],r[1]],[310,r[2],r[3]]].forEach(([x,lab,val])=>{const ls=ctyWrap(lab,F.b,6.6,92);ls.slice(0,3).forEach((l,j)=>T(x,t+8+j*7,l,{b:1,size:6.6}));
      T(x+96,t+14,ctyFit(val||"",F.r,8.5,164),{size:8.5,c:AIS_C.blue})})});
  return top+rh*rows.length}
async function ctyAisReport(insp,jurName){const L=await ctyLib();const job=(RAW.jobs||[]).find(j=>j.id===insp.job_id)||{};const doc=await L.PDFDocument.create();
  const k=await ctyAisPage(L,doc,jurName,"PRIVATE PROVIDER INSPECTION REPORT");const{T,W,BOX,Ln,R,F,pg,H}=k;const date=ctyD(insp.done_at||insp.scheduled_date);
  let y=W(36,160,"At the completion of each inspection the private provider shall provide the record on this form to the local building official. These inspection records shall reflect those inspections required by the applicable codes of each phase of construction for which permitting by the building department is required.",540,{size:8.5});
  y=ctyAisInfo(k,y+5,job,date)+16;
  T(36,y,"Inspection Code:",{b:1,size:10});T(122,y,insp.code||"",{b:1,size:10,c:AIS_C.blue});T(320,y,"Inspection Date:",{b:1,size:10});T(406,y,date,{b:1,size:10,c:AIS_C.blue});
  y+=15;T(36,y,"Type of Inspection:",{b:1,size:10});T(136,y,ctyFit(insp.name||"",F.b,10,430),{b:1,size:10,c:AIS_C.blue});
  const pap=ctyPapers(job,insp.done_at);
  y+=17;T(36,y,"CONTRACTOR(S) ON PERMIT:",{b:1,size:9});
  BOX(40,y+6,pap.state!=="no");y=W(58,y+15,"YES, all contractors on the permit are currently active; business tax, state/county license, liability insurance and worker's compensation are current.",515,{size:8.5,b:1});
  BOX(40,y+1,pap.state==="no");y=W(58,y+10,"NO, there are one or more contractors on the permit that are inactive; business tax, state/county license, liability insurance and worker's compensation are NOT current. If NO, the inspection will be cancelled until all contractors become current on the permit and the Inspection Report resubmitted.",515,{size:8.5,b:1});
  y+=5;T(36,y,"CERTIFICATE OF ELEVATION:",{b:1,size:9});
  y=W(36,y+12,"Does passed inspection (for new construction or elevated additions) establish the lowest floor elevation in AE flood zones or the bottom of the lowest horizontal structural member in VE zones?",540,{size:8.5,b:1});
  BOX(40,y+1,false);y=W(58,y+10,"YES - Preliminary Certificate of Elevation will be required within 21 days of this passed inspection. NO FURTHER INSPECTIONS WILL BE ALLOWED TO BE SCHEDULED after 21 days unless a Preliminary Certificate of Elevation has been received and approved by the Floodplain Management staff.",515,{size:8.5,b:1});
  BOX(40,y+1,true);T(58,y+10,"NO, not required at this time.",{b:1,size:8.5});y+=25;
  T(36,y,"INSPECTION RESULT:",{b:1,size:10});y+=8;const rs=insp.result;
  [["Passed",40,"pass"],["Failed (Reason Required)",150,"fail"],["Incomplete",330,"partial"],["Cancelled",450,"cancelled"]].forEach(([lab,x,key])=>{BOX(x,y,rs===key);T(x+16,y+9,lab,{b:1,size:9.5})});
  y+=25;T(36,y,"FAIL REASON w/ FBC cited:",{b:1,size:8.5});y+=5;R(36,y,540,62,{line:AIS_C.black});
  if(rs&&rs!=="pass"){let ls=ctyWrap(insp.corrections||insp.notes||"",F.r,8,528);if(ls.length>6){ls=ls.slice(0,6);ls[5]=ctyFit(ls[6],F.r,8,420)+" … (full list on AIS report)"}ls.forEach((l,j)=>T(42,y+11+j*9.6,l,{size:8,c:AIS_C.blue}))}
  y+=74;y=W(36,y,"I hereby certify that the above-referenced inspection has been completed in conformance with the approved plans and the applicable codes.",540,{b:1,size:8.5});
  y+=14;T(36,y,"By:",{b:1,size:10});Ln(58,y+2,330,y+2);T(64,y-1,PP.byLine,{b:1,size:10,c:AIS_C.blue});T(150,y+10,"(Print Name)",{size:6.5});T(400,y,"SEAL",{b:1,size:10});
  y+=27;T(36,y,"Certified:",{b:1,size:10});Ln(86,y+2,330,y+2);T(190,y+10,"(Signature)",{size:6.5});
  const sig=await ctySig();if(sig){const im=await doc.embedPng(sig);const h=22,w=Math.min(200,im.width*h/im.height);pg.drawImage(im,{x:92,y:H-y-1,width:w,height:h})}
  return doc.save()}
async function ctyAisCert(jobId,jurName){const L=await ctyLib();const job=(RAW.jobs||[]).find(j=>j.id===jobId)||{};
  const passed=(RAW.insp||[]).filter(i=>i.job_id===jobId&&i.result==="pass"&&i.done_at).sort((a,b)=>String(a.done_at).localeCompare(String(b.done_at)));
  const doc=await L.PDFDocument.create();const sig=await ctySig();const im=sig?await doc.embedPng(sig):null;const today=ctyD(new Date().toISOString());
  const per=28,pages=Math.max(1,Math.ceil(passed.length/per));
  for(let p=0;p<pages;p++){const k=await ctyAisPage(L,doc,jurName,"PRIVATE PROVIDER CERTIFICATE OF INSPECTION(s)/COMPLIANCE");const{T,W,R,Ln,F,pg,H}=k;
    let y=W(36,160,"Upon completion of all required inspections the private provider shall prepare a Certificate of Inspection(s)/Compliance, summarizing all required inspections (see Section 105 of the Florida Building Code for minimum required inspections) performed and including a written representation, under oath, that the stated inspections have been performed and that the building construction inspected complies with the approved plans and applicable codes.",540,{size:8});
    y=ctyAisInfo(k,y+5,job,today)+12;
    y=W(36,y,"To the best of my knowledge and belief, as a private provider, as authorized in s. 553.791, Florida Statutes; the building components and site improvements outlined herein and inspected under my authority have been completed in conformance with the approved plans and applicable codes and standards, as well as all related permit documents. In the event of a conflict between codes and documents, the more restrictive have applied. I further certify that the structure, electrical, gas, mechanical and plumbing systems (as applicable) have been erected in accordance with requirements of the technical codes, and that if required the Certificates of Elevation have been submitted in a timely manner and approved. I affirm that I am qualified under F.S. s. 553.791 to provide building inspection services as authorized by s. 553.791, Florida Statutes. It is understood that the undersigned hereby accepts the responsibility for performing all of the required inspections identified in this document. I certify that ALL inspections were performed (and passed) as detailed in Section 105 of the Florida Building Code, the permit card, and as prescribed by the local authority having jurisdiction.",540,{size:7.8,lh:9.6})+6;
    const top=y,rh=11.5,cols=[36,246,306,516,576];R(36,top,540,14+rh*14,{line:AIS_C.black});
    pg.drawRectangle({x:36,y:H-top-14,width:540,height:14,color:L.rgb(.92,.91,.89)});
    [["INSPECTION TYPE",40],["DATE",250],["INSPECTION TYPE",310],["DATE",520]].forEach(([s2,x])=>T(x,top+10,s2,{b:1,size:7.5}));
    cols.slice(1,4).forEach(x=>Ln(x,top,x,top+14+rh*14,.6));for(let r=0;r<=14;r++)Ln(36,top+14+r*rh,576,top+14+r*rh,.4);
    passed.slice(p*per,(p+1)*per).forEach((i,n)=>{const c=n<14?0:1,t=top+14+(n%14)*rh+8.5;T(c?310:40,t,ctyFit([i.code,i.name].filter(Boolean).join(" "),F.r,7.8,c?200:200),{size:7.8,c:AIS_C.blue});T(c?520:250,t,ctyD(i.done_at),{size:7.8,c:AIS_C.blue})});
    y=top+14+rh*14+11;T(36,y,pages>1?`Page ${p+1} of ${pages}. Inspections continue on the next page.`:"All passed inspections on this permit are listed above.",{i:1,size:7.5});
    y+=18;T(36,y,"Building Code Administrator / Architect / Engineer, Inspector as recognized s. 553.791 F.S.:",{b:1,size:8.5});
    y+=26;Ln(36,y+2,296,y+2);Ln(316,y+2,576,y+2);T(40,y-1,PP.certName,{b:1,size:8.5,c:AIS_C.blue});
    if(im){const h=24,w=Math.min(240,im.width*h/im.height);pg.drawImage(im,{x:322,y:H-y+1,width:w,height:h})}
    T(40,y+10,"PRINTED NAME OF Building Code Administrator / Architect / Engineer, Inspector",{size:6});T(320,y+10,"SIGNATURE OF Building Code Administrator / Architect / Engineer",{size:6});
    y+=28;T(36,y,"(DATE)",{b:1,size:8.5});Ln(70,y+2,250,y+2);T(76,y-1,today,{size:8.5,c:AIS_C.blue});T(316,y,"(PHONE #:)",{b:1,size:8.5});Ln(368,y+2,576,y+2);T(374,y-1,PP.phone,{size:8.5,c:AIS_C.blue})}
  return doc.save()}
async function ctyReportPdf(insp){const j=(RAW.jobs||[]).find(x=>x.id===insp.job_id)||{};return ctyOfficial(j)?ctyMonroeReport(insp):ctyAisReport(insp,ctyJur(j))}
async function ctyCertPdf(jobId){const j=(RAW.jobs||[]).find(x=>x.id===jobId)||{};return ctyOfficial(j)?ctyMonroeCert(jobId):ctyAisCert(jobId,ctyJur(j))}

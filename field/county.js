/* AIS Field: Monroe County private provider paperwork.
   Fills the county's own form pages (forms/monroe-report.pdf, forms/monroe-cert.pdf)
   with job + inspection data and Luigi's signature, then hands back a PDF to upload to Oracle. */
const PP={firm:"Aftermath Inspection Services LLC",name:"Luigi Vaccaro",addr:"Summerland Key, FL 33042",
  lic:"BU2239 (Bldg Code Admin) / BN7700",phone:"305-900-7529",email:"Luigi@aftermathinspections.com",
  byLine:"LUIGI VACCARO, BU2239",certName:"LUIGI VACCARO, Building Code Administrator BU2239"};
const SIG_PATH="sig/signature.png";
const FINAL_CODES=/^(199|291|292|293|294|295|296|297|399|499|599|699|798|799|891|892)$/;
let SIG_STATE=null, SIG_BYTES=null, CTY_BUSY=null;

const ctyMonroe=j=>((j&&j.county)||"Monroe")==="Monroe";
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

async function ctyReportPdf(insp){const L=await ctyLib();const job=(RAW.jobs||[]).find(j=>j.id===insp.job_id)||{};
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

async function ctyCertPdf(jobId){const L=await ctyLib();const job=(RAW.jobs||[]).find(j=>j.id===jobId)||{};
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
    return`<li><div><b>${esc(j.address||"")}</b> · ${esc([i.code,i.name].filter(Boolean).join(" "))}<br><span class="m">Permit ${esc(j.permit||"")} · ${ctyD(i.done_at)} · <b style="color:${RC[i.result]||"inherit"}">${RL[i.result]||esc(i.result)}</b></span>
      ${m.length?`<br><span class="ctyflag">Missing ${m.join(" and ")}. Add it on the job's Inspection tab.</span>`:""}
      ${p.state==="no"?`<br><span class="ctyflag red">Contractor papers: ${esc(p.why)}. Form says NO; county will cancel until current.</span>`:p.state==="unknown"?`<br><span class="ctyflag">Contractor papers: ${esc(p.why)}. Form says YES; check before uploading.</span>`:""}</div>
      <div class="cbtns"><button class="edbtn" data-crep="${esc(i.id)}">${CTY_BUSY===i.id?"Making PDF…":"View / Download"}</button><button class="edbtn" data-cup="${esc(i.id)}">Mark uploaded</button></div></li>`}).join("");
  const certLi=certs.map(j=>{const ps=ins.filter(i=>i.job_id===j.id&&i.result==="pass"&&i.done_at),fin=ps.some(ctyIsFinal),m=miss(j);
    return`<li><div><b>${esc(j.address||"")}</b> · Permit ${esc(j.permit||"")}<br><span class="m">${ps.length} passed inspection${ps.length===1?"":"s"} listed · </span>${fin?`<b style="color:var(--pass)">READY: final passed</b>`:`<span class="m">running list, not final yet</span>`}
      ${m.length?`<br><span class="ctyflag">Missing ${m.join(" and ")}.</span>`:""}</div>
      <div class="cbtns"><button class="edbtn" data-ccert="${esc(j.id)}">${CTY_BUSY===j.id?"Making PDF…":"View / Download"}</button>${fin?`<button class="edbtn" data-ccup="${esc(j.id)}">Mark uploaded</button>`:""}</div></li>`}).join("");
  return`<div class="oc wide"><h3>County reports to upload (${reps.length})</h3>${sigRow}${reps.length?`<ul class="olist">${repLi}</ul><p class="m" style="margin:8px 0 0;font-size:13px;color:var(--mute)">Monroe: upload each report to the permit in Oracle (Online Permitting). Legacy permits: email to upperkeysinspections or lowerkeysinspections within 2 business days.</p>`:`<p class="oempty">Nothing to upload. Every Monroe inspection report is in.</p>`}</div>
  <div class="oc wide"><h3>Certificates of compliance (${certs.length})</h3>${certs.length?`<ul class="olist">${certLi}</ul><p class="m" style="margin:8px 0 0;font-size:13px;color:var(--mute)">Each job's certificate adds a line every time an inspection passes. When the final passes: schedule "Private Provider Certificate of Inspection Compliance" on the permit, then upload this.</p>`:`<p class="oempty">No Monroe jobs with passed inspections yet.</p>`}</div>`}

function ctyBind(el){ctyCheckSig();
  el.querySelectorAll("[data-crep]").forEach(b=>b.onclick=async()=>{const i=(RAW.insp||[]).find(x=>x.id===b.dataset.crep);if(!i||CTY_BUSY)return;CTY_BUSY=i.id;b.textContent="Making PDF…";
    try{const j=(RAW.jobs||[]).find(x=>x.id===i.job_id)||{};ctySave(await ctyReportPdf(i),`Monroe-PP-Report_${ctyFile(j.permit)}_${ctyFile(i.code||"insp")}_${ctyD(i.done_at).replace(/\//g,"-")}.pdf`)}
    catch(e){console.error(e);toast("Couldn't make the PDF: "+(e.message||e))}CTY_BUSY=null;renderOffice()});
  el.querySelectorAll("[data-ccert]").forEach(b=>b.onclick=async()=>{const id=b.dataset.ccert;if(CTY_BUSY)return;CTY_BUSY=id;b.textContent="Making PDF…";
    try{const j=(RAW.jobs||[]).find(x=>x.id===id)||{};ctySave(await ctyCertPdf(id),`Monroe-PP-Certificate_${ctyFile(j.permit)}.pdf`)}
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
function ctyJobFields(j){const jb=(RAW.jobs||[]).find(x=>x.id===j.jobId)||{};const need=ctyMonroe(jb);
  return`<dt>Owner</dt><dd><input class="jin" id="ji_owner" value="${esc(jb.owner_name||"")}" placeholder="Owner name" aria-label="Owner name"></dd>
    <dt>Site RE #</dt><dd><input class="jin" id="ji_re" value="${esc(jb.parcel_re||"")}" placeholder="e.g. 00123456-000100" aria-label="Site RE number" style="font-family:var(--mono)">
    <button class="edbtn" id="ji_save" data-job="${esc(j.jobId)}" style="margin-left:6px">Save</button>${need&&(!jb.owner_name||!jb.parcel_re)?`<br><span class="ctyflag">Needed for the Monroe county forms.</span>`:""}</dd>`}
document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("#ji_save");if(!b)return;
  const id=b.dataset.job,f={owner_name:$("#ji_owner").value.trim()||null,parcel_re:$("#ji_re").value.trim()||null};
  b.disabled=true;b.textContent="Saving…";const{error}=await sb.from("jobs").update(f).eq("id",id);b.disabled=false;b.textContent="Save";
  if(error)return toast("Couldn't save: "+error.message);const jb=(RAW.jobs||[]).find(x=>x.id===id);if(jb)Object.assign(jb,f);
  JOBS.forEach(x=>{if(x.jobId===id)x.owner=f.owner_name||""});toast("Saved for the county forms")});

/* global Core, browser */
const DEFAULT={colorPresetVersion:1,enabled:true,start:'',end:'',semesters:[],categoryInTitle:true,
  colors:{'G-CPE-110':'#01ca7a','G-PSU-100':'#013afb','G-MUL-100':'4','G-MAT-100':'#013afb','G-ENG-100':'#e03131','G-COM-100':'7','G-PRO-100':'2','S-ADM-000':'#099268'}};
const SCOPE='https://www.googleapis.com/auth/calendar.app.created openid email';
const BASE='https://www.googleapis.com/calendar/v3';
let running=null, authRunning=null, lastAttempt=0, activeVisit=false;
const get=async key=>(await browser.storage.local.get(key))[key];
const put=async (key,value)=>browser.storage.local.set({[key]:value});
async function config(){
  const saved=await get('config');
  if(!saved)return {...DEFAULT,colors:{...DEFAULT.colors}};
  const cfg={...DEFAULT,...saved,colors:{...DEFAULT.colors,...saved.colors}};
  if(saved.colorPresetVersion!==DEFAULT.colorPresetVersion){
    const previous={'G-CPE-110':'9','G-PSU-100':'6','G-MUL-100':'3','G-MAT-100':'5','G-ENG-100':'10','S-ADM-000':'8'};
    for(const [code,value] of Object.entries(previous)){
      if(saved.colors?.[code]===value)cfg.colors[code]=DEFAULT.colors[code];
    }
    cfg.colorPresetVersion=DEFAULT.colorPresetVersion;
    await put('config',cfg);
  }
  return cfg;
}
async function status(text,error=false) {
  await put('status',{text,error,at:new Date().toISOString()});
  await browser.browserAction.setBadgeText({text:error?'!':running?'…':''});
  await browser.browserAction.setBadgeBackgroundColor({color:error?'#c23945':'#4765dc'});
}
function random(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
function redirect(){return 'http://127.0.0.1/mozoauth2/'+new URL(browser.identity.getRedirectURL()).hostname.split('.')[0];}
async function timedFetch(url,opts={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{return await fetch(url,{...opts,signal:controller.signal,redirect:'error'});}finally{clearTimeout(timer);}
}
async function tokenExchange(params) {
  const res=await timedFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
  const data=await res.json();
  if(!res.ok || !data.access_token) throw new Error('Connexion Google à renouveler dans les paramètres'+(data.error?` (${data.error}).`:'.'));
  return data;
}
async function googleToken(interactive=false) {
  if(authRunning) return authRunning;
  authRunning=(async()=>{
    const cred=await get('credentials');
    if(!cred?.client_id) throw new Error('Importer le JSON OAuth Google dans les paramètres.');
    const old=await get('google');
    if(!interactive && old?.access_token && old.expiresAt>Date.now()+60000) return old.access_token;
    let data;
    if(!interactive && old?.refresh_token) {
      data=await tokenExchange({client_id:cred.client_id,client_secret:cred.client_secret||'',grant_type:'refresh_token',refresh_token:old.refresh_token});
    } else if(interactive) {
      const state=random(),verifier=random();
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
      const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const uri=redirect();
      const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search=new URLSearchParams({client_id:cred.client_id,redirect_uri:uri,response_type:'code',scope:SCOPE,
        state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account'}).toString();
      const result=new URL(await browser.identity.launchWebAuthFlow({url:url.href,interactive:true}));
      if(result.origin!==new URL(uri).origin || result.pathname!==new URL(uri).pathname || result.searchParams.get('state')!==state) throw new Error('Réponse OAuth Google invalide.');
      const code=result.searchParams.get('code');
      if(!code) throw new Error('Autorisation Google annulée ou refusée.');
      data=await tokenExchange({client_id:cred.client_id,client_secret:cred.client_secret||'',grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:uri});
      // Ne jamais réutiliser le refresh_token d'un autre compte sélectionné.
      if(!data.refresh_token) throw new Error('Google n’a pas fourni d’accès hors ligne. Révoquer puis reconnecter cette application.');
    } else throw new Error('Connecter Google dans les paramètres.');
    const infoRes=await timedFetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+data.access_token}});
    if(!infoRes.ok) throw new Error('Impossible de vérifier le compte Google.');
    const info=await infoRes.json();
    if(!info.sub) throw new Error('Identité Google absente.');
    await put('google',{...data,refresh_token:data.refresh_token||old?.refresh_token,expiresAt:Date.now()+data.expires_in*1000,sub:info.sub,email:info.email||''});
    return data.access_token;
  })();
  try{return await authRunning;}finally{authRunning=null;}
}
async function google(path,options={},retried=false) {
  const token=await googleToken(false);
  let response;
  for(let i=0;i<5;i++) {
    response=await timedFetch(BASE+path,{method:options.method||'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});
    if(![429,500,502,503,504].includes(response.status)) break;
    await new Promise(r=>setTimeout(r,Math.min(16000,1000*2**i)));
  }
  if(response.status===401 && !retried){const old=await get('google');await put('google',{...old,expiresAt:0});return google(path,options,true);}
  if(!response.ok){const e=new Error(`Google Calendar : HTTP ${response.status}.`);e.status=response.status;throw e;}
  return response.status===204?{}:response.json();
}
async function loadMy(session,cfg) {
  const c=Core.claims(session.token);
  if(c.exp*1000<=Date.now()+15000) throw new Error('Session My expirée : recharge My et reconnecte-toi si nécessaire.');
  const range=Core.dates(c,cfg),all=new Map(),semesters=cfg.semesters.length?cfg.semesters:[c.semester||1];
  const spans=Core.weeks(range.start,range.end);
  for(let i=0;i<spans.length;i++) {
    await status(`Lecture My : semaine ${i+1}/${spans.length}…`);
    for(const semester of semesters) {
      const params=new URLSearchParams({semester,cursus:c.cursus||'PGE',startDate:spans[i][0],endDate:spans[i][1]});
      let res;
      for(let attempt=0;attempt<4;attempt++) {
        res=await timedFetch('https://my.epitech.eu/api/events?'+params,{headers:{Authorization:'Bearer '+session.token,Accept:'application/json'},credentials:'omit'});
        if(![429,500,502,503,504].includes(res.status))break;
        await new Promise(r=>setTimeout(r,1000*2**attempt));
      }
      if(res.status===401 || res.status===403)throw new Error('Accès My refusé : recharge la page My pour renouveler la session.');
      if(!res.ok)throw new Error(`My : HTTP ${res.status}. Aucune écriture Google effectuée.`);
      const data=await res.json();
      if(!Array.isArray(data))throw new Error('Format API My inattendu.');
      for(const e of data) {
        Core.validEvent(e);
        const key=String(e.id);
        if(all.has(key) && Core.stable(all.get(key))!==Core.stable(e))throw new Error(`Identifiant My ambigu : ${key}.`);
        all.set(key,e);
      }
    }
  }
  return {events:[...all.values()],claims:c};
}
async function perform(force) {
  const cfg=await config(),session=await get('mySession');
  if(!session)throw new Error('Ouvre My Epitech en étant connecté pour récupérer la session.');
  if(!force && !cfg.enabled)return;
  const claim=Core.claims(session.token);
  await googleToken(false);
  const identity=await get('google');
  const credential=await get('credentials');
  const account=await Core.hash(claim.login),key=await Core.hash(credential.client_id+':'+identity.sub+':'+account);
  const today=Core.day(),success=await get('success')||{};
  if(!Core.due(success[key]?.day,today,force)){await status('Déjà synchronisé aujourd’hui.');return;}
  const source=await loadMy(session,cfg);
  // Construire tous les événements avant la première mutation distante.
  const paletteResult=await google('/colors');
  const palette=Object.fromEntries(Object.entries(paletteResult.event).map(([id,c])=>[id,c.background]));
  const bodies=await Promise.all(source.events.map(e=>Core.eventBody(e,cfg,account,palette)));
  const calendars=await get('calendars')||{};
  let calendarId=calendars[key];
  if(!calendarId && bodies.length) {
    const created=await google('/calendars',{method:'POST',body:{summary:'Epitech — My',description:'Planning copié depuis My Epitech.',timeZone:'Europe/Paris'}});
    calendarId=created.id;calendars[key]=calendarId;await put('calendars',calendars);
  }
  const counts={created:0,updated:0,unchanged:0};
  if(calendarId) {
    const path='/calendars/'+encodeURIComponent(calendarId)+'/events',existing=new Map();
    let page;
    do {
      const query=new URLSearchParams({maxResults:2500,showDeleted:false});
      query.append('privateExtendedProperty','managedBy=my-firefox-v1');query.append('privateExtendedProperty','myAccount='+account);
      if(page)query.set('pageToken',page);
      const result=await google(path+'?'+query);
      for(const event of result.items||[]){const id=event.extendedProperties?.private?.myId;if(existing.has(id))throw new Error('Doublons gérés existants : corriger avant de reprendre.');existing.set(id,event);}
      page=result.nextPageToken;
    }while(page);
    for(let i=0;i<bodies.length;i++) {
      await status(`Google : événement ${i+1}/${bodies.length}…`);
      const body=bodies[i],props=body.extendedProperties.private,old=existing.get(props.myId);
      if(old?.extendedProperties?.private?.sourceHash===props.sourceHash){counts.unchanged++;continue;}
      if(old){await google(path+'/'+encodeURIComponent(old.id)+'?sendUpdates=none',{method:'PATCH',body});counts.updated++;}
      else {
        const id='ef'+await Core.hash(account+':'+props.myId);
        try{await google(path+'?sendUpdates=none',{method:'POST',body:{...body,id}});counts.created++;}
        catch(e){
          if(e.status!==409)throw e;
          const found=await google(path+'/'+id);
          if(found.extendedProperties?.private?.managedBy!=='my-firefox-v1' || found.extendedProperties?.private?.myAccount!==account)throw new Error('Identifiant Google déjà utilisé par un événement non géré.');
          await google(path+'/'+id+'?sendUpdates=none',{method:'PATCH',body});counts.updated++;
        }
      }
    }
  }
  success[key]={day:today,at:new Date().toISOString(),counts};await put('success',success);
  activeVisit=false;lastAttempt=0;
  await status(`Synchronisé : ${counts.created} créé(s), ${counts.updated} modifié(s), ${counts.unchanged} inchangé(s).`);
}
async function sync(force=false) {
  if(running)return running;
  if(!force && Date.now()-lastAttempt<5*60*1000)return;
  lastAttempt=Date.now();
  running=perform(force).catch(async error=>{await status(error.message,true);throw error;});
  try{return await running;}finally{running=null;await browser.browserAction.setBadgeText({text:(await get('status'))?.error?'!':''});}
}
async function visit(message,sender){
  if(sender.frameId!==0 || !sender.tab || new URL(sender.url||sender.tab.url).origin!=='https://my.epitech.eu')throw new Error('Origine My requise.');
  const current=await get('mySession');
  if(!message.session){activeVisit=true;return {ok:true};}
  if(message.session){const parsed=Core.account(message.session);if(parsed){
    const c=Core.claims(parsed.token),old=current?Core.claims(current.token):null;
    if(c.exp*1000>Date.now() && (!old || old.login!==c.login || c.exp>=old.exp))await put('mySession',parsed);
    // Un token fraîchement renouvelé peut débloquer une tentative refusée.
    if(parsed.token!==current?.token && activeVisit)lastAttempt=0;
  }}
  activeVisit=true;
  if((await config()).enabled)sync(false).catch(()=>{});
  return {ok:true};
}
browser.runtime.onMessage.addListener((m,sender)=>{
  if(m.type==='myVisit')return visit(m,sender).catch(()=>({ok:false}));
  if(!sender.url?.startsWith(browser.runtime.getURL('')))return Promise.resolve({ok:false});
  return (async()=>{
    try{
      if(m.type==='state'){
        const g=await get('google'),my=await get('mySession');let login='';try{login=my?Core.claims(my.token).login:'';}catch{}
        return {ok:true,config:await config(),credentials:!!await get('credentials'),googleEmail:g?.email||'',googleConnected:!!g?.refresh_token,myLogin:login,status:await get('status'),running:!!running,redirect:redirect()};
      }
      if(m.type==='config'){
        if(running)throw new Error('Attends la fin de la synchronisation.');
        const cfg={...DEFAULT,...m.config};Core.dates({cursusSchoolYear:2026},cfg);
        if(!Array.isArray(cfg.semesters)||cfg.semesters.some(n=>!Number.isInteger(n)||n<1||n>20))throw new Error('Semestres invalides.');
        if(!cfg.colors||typeof cfg.colors!=='object'||Array.isArray(cfg.colors))throw new Error('Couleurs : objet JSON attendu.');
        for(const k of Object.keys(cfg.colors))Core.color(k,cfg.colors);
        await put('config',cfg);return {ok:true};
      }
      if(m.type==='credentials'){
        if(running)throw new Error('Attends la fin de la synchronisation.');
        const c=m.data?.installed;
        if(!c?.client_id?.endsWith('.apps.googleusercontent.com'))throw new Error('JSON Google Desktop attendu (champ installed.client_id).');
        const old=await get('credentials');await put('credentials',{client_id:c.client_id,client_secret:c.client_secret||''});
        if(old?.client_id!==c.client_id)await browser.storage.local.remove('google');
        return {ok:true};
      }
      if(m.type==='connect') {if(running)throw new Error('Attends la fin de la synchronisation.');await googleToken(true);lastAttempt=0;await status('Google connecté. Ouvre My ou force la synchronisation.');return {ok:true};}
      if(m.type==='disconnect'){if(running)throw new Error('Attends la fin de la synchronisation.');await browser.storage.local.remove('google');await status('Google déconnecté localement.');return {ok:true};}
      if(m.type==='force'){sync(true).catch(()=>{});return {ok:true};}
      return {ok:false,error:'Commande inconnue.'};
    }catch(e){return {ok:false,error:e.message};}
  })();
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Core=require('./core.js');
function token(login='test@example.org'){return 'x.'+Buffer.from(JSON.stringify({login,exp:Date.now()/1000+3600,cursusSchoolYear:2026,semester:1,cursus:'PGE'})).toString('base64url')+'.x';}
const sample={id:42,fullTitle:'Bootstrap',unitCode:'G-CPE-110',unitName:'Programmation',
  startDate:'2026-11-23T09:00:00Z',endDate:'2026-11-23T11:30:00Z',activityStartDate:'2026-11-22T00:00:00Z',
  activityDescription:'<test>',instructors:[{login:'prof@example.org'}],rooms:[{name:'Salle 1'}],otherField:{a:true}};
test('lit @account JSON simple/double sans récupérer le refresh token',()=>{
  const t=token();assert.deepEqual(Core.account(JSON.stringify(JSON.stringify({token:t,refresh_token:'never-store-this'}))),{token:t});
  assert.equal(Core.account('invalid'),null);
});
test('jour de Paris à minuit et changement heure été/hiver',()=>{
  assert.equal(Core.day(new Date('2026-10-30T23:30:00Z')),'2026-10-31');
  assert.equal(Core.day(new Date('2026-06-01T22:30:00Z')),'2026-06-02');
  assert.equal(Core.due('2026-10-31','2026-10-31'),false);
  assert.equal(Core.due('2026-10-31','2026-10-31',true),true);
});
test('périodes inclusives sans trou et dates invalides',()=>{
  assert.deepEqual(Core.weeks('2026-11-23','2026-12-01'),[['2026-11-23','2026-11-29'],['2026-11-30','2026-12-01']]);
  assert.throws(()=>Core.dates({}, {start:'2026-02-30',end:'2026-03-01'}));
});
test('détails, couleurs, horaires de séance et ID stable',async()=>{
  const body=await Core.eventBody(sample,{colors:{'G-CPE-110':'9'}},'a');
  assert.equal(body.colorId,'9');assert.equal(body.start.dateTime,'2026-11-23T09:00:00.000Z');
  assert.match(body.description,/otherField/);assert.match(body.description,/&lt;test&gt;/);
  assert.equal(body.location,'Salle 1');assert.equal(body.attendees,undefined);
  assert.equal(Core.color('x',{x:'#dc2127'}),'11');
  const next=await Core.eventBody({...sample,startDate:'2026-11-23T10:00:00Z'},{},'a');
  assert.equal(next.extendedProperties.private.myId,body.extendedProperties.private.myId);
  assert.notEqual(next.extendedProperties.private.sourceHash,body.extendedProperties.private.sourceHash);
});
function harness({googleFailure=null,grantedScope=null,emptyMy=false}={}){
  const store={credentials:{client_id:'test.apps.googleusercontent.com'},google:{access_token:'fake',refresh_token:'fake',expiresAt:Date.now()+3600000,sub:'google-user'},
    config:{start:'2026-11-23',end:'2026-11-29',semesters:[1]}};
  const records=new Map(),calls={my:0,calendar:0,insert:0,patch:0,openMy:0,removed:0,queries:[]};
  let listener,failed=false,source=structuredClone(sample);
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
  const browser={identity:{getRedirectURL:()=> 'https://extension-id.extensions.allizom.org/',launchWebAuthFlow:async({url})=>{const auth=new URL(url);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');return 'http://127.0.0.1/mozoauth2/extension-id?'+new URLSearchParams({code:'fake-code',state:auth.searchParams.get('state')});}},storage:{local:{get:async k=>({[k]:structuredClone(store[k])}),set:async obj=>Object.assign(store,structuredClone(obj)),remove:async k=>{delete store[k];}}},
    tabs:{create:async({url})=>{assert.equal(url,'https://my.epitech.eu/planning');calls.openMy++;}},
    browserAction:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:fn=>{listener=fn;}}}};
  const context=vm.createContext({Core,browser,URL,URLSearchParams,crypto,TextEncoder,btoa,AbortController,setTimeout,clearTimeout,console,
    fetch:async(url,opts)=>{
      if(url==='https://oauth2.googleapis.com/token')return response({access_token:'fake-token',refresh_token:'fake-refresh',expires_in:3600,...(grantedScope===null?{}:{scope:grantedScope})});
      if(url==='https://www.googleapis.com/oauth2/v3/userinfo')return response({sub:'google-user',email:'student@example.org'});
      if(url.startsWith('https://my.epitech.eu/')){assert.equal(new URL(url).searchParams.get('registered'),'me');calls.queries.push(new URL(url).searchParams.toString());calls.my++;await new Promise(r=>setImmediate(r));return response(emptyMy?[]:[source],failed?401:200);}
      const p=new URL(url).pathname;
      if(p.endsWith('/colors') && googleFailure)return response(googleFailure,403);
      if(p.endsWith('/colors'))return response({event:Object.fromEntries(Object.entries(Core.PALETTE).map(([k,v])=>[k,{background:v}]))});
      if(p.endsWith('/calendars')&&opts.method==='POST'){calls.calendar++;return response({id:'calendar'});}
      if(p.endsWith('/events')&&opts.method==='GET')return response({items:[...records.values()]});
      if(p.endsWith('/events')&&opts.method==='POST'){calls.insert++;const b={...JSON.parse(opts.body),etag:'mock-etag'};records.set(b.id,b);return response(b);}
      if(p.includes('/events/')&&opts.method==='DELETE'){const id=p.split('/').pop();assert.equal(opts.headers['If-Match'],records.get(id).etag);calls.removed++;records.delete(id);return new Response(null,{status:204});}
      if(p.includes('/events/')&&opts.method==='PATCH'){calls.patch++;const id=p.split('/').pop(),b={...records.get(id),...JSON.parse(opts.body)};records.set(id,b);return response(b);}
      throw Error('Unexpected mock request '+p);
    }});
  vm.runInContext(fs.readFileSync(__dirname+'/background.js','utf8'),context);
  const visit=()=>listener({type:'myVisit',session:{token:token()}},{frameId:0,url:'https://my.epitech.eu/planning',tab:{id:1}});
  const command=(m,sender={url:'moz-extension://test/options.html'})=>listener(m,sender);
  const idle=async()=>{for(let i=0;i<1000;i++){await new Promise(r=>setImmediate(r));if(!vm.runInContext('running',context))return;}throw Error('Sync did not finish');};
  return {store,calls,records,visit,command,idle,context,fail:()=>{failed=true;},move:()=>{source.startDate='2026-11-23T10:00:00Z';}};
}
test('visites simultanées : un import, puis aucun deuxième import le même jour ; bouton force met à jour',async()=>{
  const h=harness();await Promise.all([h.visit(),h.visit(),h.visit()]);await h.idle();
  assert.equal(h.calls.my,1);assert.equal(h.calls.insert,1);assert.equal(h.calls.calendar,1);
  vm.runInContext('lastAttempt=0',h.context);await h.visit();await h.idle();assert.equal(h.calls.my,1);
  h.move();await h.command({type:'force'});await h.idle();assert.equal(h.calls.my,2);assert.equal(h.calls.patch,1);assert.equal(h.records.size,1);
});
test('échec My : aucune écriture Google, jour non marqué réussi, nouvelle tentative possible',async()=>{
  const h=harness();h.fail();await h.visit();await h.idle();assert.equal(h.calls.calendar,0);assert.equal(h.store.success,undefined);assert.equal(h.store.status.error,true);
  vm.runInContext('lastAttempt=0',h.context);await h.visit();await h.idle();assert.equal(h.calls.my,2);
});
test('messages provenant de sites étrangers refusés',async()=>{
  const h=harness();const result=await h.command({type:'state'});assert.equal(result.ok,true);
  const foreign=await h.command({type:'force'},{url:'https://example.org/'});assert.equal(foreign.ok,false);
  const fakeMy=await h.command({type:'myVisit',session:{token:token()}},{url:'https://example.org/',frameId:0,tab:{id:2}});assert.equal(fakeMy.ok,false);
  // Aucun secret n'est inclus dans la réponse state destinée à l'interface.
  const json=JSON.stringify(result);assert.equal(json.includes('access_token'),false);assert.equal(json.includes('refresh_token'),false);
});
test('état à jour : exige un import du jour avec les mêmes réglages et sans erreur',()=>{
  const s={connected:true,running:false,lastSuccess:{day:'2026-10-30',settingsHash:'one'},today:'2026-10-30',settingsHash:'one'};
  assert.equal(Core.syncState(s),'fresh');
  assert.equal(Core.syncState({...s,settingsHash:'two'}),'stale');
  assert.equal(Core.syncState({...s,today:'2026-10-31'}),'stale');
  assert.equal(Core.syncState({...s,error:true}),'stale');
  assert.equal(Core.syncState({...s,running:true}),'syncing');
  assert.equal(Core.syncState({...s,connected:false}),'disconnected');
});
test('interface : état et aperçu suivent le compte actif et les réglages sauvegardés',async()=>{
  const h=harness();await h.visit();await h.idle();
  let s=await h.command({type:'state'});
  assert.equal(s.syncState,'fresh');assert.equal(s.lastSuccess.total,1);assert.equal(s.calendarEvents.length,1);
  assert.equal(s.calendarEvents[0].title,'[G-CPE-110] Bootstrap');
  h.store.config.categoryInTitle=false;
  s=await h.command({type:'state'});assert.equal(s.syncState,'stale');
  h.store.google.sub='another-google-account';
  s=await h.command({type:'state'});assert.equal(s.lastSuccess,null);assert.equal(s.calendarEvents.length,0);
  h.store.googleNeedsReconnect=true;
  s=await h.command({type:'state'});assert.equal(s.googleConnected,false);assert.equal(s.syncState,'disconnected');
});
test('un réglage modifié permet un nouvel import automatique le même jour',async()=>{
  const h=harness();await h.visit();await h.idle();
  h.store.config.categoryInTitle=false;
  await h.visit();await h.idle();
  assert.equal(h.calls.my,2);assert.equal(h.calls.patch,1);
  assert.equal(nextTitle(), 'Bootstrap');
  function nextTitle(){return [...h.records.values()][0].summary;}
});
test('connexion Google : email affiché et import automatique sans fichier ICS',async()=>{
  const h=harness();
  h.store.mySession={token:token()};
  delete h.store.google;
  const result=await h.command({type:'connect'});
  assert.equal(result.ok,true);assert.equal(result.syncStarted,true);
  await h.idle();
  assert.equal(h.calls.my,1);assert.equal(h.calls.insert,1);assert.equal(h.calls.openMy,0);
  const s=await h.command({type:'state'});
  assert.equal(s.googleConnected,true);assert.equal(s.googleEmail,'student@example.org');assert.equal(s.syncState,'fresh');
  assert.equal(h.store.syncAfterConnect,undefined);
  assert.equal((await h.command({type:'disconnect'})).ok,true);
  const disconnected=await h.command({type:'state'});
  assert.equal(disconnected.googleConnected,false);assert.equal(disconnected.googleEmail,'');assert.equal(disconnected.syncState,'disconnected');
});
test('connexion Google sans My : ouvre My puis importe à la détection de session, même sans auto quotidien',async()=>{
  const h=harness();delete h.store.google;h.store.config.enabled=false;
  const result=await h.command({type:'connect'});
  assert.equal(result.ok,true);assert.equal(result.needsMy,true);assert.equal(h.calls.openMy,1);assert.equal(h.calls.my,0);
  assert.equal(h.store.syncAfterConnect,true);
  await h.visit();await h.idle();
  assert.equal(h.calls.my,1);assert.equal(h.calls.insert,1);assert.equal(h.store.syncAfterConnect,undefined);
});

test('403 Google : distingue API désactivée, permissions et limite de requêtes',()=>{
  const disabled=Core.calendarError({error:{errors:[{reason:'accessNotConfigured'}],details:[{reason:'SERVICE_DISABLED',metadata:{consumer:'projects/123456'}}]}},403);
  assert.match(disabled.message,/désactivée/);assert.equal(disabled.reconnect,false);
  assert.equal(disabled.help.helpUrl,'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=123456');
  const missing=Core.calendarError({error:{details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}},403);
  assert.equal(missing.reconnect,true);assert.equal(missing.retryable,false);
  assert.equal(Core.calendarError({error:{errors:[{reason:'rateLimitExceeded'}]}},403).retryable,true);
  assert.equal(Core.calendarError({},403).reconnect,false);
});
test('API Calendar désactivée : message actionnable avant My et aucune écriture',async()=>{
  const h=harness({googleFailure:{error:{errors:[{reason:'accessNotConfigured'}]}}});
  await h.visit();await h.idle();
  assert.equal(h.calls.my,0);assert.equal(h.calls.calendar,0);
  assert.match(h.store.status.text,/accessNotConfigured/);assert.match(h.store.status.text,/lecture des couleurs/);
  assert.match(h.store.status.helpUrl,/calendar-json/);assert.equal(h.store.googleNeedsReconnect,undefined);
});
test('permissions Calendar refusées : affiche le besoin de reconnexion',async()=>{
  const h=harness({googleFailure:{error:{errors:[{reason:'insufficientPermissions'}]}}});
  await h.visit();await h.idle();
  const state=await h.command({type:'state'});
  assert.equal(state.googleConnected,false);assert.equal(state.syncState,'disconnected');
  assert.equal(h.calls.my,0);assert.match(state.status.text,/Reconnecte Google/);
});
test('consentement partiel : ne considère pas Google connecté sans accès Calendar',async()=>{
  const h=harness({grantedScope:'openid email'});delete h.store.google;
  const result=await h.command({type:'connect'});
  assert.equal(result.ok,false);assert.match(result.error,/autorisation Google Calendar/);
  assert.equal(h.store.googleNeedsReconnect,true);assert.equal(h.calls.my,0);
});

test('inscriptions : chaque semaine inclut registered=me, même sans événement',async()=>{
  const h=harness({emptyMy:true});h.store.config.end='2026-12-01';
  await h.visit();await h.idle();
  assert.equal(h.calls.my,2);
  for(const q of h.calls.queries)assert.equal(new URLSearchParams(q).get('registered'),'me');
  assert.equal(h.calls.insert,0);
});
test('soutenance : utilise le créneau personnel et refuse un créneau incomplet',async()=>{
  const event={...sample,activitySlotsEnabled:true,mySlotStartDate:'2026-11-23T09:15:00Z',mySlotEndDate:'2026-11-23T09:30:00Z'};
  const body=await Core.eventBody(event,{},'account');
  assert.equal(body.start.dateTime,'2026-11-23T09:15:00.000Z');
  assert.equal(body.end.dateTime,'2026-11-23T09:30:00.000Z');
  assert.match(body.description,/créneau personnel/);
  assert.throws(()=>Core.validEvent({...event,mySlotEndDate:null}));
  const global=await Core.eventBody({...sample,mySlotStartDate:null,mySlotEndDate:null},{},'account');
  assert.equal(global.end.dateTime,'2026-11-23T11:30:00.000Z');
});
test('nettoyage explicite : ne retire que les anciens imports non inscrits dans la période',async()=>{
  const h=harness();await h.visit();await h.idle();
  const original=[...h.records.values()][0];
  function seed(id,myId,changes={}){
    const copy=structuredClone(original);copy.id=id;copy.extendedProperties.private.myId=myId;
    Object.assign(copy,changes);h.records.set(id,copy);return copy;
  }
  seed('old-import','999');
  seed('outside-range','888',{start:{dateTime:'2025-09-01T09:00:00Z'}});
  seed('personally-added','777').extendedProperties.private.managedBy='another-app';
  seed('without-etag','666',{etag:undefined});
  await h.command({type:'force'});await h.idle();assert.equal(h.calls.removed,0);
  await h.command({type:'cleanup'});await h.idle();
  assert.equal(h.calls.removed,1);assert.equal(h.records.has('old-import'),false);
  for(const id of ['outside-range','personally-added','without-etag',original.id])assert.equal(h.records.has(id),true);
});
test('échec de lecture des inscriptions : aucun nettoyage possible',async()=>{
  const h=harness();await h.visit();await h.idle();
  h.fail();await h.command({type:'cleanup'});await h.idle();
  assert.equal(h.calls.removed,0);assert.equal(h.records.size,1);assert.equal(h.store.status.error,true);
});

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
function harness(){
  const store={credentials:{client_id:'test.apps.googleusercontent.com'},google:{access_token:'fake',refresh_token:'fake',expiresAt:Date.now()+3600000,sub:'google-user'},
    config:{start:'2026-11-23',end:'2026-11-29',semesters:[1]}};
  const records=new Map(),calls={my:0,calendar:0,insert:0,patch:0};
  let listener,failed=false,source=structuredClone(sample);
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
  const browser={identity:{getRedirectURL:()=> 'https://extension-id.extensions.allizom.org/'},storage:{local:{get:async k=>({[k]:structuredClone(store[k])}),set:async obj=>Object.assign(store,structuredClone(obj)),remove:async k=>{delete store[k];}}},
    browserAction:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:fn=>{listener=fn;}}}};
  const context=vm.createContext({Core,browser,URL,URLSearchParams,crypto,TextEncoder,AbortController,setTimeout,clearTimeout,console,
    fetch:async(url,opts)=>{
      if(url.startsWith('https://my.epitech.eu/')){calls.my++;await new Promise(r=>setImmediate(r));return response([source],failed?401:200);}
      const p=new URL(url).pathname;
      if(p.endsWith('/colors'))return response({event:Object.fromEntries(Object.entries(Core.PALETTE).map(([k,v])=>[k,{background:v}]))});
      if(p.endsWith('/calendars')&&opts.method==='POST'){calls.calendar++;return response({id:'calendar'});}
      if(p.endsWith('/events')&&opts.method==='GET')return response({items:[...records.values()]});
      if(p.endsWith('/events')&&opts.method==='POST'){calls.insert++;const b=JSON.parse(opts.body);records.set(b.id,b);return response(b);}
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

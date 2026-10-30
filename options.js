const $=id=>document.getElementById(id);
async function send(type,data={}) {const r=await browser.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.error||'Erreur extension.');return r;}
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
async function refresh(initial=false){
  const s=await send('state');
  $('googleState').textContent=s.googleConnected?`Google connecté : ${s.googleEmail}`:(s.credentials?'Client OAuth importé. Connecte Google.':'Aucun client OAuth importé.');
  $('myState').textContent=s.myLogin?`Session détectée : ${s.myLogin}`:'Ouvre My en étant connecté pour détecter ta session.';
  $('redirect').textContent=s.redirect;
  if(initial){for(const k of ['enabled','categoryInTitle'])$(k).checked=s.config[k];for(const k of ['start','end'])$(k).value=s.config[k];$('semesters').value=s.config.semesters.join(',');$('colors').value=JSON.stringify(s.config.colors,null,2);}
  $('force').disabled=s.running;$('connect').disabled=s.running;$('disconnect').disabled=s.running;
  if(s.status)notice(s.status.text,s.status.error);else notice('Configure Google puis ouvre My pour démarrer.');
}
function handler(id,fn){$(id).addEventListener('click',async()=>{try{await fn();await refresh();}catch(e){notice(e.message,true);}});}
$('credentials').addEventListener('change',async()=>{try{const file=$('credentials').files[0];if(!file)return;if(file.size>100000)throw new Error('Fichier OAuth trop volumineux.');await send('credentials',{data:JSON.parse(await file.text())});notice('Client Google importé.');await refresh();}catch(e){notice(e.message,true);}finally{$('credentials').value='';}});
handler('connect',async()=>{notice('Autorise la connexion dans la fenêtre Google…');await send('connect');});
handler('disconnect',()=>send('disconnect'));
handler('save',async()=>{
  const config={enabled:$('enabled').checked,categoryInTitle:$('categoryInTitle').checked,start:$('start').value,end:$('end').value,
    semesters:$('semesters').value.trim()?$('semesters').value.split(',').map(x=>Number(x.trim())):[],colors:JSON.parse($('colors').value)};
  await send('config',{config});notice('Réglages enregistrés. Force la synchronisation pour les appliquer aujourd’hui.');
});
handler('force',()=>send('force'));
handler('openMy',()=>browser.tabs.create({url:'https://my.epitech.eu/planning'}));
refresh(true).catch(e=>notice(e.message,true));
setInterval(()=>refresh().catch(()=>{}),2000);

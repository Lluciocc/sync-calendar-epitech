/* Shared popup/dashboard rendering. All event and account text stays textContent. */
(() => {
  const $=id=>document.getElementById(id);
  const fmt=(value,options)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',...options}).format(new Date(value));
  let state=null,selectedDay=Core.day(),timer,toastTimer;
  async function send(type,data={}){
    const reply=await browser.runtime.sendMessage({type,...data});
    if(!reply?.ok)throw new Error(reply?.error||'Impossible de joindre l’extension.');
    return reply;
  }
  function toast(text,error=false){
    let box=$('toast');if(!box){box=document.createElement('div');box.id='toast';box.setAttribute('role','status');document.body.append(box);}
    box.className='toast'+(error?' error':'');box.textContent=text;box.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{box.hidden=true;},5000);
  }
  function setIcon(node,name){
    const use=node.querySelector('use');if(use)use.setAttribute('href','#i-'+name);
  }
  function renderAgenda(s){
    const today=Core.day(),days=Array.from({length:7},(_,i)=>{
      const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);return Core.day(date);
    });
    if(!days.includes(selectedDay))selectedDay=today;
    const events=s.calendarEvents||[],strip=$('weekStrip');strip.replaceChildren();
    $('monthLabel').textContent=fmt(today+'T12:00:00Z',{month:'long',year:'numeric'});
    for(const day of days){
      const button=document.createElement('button');button.type='button';button.className='day-button';
      button.setAttribute('aria-pressed',String(day===selectedDay));
      button.setAttribute('aria-label',fmt(day+'T12:00:00Z',{weekday:'long',day:'numeric',month:'long'}));
      button.classList.toggle('has-events',events.some(e=>Core.day(new Date(e.start))===day));
      const weekday=document.createElement('span'),number=document.createElement('strong');
      weekday.textContent=fmt(day+'T12:00:00Z',{weekday:'short'}).replace('.','').slice(0,3);
      number.textContent=fmt(day+'T12:00:00Z',{day:'numeric'});button.append(weekday,number);
      button.addEventListener('click',()=>{selectedDay=day;renderAgenda(state);});strip.append(button);
    }
    const selected=events.filter(e=>Core.day(new Date(e.start))<=selectedDay && Core.day(new Date(e.end))>=selectedDay)
      .filter(e=>Core.day(new Date(e.end))!==selectedDay || fmt(e.end,{hour:'2-digit',minute:'2-digit'})!=='00:00')
      .sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    $('selectedDayLabel').textContent=selectedDay===today?'Aujourd’hui':fmt(selectedDay+'T12:00:00Z',{weekday:'long',day:'numeric',month:'long'});
    $('dayCount').textContent=selected.length?`${selected.length} événement${selected.length>1?'s':''}`:'';
    const list=$('events');list.replaceChildren();
    for(const e of selected){
      const card=document.createElement('article');card.className='event';
      if(/^#[0-9a-f]{6}$/i.test(e.color||''))card.style.setProperty('--event-color',e.color);
      const details=document.createElement('div'),title=document.createElement('p'),meta=document.createElement('div'),time=document.createElement('time');
      title.className='event-title';title.textContent=e.title.replace(/^\[[^\]]+\]\s*/,'');title.title=e.title;
      meta.className='event-meta';meta.textContent=[e.category,e.location].filter(Boolean).join(' · ');
      time.className='event-time';time.dateTime=e.start;time.textContent=fmt(e.start,{hour:'2-digit',minute:'2-digit'})+' – '+fmt(e.end,{hour:'2-digit',minute:'2-digit'});
      details.append(title,meta);card.append(details,time);list.append(card);
    }
    if(!selected.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent=!s.lastSuccess?'Ton planning apparaîtra après le premier import.':'Aucun événement dans le dernier import pour ce jour.';list.append(empty);}
  }
  function render(s){
    state=s;const connected=s.googleConnected,busy=s.running,mode=s.syncState||'disconnected';
    const titles={fresh:'Ton planning est à jour.',stale:'Un planning à actualiser.',syncing:'On synchronise tout.',disconnected:'Ton planning, à un clic.'};
    const labels={fresh:'À jour',stale:'Pas à jour',syncing:'Synchronisation…',disconnected:'Non connecté'};
    if($('accountEmail')){
      $('accountStatus').textContent=connected?'Connecté à Google':'Déconnecté de Google';
      $('accountEmail').textContent=connected?s.googleEmail:'Aucun compte connecté';
      $('accountAvatar').textContent=connected?(s.googleEmail||'G')[0].toUpperCase():'G';
      $('accountAvatar').classList.toggle('connected',connected);
      $('quickDisconnect').hidden=!connected;$('quickDisconnect').disabled=busy;
    }
    $('syncTitle').textContent=titles[mode];$('statusLabel').textContent=labels[mode];
    $('syncStatus').dataset.state=mode;$('heroVisual').dataset.state=mode;
    setIcon($('heroVisual'),mode==='fresh'?'check':mode==='syncing'?'sync':'calendar');
    $('heroVisual').querySelector('svg').classList.toggle('spin',busy);
    $('syncStatus').disabled=busy;
    let subtitle='Connecte Google pour retrouver tes cours, au même endroit.';
    if(connected){
      if(busy)subtitle=s.status?.text||'Récupération de ton planning My Epitech…';
      else if(!s.myLogin)subtitle='Ouvre My Epitech pour connecter ton planning.';
      else if(mode==='fresh')subtitle='Import réussi aujourd’hui à '+fmt(s.lastSuccess.at,{hour:'2-digit',minute:'2-digit'})+'. Tu peux profiter de ta journée.';
      else if(s.myExpired)subtitle='Ta session My a expiré. Ouvre My pour la renouveler.';
      else subtitle=s.lastSuccess?'Une nouvelle journée ou de nouveaux réglages ? Actualise ton agenda.':'Ton agenda est prêt pour son premier import.';
    }
    $('syncSubtitle').textContent=subtitle;
    $('connect').hidden=connected;$('connect').disabled=busy;
    $('force').disabled=busy||!connected||!s.myLogin||s.myExpired;
    $('force').querySelector('span').textContent=busy?'Synchronisation en cours…':'Synchroniser manuellement';
    $('force').querySelector('svg').classList.toggle('spin',busy);
    $('progress').hidden=!busy;
    $('lastSync').textContent=s.lastSuccess?fmt(s.lastSuccess.at,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Pas encore';
    const total=s.lastSuccess?.total ?? (s.lastSuccess?Object.values(s.lastSuccess.counts||{}).reduce((a,b)=>a+b,0):null);
    $('eventCount').textContent=total===null?'—':String(total)+' importé'+(total>1?'s':'');
    const notice=$('notice');notice.replaceChildren();notice.hidden=true;notice.classList.remove('error');
    if(s.status?.error){notice.hidden=false;notice.classList.add('error');notice.textContent=s.status.text;}
    else if(!busy && s.lastSuccess?.cleanup){notice.hidden=false;notice.textContent=`Nettoyage terminé : ${s.lastSuccess.counts.removed} ancien(s) import(s) retiré(s).`+(s.lastSuccess.counts.protected?` ${s.lastSuccess.counts.protected} modification(s) concurrente(s) préservée(s).`:'');}
    if(s.status?.helpUrl?.startsWith('https://console.cloud.google.com/apis/library/calendar-json.googleapis.com')){
      const link=document.createElement('a');link.href=s.status.helpUrl;link.target='_blank';link.rel='noopener';link.textContent=s.status.helpLabel||'Configurer Google Calendar';link.className='error-help';notice.append(document.createElement('br'),link);
    }
    if(connected&&(!s.myLogin||s.myExpired)){
      notice.hidden=false;const open=document.createElement('button');open.type='button';open.className='text-button';open.textContent='Ouvrir My Epitech →';open.addEventListener('click',()=>browser.tabs.create({url:'https://my.epitech.eu/planning'}));notice.append(open);
    }
    $('autoToggle').setAttribute('aria-checked',String(s.config.enabled));$('autoToggle').disabled=busy;
    renderAgenda(s);
    if($('googleState')){
      $('googleState').textContent=connected?s.googleEmail:(s.credentials?'Les identifiants sont prêts. Autorise la connexion à ton compte.':'Importe le fichier Google une seule fois, puis connecte ton compte.');
      $('googlePill').textContent=connected?'Connecté':'À connecter';$('googlePill').classList.toggle('connected',connected);
      $('myState').textContent=s.myLogin?(s.myExpired?'Session expirée · ':'Session détectée · ')+s.myLogin:'La session est détectée automatiquement quand tu ouvres My.';
      $('myPill').textContent=s.myLogin&&!s.myExpired?'Détectée':'À connecter';$('myPill').classList.toggle('connected',!!s.myLogin&&!s.myExpired);
      $('redirect').textContent=s.redirect;$('disconnect').hidden=!s.googleEmail;
      $('connectSettings').textContent=connected?'Changer de compte':'Connecter Google';$('connectSettings').disabled=busy;
      $('disconnect').disabled=busy;$('save').disabled=busy;
      if($('cleanup'))$('cleanup').disabled=busy||!connected||!s.myLogin||s.myExpired;
    }
  }
  async function refresh(){const s=await send('state');render(s);return s;}
  async function connect(){
    if(!state?.credentials){
      if($('credentials')){const section=$('google');section.scrollIntoView({behavior:'smooth',block:'center'});section.classList.remove('highlight');void section.offsetWidth;section.classList.add('highlight');toast('Importe d’abord le fichier JSON Google.');}
      else await browser.runtime.openOptionsPage();
      return;
    }
    toast('La fenêtre Google va s’ouvrir…');
    const result=await send('connect');await refresh();toast(result.needsMy?'Google connecté. Termine la connexion My dans l’onglet ouvert.':'Google connecté. Ton planning se synchronise automatiquement.');
  }
  async function force(){if(state?.syncState==='disconnected')return connect();await send('force');await refresh();}
  function bind(){
    const handle=fn=>async()=>{try{await fn();}catch(e){toast(e.message,true);}};
    $('connect').addEventListener('click',handle(connect));$('force').addEventListener('click',handle(force));$('syncStatus').addEventListener('click',handle(force));
    if($('quickDisconnect'))$('quickDisconnect').addEventListener('click',handle(async()=>{await send('disconnect');await refresh();toast('Déconnecté de Google.');}));
    $('settings').addEventListener('click',()=>browser.runtime.openOptionsPage());
    $('autoToggle').addEventListener('click',handle(async()=>{const enabled=!state.config.enabled;await send('config',{config:{...state.config,enabled}});if($('enabled'))$('enabled').checked=enabled;await refresh();}));
    timer=setInterval(()=>refresh().catch(()=>{}),2000);window.addEventListener('pagehide',()=>clearInterval(timer));
  }
  window.CalendarUI={send,toast,refresh,render,bind,connect,getState:()=>state};
})();

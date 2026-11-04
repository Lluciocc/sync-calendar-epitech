/* Fonctions sans API Firefox, également testées avec node --test. */
(function (root) {
  const PALETTE = {"1":"#a4bdfc","2":"#7ae7bf","3":"#dbadff","4":"#ff887c","5":"#fbd75b","6":"#ffb878","7":"#46d6db","8":"#e1e1e1","9":"#5484ed","10":"#51b749","11":"#dc2127"};
  function claims(token) {
    const s = token.split('.')[1];
    if (!s) throw new Error('Session My invalide.');
    const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-s.length%4)%4)), c=>c.charCodeAt(0))));
    if (!c.login || !Number.isFinite(c.exp)) throw new Error('Session My invalide.');
    return c;
  }
  function account(value) {
    for (let i=0; i<3 && typeof value==='string'; i++) {
      try { value=JSON.parse(value); } catch { return null; }
    }
    if (!value || typeof value.token!=='string') return null;
    try { claims(value.token); return {token:value.token}; } catch { return null; }
  }
  function day(now=new Date()) {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return `${v.year}-${v.month}-${v.day}`;
  }
  function due(last, today, force=false) { return force || last!==today; }
  function dates(c, config) {
    const y=Number(c.cursusSchoolYear || new Date().getFullYear());
    const start=config.start || `${y}-09-01`, end=config.end || `${y+1}-08-31`;
    for (const d of [start,end]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10)!==d) throw new Error('Dates invalides.');
    if (start>end) throw new Error('La date de début doit précéder la date de fin.');
    return {start,end};
  }
  function weeks(start,end) {
    const out=[];
    for(let d=new Date(start+'T00:00:00Z'); d<=new Date(end+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+7)) {
      const e=new Date(d); e.setUTCDate(e.getUTCDate()+6);
      out.push([d.toISOString().slice(0,10), e.toISOString().slice(0,10)>end?end:e.toISOString().slice(0,10)]);
    }
    return out;
  }
  function color(cat,colors={},palette=PALETTE) {
    const chosen=colors[cat];
    if (chosen && palette[chosen]) return String(chosen);
    if (chosen) {
      if (!/^#[0-9a-f]{6}$/i.test(chosen)) throw new Error(`Couleur invalide pour ${cat}.`);
      const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
      const a=rgb(chosen);
      return Object.keys(palette).sort((x,y)=>{
        const dist=k=>rgb(palette[k]).reduce((s,n,i)=>s+(n-a[i])**2,0);
        return dist(x)-dist(y);
      })[0];
    }
    let h=0; for(const c of cat) h=(h*31+c.charCodeAt(0))>>>0;
    const ids=Object.keys(palette); return ids[h%ids.length];
  }
  function esc(s) {return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function stable(value) {
    if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
    if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  async function hash(value) {
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
  }
  function eventTimes(e){
    const personal=e.mySlotStartDate!=null || e.mySlotEndDate!=null;
    return {start:personal?e.mySlotStartDate:e.startDate,end:personal?e.mySlotEndDate:e.endDate,personal};
  }
  function cleanupCandidate(event,registeredIds,account,range){
    const p=event.extendedProperties?.private;
    if(p?.managedBy!=='my-firefox-v1' || p.myAccount!==account || !p.myId || registeredIds.has(p.myId) || !event.etag)return false;
    const start=event.start?.dateTime;
    if(!start || !Number.isFinite(Date.parse(start)))return false;
    const date=day(new Date(start));
    return date>=range.start && date<=range.end;
  }
  function validEvent(e) {
    if (e.id===undefined || e.id===null) throw new Error('Événement sans identifiant.');
    const times=eventTimes(e);
    for (const s of [times.start,times.end]) if (typeof s!=='string' || !/(Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error(`Date invalide pour My ${e.id}.`);
    if (Date.parse(times.end)<=Date.parse(times.start)) throw new Error(`Durée invalide pour My ${e.id}.`);
  }
  async function eventBody(e,config,accountId,palette) {
    validEvent(e);
    const times=eventTimes(e);
    const cat=String(e.unitCode || (e.isExam?'Examens':'Autres'));
    const title=e.fullTitle || e.title || e.activityName || 'Événement Epitech';
    const room=r=>typeof r==='string'?r:String(r.name || r.title || r.code || r.id || '');
    const people=[...(e.instructors||[]),...(e.sessionLeader?[e.sessionLeader]:[])];
    const lines=[e.activityDescription||'',`Module : ${e.unitName||cat} (${cat})`,`Identifiant My : ${e.id}`];
    if(people.length) lines.push('Intervenants : '+people.map(p=>typeof p==='string'?p:`${p.firstname||''} ${p.lastname||''} <${p.login||''}>`).join('; '));
    if(times.personal)lines.push('Horaire : ton créneau personnel d’inscription.');
    else if(e.activitySlotsEnabled)lines.push('Créneau global : aucun sous-créneau personnel fourni par My.');
    lines.push('Source : https://my.epitech.eu/planning');
    const body={summary:config.categoryInTitle===false?title:`[${cat}] ${title}`,
      description:lines.map(esc).join('<br>')+'<br><br>Données complètes My :<pre>'+esc(JSON.stringify(e,null,2))+'</pre>',
      location:(e.rooms||[]).map(room).filter(Boolean).join(', '),
      start:{dateTime:new Date(times.start).toISOString(),timeZone:'Europe/Paris'},
      end:{dateTime:new Date(times.end).toISOString(),timeZone:'Europe/Paris'},
      colorId:color(cat,config.colors,palette),source:{title:'My Epitech',url:'https://my.epitech.eu/planning'}};
    body.extendedProperties={private:{managedBy:'my-firefox-v1',myId:String(e.id),myAccount:accountId,category:cat,sourceHash:await hash(stable(body))}};
    return body;
  }
  function syncSettings(config) {
    return {selection:'registered-me-v1',start:config.start,end:config.end,semesters:config.semesters,colors:config.colors,categoryInTitle:config.categoryInTitle};
  }
  function syncState({connected,running,lastSuccess,error,today,settingsHash}) {
    if(!connected)return 'disconnected';
    if(running)return 'syncing';
    if(error)return 'stale';
    return lastSuccess?.day===today && lastSuccess?.settingsHash===settingsHash ? 'fresh' : 'stale';
  }
  function calendarError(payload,httpStatus) {
    const error=payload?.error||{};
    const legacy=(error.errors||[]).map(e=>e.reason);
    const detailed=(error.details||[]).map(e=>e.reason);
    const reasons=[...legacy,...detailed].filter(r=>typeof r==='string');
    const has=(...wanted)=>reasons.some(r=>wanted.includes(r));
    const reason=reasons.find(r=>/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(r))||'unknown';
    let message='Accès refusé par Google. Vérifie les permissions de ce compte sur l’agenda dédié.';
    let help=null,reconnect=false;
    const retryable=httpStatus===429 || has('rateLimitExceeded','userRateLimitExceeded','RATE_LIMIT_EXCEEDED');
    if(has('accessNotConfigured','SERVICE_DISABLED')){
      message='Google Calendar API est désactivée dans le projet OAuth. Active cette API dans le projet utilisé par tes identifiants Google, puis relance la synchronisation.';
      const consumer=(error.details||[]).map(d=>d.metadata?.consumer).find(c=>/^projects\/\d+$/.test(c||''));
      help={helpLabel:'Activer Google Calendar API',helpUrl:'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'+(consumer?'?project='+consumer.split('/')[1]:'')};
    }else if(has('insufficientPermissions','ACCESS_TOKEN_SCOPE_INSUFFICIENT')){
      message='L’autorisation Calendar manque. Reconnecte Google et autorise la gestion des agendas créés par cette application.';reconnect=true;
    }else if(retryable){
      message='Google limite temporairement les requêtes. Réessaie la synchronisation dans quelques minutes.';
    }else if(has('quotaExceeded','dailyLimitExceeded','QUOTA_EXCEEDED')){
      message='Le quota Google Calendar du projet est atteint. Vérifie les quotas dans Google Cloud avant de réessayer.';
    }else if(has('domainPolicy','ORG_RESTRICTION_VIOLATION')){
      message='Une règle de ton organisation bloque cette application. Contacte l’administrateur Google Workspace.';
    }else if(httpStatus===401){
      message='La connexion Google n’est plus valide. Reconnecte ton compte.';reconnect=true;
    }else if(httpStatus!==403){
      message='La requête Google Calendar a échoué. Réessaie et consulte le motif indiqué.';
    }
    return {message,reason,help,reconnect,retryable};
  }
  const api={eventTimes,cleanupCandidate,calendarError,syncSettings,syncState,PALETTE,claims,account,day,due,dates,weeks,color,stable,hash,validEvent,eventBody};
  root.Core=api; if(typeof module!=='undefined') module.exports=api;
})(globalThis);

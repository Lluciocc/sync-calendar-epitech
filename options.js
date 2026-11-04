const $=id=>document.getElementById(id);
const names={'G-CPE-110':'Programmation C','G-PSU-100':'Unix · PSU','G-MUL-100':'Graphique','G-MAT-100':'Mathématiques','G-ENG-100':'Anglais','S-ADM-000':'Administratif','G-COM-100':'Pitch','G-PRO-100':'Communication'};
function colorGrid(colors){
  const grid=$('colorGrid');grid.replaceChildren();
  for(const [code,value] of Object.entries(colors)){
    const row=document.createElement('label');row.className='color-option';
    const input=document.createElement('input');input.type='color';input.value=/^#[0-9a-f]{6}$/i.test(value)?value:Core.PALETTE[value]||'#a498ff';input.setAttribute('aria-label','Couleur '+(names[code]||code));
    const label=document.createElement('div'),title=document.createElement('span'),sub=document.createElement('small');title.textContent=names[code]||code;sub.textContent=code;label.append(title,sub);row.append(input,label);grid.append(row);
    input.addEventListener('input',()=>{try{const current=JSON.parse($('colors').value);current[code]=input.value;$('colors').value=JSON.stringify(current,null,2);}catch{CalendarUI.toast('Corrige le JSON des couleurs avant de choisir une teinte.',true);}});
  }
}
function handle(id,fn){$(id).addEventListener('click',async()=>{try{await fn();}catch(e){CalendarUI.toast(e.message,true);}});}
CalendarUI.bind();
handle('connectSettings',()=>CalendarUI.connect());
handle('disconnect',async()=>{await CalendarUI.send('disconnect');await CalendarUI.refresh();});
handle('openMy',()=>browser.tabs.create({url:'https://my.epitech.eu/planning'}));
$('credentials').addEventListener('change',async()=>{try{const file=$('credentials').files[0];if(!file)return;if(file.size>100000)throw new Error('Le fichier est trop volumineux.');await CalendarUI.send('credentials',{data:JSON.parse(await file.text())});await CalendarUI.refresh();CalendarUI.toast('Identifiants importés. Clique sur Connecter Google.');}catch(e){CalendarUI.toast(e.message,true);}finally{$('credentials').value='';}});
$('preferences').addEventListener('submit',async event=>{
  event.preventDefault();try{
    const config={...CalendarUI.getState().config,enabled:$('enabled').checked,categoryInTitle:$('categoryInTitle').checked,start:$('start').value,end:$('end').value,
      semesters:$('semesters').value.trim()?$('semesters').value.split(',').map(x=>Number(x.trim())):[],colors:JSON.parse($('colors').value)};
    await CalendarUI.send('config',{config});colorGrid(config.colors);await CalendarUI.refresh();CalendarUI.toast('Réglages enregistrés. Synchronise pour les appliquer.');
  }catch(e){CalendarUI.toast(e.message,true);}
});
$('colors').addEventListener('change',()=>{try{colorGrid(JSON.parse($('colors').value));}catch{CalendarUI.toast('Le JSON des couleurs est invalide.',true);}});
CalendarUI.refresh().then(s=>{
  for(const key of ['enabled','categoryInTitle'])$(key).checked=s.config[key];
  for(const key of ['start','end'])$(key).value=s.config[key];
  $('semesters').value=s.config.semesters.join(',');$('colors').value=JSON.stringify(s.config.colors,null,2);colorGrid(s.config.colors);
}).catch(e=>CalendarUI.toast(e.message,true));

handle('cleanup',async()=>{if(!window.confirm('Retirer les anciens événements importés par l’extension qui sont absents de tes inscriptions, pour la période et les semestres configurés ? Les événements personnels sont conservés.'))return;await CalendarUI.send('cleanup');await CalendarUI.refresh();});

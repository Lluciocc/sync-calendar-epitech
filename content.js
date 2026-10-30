/* Le contexte isolé Firefox peut lire localStorage sur l'origine My. */
(() => {
  let last='', url=location.href;
  function read(visit=false) {
    let session=null;
    try {
      let value=localStorage.getItem('@account') || sessionStorage.getItem('@account');
      for(let i=0;i<3 && typeof value==='string';i++) value=JSON.parse(value);
      if(value && typeof value.token==='string') session={token:value.token};
    } catch { /* Session non prête : la prochaine lecture réessaiera. */ }
    const changed=session && session.token!==last;
    if(changed) last=session.token;
    if(visit || changed) browser.runtime.sendMessage({type:'myVisit',session}).catch(()=>{});
  }
  read(true);
  window.addEventListener('storage',()=>read(false));
  window.addEventListener('pageshow',()=>read(true));
  // La connexion My peut écrire localStorage dans la même page sans événement storage.
  setInterval(()=>{
    const navigated=location.href!==url; url=location.href;
    read(navigated);
  },3000);
})();

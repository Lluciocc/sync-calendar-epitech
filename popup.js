async function refresh(){const s=await browser.runtime.sendMessage({type:'state'});document.getElementById('accounts').textContent=s.googleConnected?`Google : ${s.googleEmail}`:'Connecte Google dans les réglages.';const status=document.getElementById('status');status.textContent=s.status?.text||'Ouvre My pour récupérer ta session.';status.classList.toggle('error',!!s.status?.error);document.getElementById('force').disabled=s.running;}
document.getElementById('force').addEventListener('click',async()=>{await browser.runtime.sendMessage({type:'force'});await refresh();});
document.getElementById('settings').addEventListener('click',()=>browser.runtime.openOptionsPage());
refresh();setInterval(()=>refresh().catch(()=>{}),1000);

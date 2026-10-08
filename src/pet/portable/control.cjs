const {app,BrowserWindow,Notification,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const base=process.env.DSH_HOME;
app.setName('大肥鱼控制台');app.setAppUserModelId('DshPet.Full.Portable');
if(process.env.DSH_PET_CONTROL_CDP_PORT)app.commandLine.appendSwitch('remote-debugging-port',process.env.DSH_PET_CONTROL_CDP_PORT);
for(const [key,folder]of [['userData','control-profile'],['sessionData','control-cache'],['logs','logs'],['crashDumps','control-crash-dumps']]){
 const target=path.join(base,folder);fs.mkdirSync(target,{recursive:true});app.setPath(key,target);
}
const url=new URL(process.env.PORTABLE_UI_URL);const token=decodeURIComponent(url.hash.slice(1).split("&")[0]);const requestedTab=new URLSearchParams(url.hash.slice(1).split("&").slice(1).join("&")).get("tab");const origin=url.origin;
let win,last=0,quitting=false;
function show(){if(win){win.show();win.focus();}}
if(!app.requestSingleInstanceLock({show:process.env.PORTABLE_SHOW_PANEL==='1',tab:requestedTab})){app.quit();}
else{
 app.on('second-instance',(event,args,cwd,data)=>{if(data?.tab&&win)win.loadURL(origin+'/portable/ui#'+encodeURIComponent(token)+'&tab='+encodeURIComponent(data.tab));if(data?.show)show();});
 app.whenReady().then(()=>{
  win=new BrowserWindow({width:1050,height:800,minWidth:800,minHeight:620,title:'大肥鱼 · 设置与聊天',backgroundColor:'#f4f7fc',show:process.env.PORTABLE_SHOW_PANEL==='1',icon:path.join(__dirname,'../assets/logo.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.removeMenu();win.loadURL(process.env.PORTABLE_UI_URL);
  win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();}});
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(e,target)=>{if(new URL(target).origin!==origin)e.preventDefault();});
  const timer=setInterval(async()=>{
   try{const r=await fetch(origin+'/portable/api/notifications?after='+last,{headers:{'x-pet-token':token},signal:AbortSignal.timeout(3000)});if(!r.ok)return;const result=await r.json();
    for(const item of result.items||[]){last=Math.max(last,item.id);if(result.enabled&&!win.isFocused()&&Notification.isSupported())new Notification({title:item.title,body:item.body,icon:path.join(__dirname,'../assets/logo.png')}).show();}
   }catch{}
  },1000);
  app.on('before-quit',()=>{quitting=true;clearInterval(timer);});
  if(process.env.DSH_PET_HOST_PID){const parent=Number(process.env.DSH_PET_HOST_PID);setInterval(()=>{try{process.kill(parent,0);}catch{app.quit();}},1500);}
 });
}

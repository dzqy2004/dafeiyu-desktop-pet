'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('battleBridge',{
 init:()=>ipcRenderer.invoke('battle:init'),
 action:(action,payload={})=>ipcRenderer.invoke('battle:action',{action,...payload}),
 ready:()=>ipcRenderer.send('battle:ready'),
 report:(error)=>ipcRenderer.send('battle:renderer-error',String(error).slice(0,500)),
 onFrame:(cb)=>{const listener=(_,data)=>cb(data);ipcRenderer.on('battle:frame',listener);return()=>ipcRenderer.removeListener('battle:frame',listener);},
 onPanel:(cb)=>{const listener=(_,data)=>cb(data);ipcRenderer.on('battle:panel',listener);return()=>ipcRenderer.removeListener('battle:panel',listener);}
});

import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {randomUUID,timingSafeEqual} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url));
const home=process.env.DSH_HOME;
const settingsFile=home ? join(home,'api-settings.json') : '';
const DEFAULTS={protocol:'openai',baseUrl:'',model:'',providerId:'custom',apiKeyProtected:'',temperature:0.8,maxTokens:2048,autoStart:true};
export function readSettings(){if(!settingsFile||!existsSync(settingsFile))return {...DEFAULTS};return {...DEFAULTS,...JSON.parse(readFileSync(settingsFile,'utf8').replace(/^\uFEFF/,''))};}
function atomicWrite(path,obj){mkdirSync(dirname(path),{recursive:true});const temp=path+'.new';writeFileSync(temp,JSON.stringify(obj,null,2),'utf8');renameSync(temp,path);}
function tool(arg,input=''){
  return new Promise((resolve,reject)=>{
    const p=spawn(process.env.DSH_PET_LAUNCHER,[arg],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);
    p.on('exit',code=>code===0?resolve(out.trim()):reject(new Error('系统配置操作失败'+(err?'：'+err.slice(0,200):''))));
    p.stdin.end(input);
  });
}
let cachedCipher='',cachedKey='';
async function keyOf(settings){if(!settings.apiKeyProtected)return '';if(cachedCipher!==settings.apiKeyProtected){cachedKey=await tool('--decrypt-key',settings.apiKeyProtected);cachedCipher=settings.apiKeyProtected;}return cachedKey;}
function endpoint(base,suffix){const u=new URL(base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('请填写有效的 HTTP(S) API 地址');u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');if(!u.pathname.endsWith(suffix))u.pathname+=suffix;return u.href;}
function contentText(content){return typeof content==='string'?content:Array.isArray(content)?content.filter(b=>b.type==='text').map(b=>b.text).join(''):'';}
async function checkedFetch(url,options,secret){
  let r;try{r=await fetch(url,{...options,redirect:'error'});}catch(e){throw Error(e.name==='TimeoutError'||e.name==='AbortError'?'API 请求超时，请稍后重试':'无法连接 API，请检查接口地址、网络和代理设置');}
  if(!r.ok){const body=(await r.text()).slice(0,500);let message=body;try{const o=JSON.parse(body);message=o.error?.message||o.message||`HTTP ${r.status}`;}catch{}
    if(secret)message=message.split(secret).join('[密钥已隐藏]');throw Error(`API 返回 ${r.status}：${message}`);}
  return r;
}
export async function* requestModel(settings,key,options){
  if(!settings.baseUrl||!options.model)throw Error('请先在「设置与聊天 → API」中填写接口地址和模型');
  const headers={'content-type':'application/json'};
  const model=options.model||settings.model;
  const signal=options.signal||AbortSignal.timeout(60000);
  const messages=(options.messages||[]).map(m=>({role:m.role,content:contentText(m.content)}));
  let body,url;
  if(settings.protocol==='anthropic'){
    if(key)headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
    url=endpoint(settings.baseUrl,'/messages');body={model,messages,system:options.system||'',max_tokens:settings.maxTokens,temperature:settings.temperature,stream:true};
  }else{
    if(key)headers.authorization='Bearer '+key;
    url=endpoint(settings.baseUrl,'/chat/completions');
    body={model,messages:[...(options.system?[{role:'system',content:options.system}]:[]),...messages],temperature:settings.temperature,max_tokens:settings.maxTokens,stream:true};
    if(settings.providerId==='deepseek-official')body.thinking={type:'disabled'};
  }
  const response=await checkedFetch(url,{method:'POST',headers,body:JSON.stringify(body),signal},key);
  if(!response.headers.get('content-type')?.includes('text/event-stream')){
    const o=await response.json();if(o.error)throw Error('API 生成失败');
    const text=settings.protocol==='anthropic'?contentText(o.content):contentText(o.choices?.[0]?.message?.content);
    if(!text)throw Error('API 没有返回回复文本');yield {type:'text',text};return;
  }
  const decoder=new TextDecoder();let buffer='';
  function parse(line){if(!line.startsWith('data:'))return null;const data=line.slice(5).trim();if(!data||data==='[DONE]')return null;
    let o;try{o=JSON.parse(data);}catch{throw Error('API 流式响应格式错误');}
    if(o.error)throw Error('API 流式生成失败：'+String(o.error.type||'unknown'));
    const text=settings.protocol==='anthropic'?o.delta?.text:o.choices?.[0]?.delta?.content;
    return typeof text==='string'&&text?{type:'text',text}:null;
  }
  for await(const bytes of response.body){buffer+=decoder.decode(bytes,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);const chunk=parse(line);if(chunk)yield chunk;}}
  buffer+=decoder.decode();if(buffer.trim()){const chunk=parse(buffer.replace(/\r$/,''));if(chunk)yield chunk;}
}
export function installPortableServices(ctx,options){
  const events=new EventEmitter();let seq=0;let control=null;let notificationId=0;const notifications=[];
  const token=process.env.DSH_PET_LOCAL_TOKEN||'';
  const port=()=>typeof options.port==='function'?options.port():options.port;
  const base=()=>`http://127.0.0.1:${port()}`;
  const cfgPath=join(home,'dsh-pet','main-config.jsonc');
  const core=async(path,method='GET',body)=>{const r=await fetch(base()+'/dsh-pet-7340/'+path,{method,headers:{'content-type':'application/json','x-pet-token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});const o=await r.json();if(!r.ok||o.ok===false)throw Error(o.error||o.message||o.reason||'操作失败');return o;};
  const mainConfig=async()=>{const conf=await core('config');return conf.main;};
  const notify=(title,body)=>{notifications.push({id:++notificationId,title,body});if(notifications.length>50)notifications.shift();};
  const emit=(session,event)=>{
    const normalized={seq:++seq,...event};events.emit('session/event',{id:session,header:{id:session}},normalized);
    if(event.type==='turn/end'){
      const kind=event.data?.reason?.kind;
      if(kind==='completed')notify('大肥鱼回复完成','回复已显示在桌宠气泡和对话记录中');
      else if(kind==='error')notify('大肥鱼生成失败','请检查 API 配置或稍后重试');
      else if(kind==='max-tokens')notify('输出已截断','回复达到输出上限，可增加最大输出 token');
    }
    if(event.type==='approval/asked')notify('任务等待确认',String(event.data?.reason||'有一项权限请求需要你确认').slice(0,200));
    if(event.type==='tool/call'&&event.data?.name==='ask_user_question')notify('任务等待选择','任务程序正在等待你的回答');
  };
  ctx.on=(name,fn)=>{events.on(name,fn);return()=>events.off(name,fn);};
  ctx.get=()=>undefined;
  ctx.agentDefaultModel.currentSelection=()=>{const s=readSettings();return {provider:s.providerId,model:s.model};};
  ctx.credentials.resolve=async()=>({value:await keyOf(readSettings())});
  ctx.llm={
    listProviders:()=>[{id:readSettings().providerId,name:'便携 API'}],
    listModels:async()=>{
      const s=readSettings();if(!s.baseUrl)return [];
      try{const key=await keyOf(s);const headers=s.protocol==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01'}:key?{authorization:'Bearer '+key}:{};
        const r=await checkedFetch(endpoint(s.baseUrl,'/models'),{headers,signal:AbortSignal.timeout(15000)},key);const o=await r.json();return (o.data||o.models||[]).map(m=>({id:m.id||m.name,name:m.display_name||m.id||m.name}));
      }catch{return s.model?[{id:s.model,name:s.model}]:[];}
    },
    resolveModelInfo:async()=>({reasoningEfforts:false}),
    async *stream(o){const id='api-'+randomUUID();emit(id,{type:'turn/start',data:{}});try{
      for await(const chunk of requestModel(readSettings(),await keyOf(readSettings()),o))yield chunk;
      emit(id,{type:'turn/end',data:{reason:{kind:'completed'}}});
    }catch(e){emit(id,{type:'turn/end',data:{reason:{kind:'error'}}});throw e;}}
  };
  function openControl(show=true,tab=""){
    const env={...process.env,PORTABLE_UI_URL:base()+'/portable/ui#'+encodeURIComponent(token)+(tab?'&tab='+tab:''),PORTABLE_SHOW_PANEL:show?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
    const p=spawn(process.env.DSH_PET_ELECTRON_PATH,[join(here,'control.cjs')],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});
    p.stderr.on('data',d=>{const line=d.toString();if(line.includes('FATAL'))options.logger.warn('设置窗口启动异常');});p.on('error',e=>options.logger.warn('设置窗口启动失败：'+e.message));
    if(!control||control.exitCode!==null)control=p;
    p.on('exit',()=>{if(control===p)control=null;});
  }
  const reply=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj));};
  function authorized(req){const supplied=String(req.headers['x-pet-token']||'');return token&&Buffer.byteLength(supplied)===Buffer.byteLength(token)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(token));}
  const originalRegister=ctx.webServer.register.bind(ctx.webServer);
  ctx.webServer.register=spec=>originalRegister({...spec,handler:(req,res)=>{
    if(!authorized(req)){reply(res,401,{ok:false,error:'请从大肥鱼菜单打开控制窗口'});return;}
    return spec.handler(req,res);
  }});
  async function requestBody(req){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1048576)throw Error('请求内容过大');}return body?JSON.parse(body):{};}
  async function handler(req,res){
    const url=new URL(req.url,'http://127.0.0.1');const path=url.pathname;
    if(req.method==='GET'&&['/portable/ui','/portable/panel.js','/portable/panel.css','/portable/logo.png'].includes(path)){
      const file=path==='/portable/ui'?'panel.html':path.split('/').pop();const mime=file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png';
      res.writeHead(200,{'content-type':mime+'; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"});res.end(readFileSync(file==='logo.png'?join(here,'../assets/logo.png'):join(here,file)));return;
    }
    if(!authorized(req)){reply(res,401,{ok:false,error:'本地访问凭证无效，请从桌宠菜单打开设置'});return;}
    try{
      if(path==='/portable/api/settings'&&req.method==='GET'){
        const s=readSettings();const {apiKeyProtected,...safe}=s;reply(res,200,{ok:true,api:{...safe,hasApiKey:!!apiKeyProtected},config:await mainConfig(),dataPath:home});return;
      }
      if(path==='/portable/api/settings'&&req.method==='PUT'){
        const body=await requestBody(req);const s=readSettings();const allowed=['protocol','baseUrl','model','providerId','temperature','maxTokens','autoStart'];
        for(const k of allowed)if(body[k]!==undefined)s[k]=body[k];
        if(!['openai','anthropic'].includes(s.protocol))throw Error('API 协议无效');
        if(s.baseUrl)endpoint(s.baseUrl,'/models');
        if(typeof s.model!=='string'||s.model.length>200)throw Error('模型名称无效');
        if(!['custom','deepseek-official','opencode-go','commandcode'].includes(s.providerId))throw Error('服务商无效');
        if(!Number.isFinite(s.temperature)||s.temperature<0||s.temperature>2)throw Error('随机程度需在 0 到 2 之间');
        if(!Number.isInteger(s.maxTokens)||s.maxTokens<128||s.maxTokens>32768)throw Error('输出上限需为 128 至 32768 的整数');
        if(typeof s.autoStart!=='boolean')throw Error('自启动设置无效');
        if(body.clearKey)s.apiKeyProtected='';else if(body.apiKey){if(typeof body.apiKey!=='string'||body.apiKey.length>8192)throw Error('密钥格式无效');s.apiKeyProtected=await tool('--encrypt-key',body.apiKey.trim());}
        await tool(s.autoStart?'--autostart-enable':'--autostart-disable');atomicWrite(settingsFile,s);cachedCipher='';
        reply(res,200,{ok:true});return;
      }
      if(path==='/portable/api/speech'&&req.method==='POST'){const body=await requestBody(req);const conf=await mainConfig();const target=conf.pets.find(p=>p.id===body.pet);if(!target)throw Error('没有找到该宠物');const pets=conf.pets.map(p=>p.id===target.id?{...p,whisperEnabled:!target.whisperEnabled}:p);await core('config','PUT',{pets});reply(res,200,{ok:true,enabled:!target.whisperEnabled});return;}
      if(path==='/portable/api/behavior'&&req.method==='POST'){openControl(true,'pets');reply(res,200,{ok:true});return;}
      if(path==='/portable/api/weights'&&req.method==='PUT'){
        const body=await requestBody(req);const values=['move','action','idle','turn'].map(k=>Number(body[k]));
        if(values.some(v=>!Number.isFinite(v)||v<0||v>100)||Math.abs(values.reduce((a,b)=>a+b,0)-100)>0.01)throw Error('四项权重应在 0–100 之间，合计 100%');
        const conf=await mainConfig();const raw=JSON.parse(readFileSync(cfgPath,'utf8').replace(/^\uFEFF/,''));
        const anim=structuredClone(conf.animations);const total=anim.categories.reduce((a,c)=>a+c.weight,0)||1;
        anim.categories.forEach(c=>c.weight=c.weight/total*body.action);raw.animations=anim;raw.animationWeights={move:values[0],idle:values[2],turn:values[3]};
        if(typeof body.actionEnabled==='boolean')raw.localSpeech={...conf.localSpeech,actionEnabled:body.actionEnabled};
        atomicWrite(cfgPath,raw);await core('reload','POST',{});reply(res,200,{ok:true});return;
      }
      if(path==='/portable/api/open'&&req.method==='POST'){openControl(true);reply(res,200,{ok:true});return;}
      if(path==='/portable/api/notifications'&&req.method==='GET'){const conf=await mainConfig();reply(res,200,{ok:true,enabled:!!conf.notificationsEnabled,items:notifications.filter(n=>n.id>Number(url.searchParams.get('after')||0))});return;}
      if(path==='/portable/api/models'&&req.method==='GET'){reply(res,200,{ok:true,models:await ctx.llm.listModels()});return;}
      if(path==='/portable/api/test'&&req.method==='POST'){
        const s=readSettings();let text='';for await(const chunk of requestModel(s,await keyOf(s),{model:s.model,system:'你正在测试连接。',messages:[{role:'user',content:'请只回答：连接正常'}]}))text+=chunk.text;
        reply(res,200,{ok:true,text});return;
      }
      if(path==='/portable/api/config'&&req.method==='PUT'){const body=await requestBody(req);reply(res,200,{ok:true,config:await core('config','PUT',body)});return;}
      if(path==='/portable/api/advanced'&&req.method==='PUT'){
        const body=await requestBody(req);const text=String(body.text||'');const parsed=JSON.parse(text);if(!parsed||!Array.isArray(parsed.pets)||!parsed.pets.length)throw Error('配置至少需要一只宠物');
        for(const p of parsed.pets)if(!p.id||!Number.isFinite(p.size)||p.size<80||p.size>1600)throw Error('宠物标识或大小无效');
        const ids=parsed.pets.map(p=>p.id);if(new Set(ids).size!==ids.length)throw Error('宠物标识不能重复');
        const old=readFileSync(cfgPath);atomicWrite(cfgPath,parsed);
        try{await core('config');await core('reload','POST',{});}catch(e){writeFileSync(cfgPath,old);throw e;}reply(res,200,{ok:true});return;
      }
      if(path==='/portable/api/clone'&&req.method==='POST'){
        const body=await requestBody(req);const conf=await mainConfig();const pets=conf.pets.map(p=>({...p,position:{...p.position}}));if(pets.length>=20)throw Error('最多同时显示 20 只宠物');
        const source=pets.find(p=>p.id===body.pet)||pets[0];const clone={...source,id:'fish-'+randomUUID().slice(0,8),name:source.name+'分身',position:{...source.position,marginX:source.position.marginX+110,marginY:source.position.marginY+70}};pets.push(clone);
        await core('config','PUT',{pets});reply(res,200,{ok:true,pet:clone.id});return;
      }
      if(path==='/portable/api/remove'&&req.method==='POST'){
        const body=await requestBody(req);const conf=await mainConfig();if(conf.pets.length<=1)throw Error('请至少保留一只大肥鱼');const pets=conf.pets.filter(p=>p.id!==body.pet);if(pets.length===conf.pets.length)throw Error('没有找到该分身');await core('config','PUT',{pets});reply(res,200,{ok:true});return;
      }
      if(path==='/portable/api/clear-memory'&&req.method==='POST'){const body=await requestBody(req);if(!body.pet)throw Error('请选择宠物');const file=join(home,'dsh-pet','memory.json');if(existsSync(file)){const memory=JSON.parse(readFileSync(file,'utf8'));for(const bucket of Object.values(memory))if(bucket&&typeof bucket==='object')delete bucket[body.pet];atomicWrite(file,memory);}reply(res,200,{ok:true});return;}
      if(path==='/portable/api/session-event'&&req.method==='POST'){
        const body=await requestBody(req);if(!body.event?.type||typeof body.session!=='string')throw Error('事件需要 session 和 event.type');
        if(body.event.type==='agent/error'){events.emit('agent/error',body.event.data||{});notify('任务生成失败','外部任务程序报告了一项错误');}else emit(body.session,body.event);
        reply(res,200,{ok:true});return;
      }
      if(path==='/portable/api/work-status'&&req.method==='POST'){
        const body=await requestBody(req);const mapping={thinking:{type:'turn/start',data:{}},working:{type:'tool/call',data:{name:'desktop-task'}},result:{type:'tool/result',data:{}},waiting:{type:'approval/asked',data:{}},success:{type:'turn/end',data:{reason:{kind:'completed'}}},error:{type:'turn/end',data:{reason:{kind:'error'}}},idle:{type:'turn/end',data:{reason:{kind:'aborted'}}}};
        if(!mapping[body.state])throw Error('工作状态无效');emit('desktop-manual',mapping[body.state]);reply(res,200,{ok:true});return;
      }
      if(path==='/portable/api/raw-config'&&req.method==='GET'){reply(res,200,{ok:true,text:readFileSync(cfgPath,'utf8')});return;}
      reply(res,404,{ok:false,error:'没有找到该功能'});
    }catch(e){reply(res,400,{ok:false,error:e.message});}
  }
  originalRegister({kind:'prefix',path:'/portable',handler});
  ctx.effect(()=>{const timer=setTimeout(()=>openControl(process.env.DSH_PET_SHOW_PANEL==='1'),1000);return()=>{clearTimeout(timer);if(control&&control.exitCode===null)control.kill();};});
}

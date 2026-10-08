// preload 桥：只暴露窗口控制原语——
//   - setBounds：宠物窗口逐帧跟随（renderer 上报包围盒的屏幕坐标，主进程 setContentBounds）。
//     x/y/width/height = 窗口内容区坐标（用于移动窗口）；boxX/boxY = 宠物包围盒左上角
//     （工作区坐标）——碰撞站场必须用包围盒坐标，不能用窗口坐标（窗口 = 包围盒 + 四周外扩 margin，
//     差半只宠物宽，会让跨窗碰撞检测整体错位）。
//     size/bottomPad = 碰撞站场登记用（静止宠物只发 set-bounds，靠它带上尺寸才能被其它
//     飞行宠物撞到）；vx/vy = 飞行或拖拽速度，contact = 模式/开关/实例与校正版本。
//   - setInteractive：点击穿透翻转——窗口默认整窗穿透（透明像素不挡下层应用），
//     renderer 在光标进/出宠物身体命中区时上报，主进程 setIgnoreMouseEvents 翻转。
//   - setInputBusy：**我正在用这个窗口的鼠标输入**（拖拽中 / 菜单开着 / 对话弹窗开着），
//     由渲染端上报。主进程光看光标位置与窗口位移分不清"拖拽跟手"和"漫游/抛掷"，而渲染端知道。
//     busy 期间主进程的兜底通道**绝不翻回穿透**（一旦翻回，渲染端正在用的 window 级
//     pointermove/pointerup 就断了：宠物会按旧速度飞出去，连松手的 pointerup 都收不到）。
//     只在状态翻转时发一次（幂等，不逐帧）。
//   - 普通分身碰撞：setBounds 带上拖拽/飞行状态；主进程统一检查运动路径，
//     onPetHit 返回校正位置/速度；回调可退订，普通模式恢复不会积累旧实例。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  portableAction(action, pet) { return ipcRenderer.invoke('portable:action', { action, pet }); },
  openBattle() { return ipcRenderer.invoke('battle:open'); },
  onBattleMode(cb) { ipcRenderer.on('battle:normal-mode', (_, paused) => cb(paused)); },
  setBounds(x, y, width, height, boxX, boxY, size, bottomPad, vx, vy, contact) {
    ipcRenderer.send('pet:set-bounds', { x, y, width, height, boxX, boxY, size, bottomPad, vx, vy, contact });
  },
  setInteractive(interactive) {
    ipcRenderer.send('pet:set-interactive', !!interactive);
  },
  // 我正在用这个窗口的鼠标输入（拖拽中/菜单开/弹窗开）：主进程兜底通道在 busy 期间绝不翻回穿透
  setInputBusy(busy) {
    ipcRenderer.send('pet:input-busy', !!busy);
  },
  // 右键菜单「打开网站」：主进程用系统默认浏览器打开 DSH 网站（等效网页 Ctrl+点击链接）
  openDshSite(url) {
    ipcRenderer.send('pet:open-site', { url });
  },
  // Normal pet contacts are resolved once by the main process.
  leaveContacts(session) { ipcRenderer.send('pet:leave-contacts', session); },
  onPetHit(cb) {
    const listener = (_, payload) => cb(payload);
    ipcRenderer.on('pet:hit', listener);
    return () => ipcRenderer.removeListener('pet:hit', listener);
  },
  // 显示器热更新：分辨率/缩放变化、插拔屏、旋转后主进程重算桌面几何并推来
  // （{hull, areas, primaryIndex}，屏幕坐标）——渲染端就地重挂视口与边界。
  onDisplays(cb) {
    ipcRenderer.on('pet:displays', (e, geo) => cb(geo));
  },
});

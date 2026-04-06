#!/usr/bin/env node
/**
 * 生成字幕审核网页（v3.1 - 完整功能版，含编辑+拆分）
 *
 * 用法: node generate_review.js <subtitles.json> [auto_selected.json] [video.mp4] [output.html]
 *
 * 功能：
 * - 点击字幕 → 跳转播放
 * - 双击字幕 → 选中/取消
 * - 点击字幕文字 → 直接编辑（回车保存）
 * - S键/拆分按钮 → 在播放头位置拆分字幕
 * - Shift+点击 → 批量选中（从上次位置到当前位置）
 * - 播放时自动跳过已选片段
 * - 橙色标记AI预选片段
 * - 复制删除列表（自动合并相邻片段）
 * - 键盘快捷键：空格/方向键/A键/S/Escape
 */

const fs = require('fs');
const path = require('path');

const subtitlesFile = process.argv[2];
const autoSelectedFile = process.argv[3];
const videoFile = process.argv[4];
const outputFile = process.argv[5] || 'review.html';

if (!subtitlesFile) {
  console.log('❌ 用法: node generate_review.js <subtitles.json> [auto_selected.json] [video.mp4] [output.html]');
  console.log('   示例: node generate_review.js subtitles_words.json auto_selected.json video.mp4');
  process.exit(1);
}

if (!fs.existsSync(subtitlesFile)) {
  console.error('❌ 文件不存在:', subtitlesFile);
  process.exit(1);
}

const subs = JSON.parse(fs.readFileSync(subtitlesFile, 'utf8'));
if (!Array.isArray(subs)) {
  console.error('❌ JSON格式错误：需要数组');
  process.exit(1);
}

let aiSelected = new Set();
if (autoSelectedFile && fs.existsSync(autoSelectedFile)) {
  try {
    const data = JSON.parse(fs.readFileSync(autoSelectedFile, 'utf8'));
    aiSelected = new Set(Array.isArray(data) ? data : []);
    console.log(`🤖 AI预选: ${aiSelected.size} 条`);
  } catch(e) {}
}

console.log(`📝 ${subs.length} 条字幕 · AI预选 ${aiSelected.size} 条`);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>字幕审核 - 红华管家</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:#1a1a1a;color:#e0e0e0;height:100vh;display:flex;flex-direction:column;user-select:none}
    .header{background:#252525;padding:10px 20px;border-bottom:1px solid #333;display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-height:50px}
    .header h1{font-size:15px;color:#fff}
    .tag{font-size:11px;padding:3px 8px;border-radius:3px;background:#333;color:#888}
    .tag.new{background:#1a3a1a;color:#4CAF50}
    .main{flex:1;display:flex;overflow:hidden}
    .video-panel{flex:1;display:flex;flex-direction:column;padding:12px;gap:10px;min-width:0}
    .video-wrap{background:#000;border-radius:8px;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden}
    video{max-width:100%;max-height:100%;display:block}
    .no-video{color:#444;font-size:14px;padding:40px;line-height:2;text-align:center}
    .controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .btn{padding:7px 13px;border:none;border-radius:4px;cursor:pointer;font-size:13px;transition:background .12s;white-space:nowrap}
    .btn-primary{background:#4CAF50;color:white}
    .btn-primary:hover{background:#45a049}
    .btn-secondary{background:#2e2e2e;color:#ccc;border:1px solid #444}
    .btn-secondary:hover{background:#383838}
    .btn-danger{background:#c62828;color:white}
    .btn-danger:hover{background:#b71c1c}
    .btn-warning{background:#e65100;color:white}
    .btn-warning:hover{background:#bf360c}
    select{padding:7px 10px;background:#2e2e2e;color:white;border:1px solid #444;border-radius:4px;font-size:13px;cursor:pointer}
    .time-display{font-family:'Courier New',monospace;font-size:13px;color:#777;margin-left:auto}
    .skip-badge{font-size:11px;padding:3px 8px;background:#c62828;color:white;border-radius:3px;cursor:pointer}
    .skip-badge:hover{background:#d32f2f}
    .subtitle-panel{width:420px;border-left:1px solid #333;display:flex;flex-direction:column;overflow:hidden}
    .subtitle-header{padding:10px 15px;background:#252525;border-bottom:1px solid #333}
    .subtitle-header h2{font-size:13px;margin-bottom:4px}
    .stats{font-size:12px;color:#666}
    .stats b{color:#ff9800}
    .legend{display:flex;gap:10px;margin-top:4px;font-size:11px}
    .legend-item{display:flex;align-items:center;gap:4px}
    .legend-dot{width:8px;height:8px;border-radius:2px}
    .legend-dot.ai{background:#ff9800}
    .legend-dot.sel{background:#f44336}
    .legend-dot.cur{background:#2196F3}
    .subtitle-list{flex:1;overflow-y:auto;font-size:13px;line-height:1.8}
    .subtitle-item{padding:6px 15px;border-bottom:1px solid #222;cursor:pointer;display:flex;gap:8px;align-items:flex-start;transition:background .08s;position:relative}
    .subtitle-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:transparent}
    .subtitle-item:hover{background:#252525}
    .subtitle-item.selected{background:#2a1010}
    .subtitle-item.selected::before{background:#f44336}
    .subtitle-item.current{background:#1a1a3a}
    .subtitle-item.current::before{background:#2196F3}
    .subtitle-item.ai-selected{background:#1a1500}
    .subtitle-item.ai-selected::before{background:#ff9800}
    .subtitle-item.selected.ai-selected{background:#2a1a00}
    .subtitle-item.selected.ai-selected::before{background:#ff5722}
    .sub-num{font-size:11px;color:#444;min-width:24px;text-align:right;padding-top:1px}
    .sub-time{font-family:'Courier New',monospace;font-size:10px;color:#555;white-space:nowrap;min-width:80px;padding-top:2px;line-height:1.5;cursor:pointer}
    .sub-time:hover{color:#4CAF50}
    .edit-btn{background:none;border:none;cursor:pointer;font-size:12px;padding:2px 4px;opacity:0;transition:opacity 0.2s;line-height:1}
    .subtitle-item:hover .edit-btn{opacity:1}
    .edit-btn:hover{opacity:1;transform:scale(1.2)}
    .sub-text{flex:1;word-break:break-all;line-height:1.6;cursor:text;padding:1px 3px;border-radius:2px}
    .sub-text:hover{background:rgba(76,175,80,0.15)}
    .subtitle-item.selected .sub-text{text-decoration:line-through;color:#f44336}
    .sub-text-input{background:#1e3a1e;border:1px solid #4CAF50;color:#fff;padding:2px 6px;border-radius:3px;font-size:13px;font-family:inherit;width:70%;outline:none}
    .drag-hint{position:fixed;pointer-events:none;background:rgba(255,152,0,.15);border:1px dashed #ff9800;border-radius:3px;display:none;font-size:11px;color:#ff9800;padding:2px 6px;z-index:1000}
    .help-bar{padding:6px 15px;background:#1e1e1e;border-top:1px solid #333;font-size:11px;color:#555}
    .help-bar b{color:#888}
    .status-bar{padding:5px 15px;background:#1e1e1e;color:#888;font-size:12px}
    .status-bar.ok{background:#1a2a1a;color:#66bb6a}
    .status-bar.err{background:#2a1a1a;color:#ef5350}
    .status-bar.info{background:#1a1a2a;color:#64B5F6}
    .delete-preview{padding:8px 15px;background:#1e1e1e;border-top:1px solid #333;max-height:100px;overflow-y:auto;font-size:11px}
    .delete-preview pre{font-family:'Courier New',monospace;color:#888;white-space:pre-wrap;word-break:break-all}
    .file-input-wrap{display:flex;gap:10px;align-items:center}
    .file-input-wrap label{font-size:12px;cursor:pointer;color:#64B5F6}
    .file-input-wrap input{display:none}
  </style>
</head>
<body>
<div class="header">
  <h1>🎬 字幕审核</h1>
  <span class="tag">红华管家 v3.1</span>
  <span class="tag new">点击字幕文字=编辑 ✍️</span>
  <span class="tag new">E键/点击✏️=编辑 | S键=拆分</span>
  <span class="tag new">Shift+拖动=批量选中</span>
  <div class="file-input-wrap" style="margin-left:auto">
    <label for="videoInput">📹 视频</label><input type="file" id="videoInput" accept="video/*">
    <label for="autoSelectInput" style="color:#ff9800">🤖 AI预选JSON</label><input type="file" id="autoSelectInput" accept=".json,.txt">
  </div>
</div>
<div class="main">
  <div class="video-panel">
    <div class="video-wrap">
      <video id="v" controls></video>
      <div class="no-video" id="noVideo">请选择视频文件</div>
    </div>
    <div class="controls">
      <button class="btn btn-primary" id="playBtn" onclick="togglePlay()">▶ 播放</button>
      <select id="speedSelect">
        <option value="0.5">0.5x</option><option value="0.75">0.75x</option><option value="1" selected>1x</option>
        <option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option><option value="3">3x</option>
      </select>
      <button class="btn btn-secondary" onclick="jumpSel(-5)">⏪ -5s</button>
      <button class="btn btn-secondary" onclick="jumpSel(5)">⏩ +5s</button>
      <button class="btn btn-warning" onclick="selectAll()">☑ 全选</button>
      <button class="btn btn-secondary" onclick="invertAll()">🔄 反选</button>
      <button class="btn btn-danger" onclick="clearAll()">🗑 清空</button>
      <button class="btn btn-primary" onclick="copyDeleteList()">📋 复制删除</button>
      <button class="btn btn-warning" onclick="splitAtPlayhead()" title="快捷键 S">✂️ 拆分</button>
      <button class="skip-badge" id="skipBtn" onclick="toggleSkip()">⏭ 跳过</button>
      <span class="time-display" id="td">00:00 / 00:00</span>
    </div>
    <div class="status-bar" id="statusBar">就绪 · 单击=跳转 | 双击=选中 | 点击文字=编辑 | S=拆分</div>
  </div>
  <div class="subtitle-panel">
    <div class="subtitle-header">
      <h2>字幕列表 <span id="cnt">(${subs.length})</span></h2>
      <div class="stats">已选 <b id="selCount">0</b> 条 · AI预选 <b id="aiCount">${aiSelected.size}</b> 条 · 删除约 <b id="delDur">0</b>s</div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot ai"></div>AI预选</div>
        <div class="legend-item"><div class="legend-dot sel"></div>已选删除</div>
        <div class="legend-item"><div class="legend-dot cur"></div>当前播放</div>
      </div>
    </div>
    <div class="subtitle-list" id="subList"></div>
    <div class="delete-preview" id="delPreview" style="display:none"><pre id="delPre"></pre></div>
    <div class="help-bar">
      <b>🖱单击</b>=跳转 &nbsp;<b>🖱双击</b>=选中 &nbsp;<b>点击文字</b>=编辑 &nbsp;<b>Shift+拖动</b>=批量 &nbsp;<b>⌨S</b>=拆分 &nbsp;<b>⌨空格</b>=播放/暂停 &nbsp;<b>←→</b>=跳转1s &nbsp;<b>Shift+←→</b>=跳转5s
    </div>
  </div>
</div>
<div class="drag-hint" id="dragHint">批量选中</div>
<script>
const v=document.getElementById('v'),noVideo=document.getElementById('noVideo'),subList=document.getElementById('subList');
const td=document.getElementById('td'),statusBar=document.getElementById('statusBar');
const cnt=document.getElementById('cnt'),selCount=document.getElementById('selCount'),aiCount=document.getElementById('aiCount');
const delDur=document.getElementById('delDur'),delPreview=document.getElementById('delPreview'),delPre=document.getElementById('delPre');
const playBtn=document.getElementById('playBtn'),speedSelect=document.getElementById('speedSelect'),dragHint=document.getElementById('dragHint'),skipBtn=document.getElementById('skipBtn');

const subs=${JSON.stringify(subs)};
let selected=new Set(${JSON.stringify(Array.from(aiSelected))});
let aiSelected=new Set(${JSON.stringify(Array.from(aiSelected))});
let curIdx=-1,lastDragIdx=-1,isDragging=false;
let editingIdx=-1;

document.getElementById('videoInput').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  v.src=URL.createObjectURL(f);noVideo.style.display='none';v.style.display='block';
  setStatus('视频已加载','info');
});
document.getElementById('autoSelectInput').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=ev=>{try{aiSelected=new Set(JSON.parse(ev.target.result));render();updateStats();setStatus('AI预选已加载 '+aiSelected.size+' 条','info');}catch(err){setStatus('AI预选JSON错误','err');}};
  reader.readAsText(f);
});
function render(){
  cnt.textContent='('+subs.length+')';aiCount.textContent=aiSelected.size;updateStats();
  subList.innerHTML=subs.map((s,i)=>{
    const cls=[selected.has(i)?'selected':'',curIdx===i?'current':'',aiSelected.has(i)?'ai-selected':''].filter(Boolean).join(' ');
    const textHtml=editingIdx===i
      ?'<input type="text" class="sub-text-input" value="'+esc(s.text||'')+'" onblur="saveEdit('+i+',this.value)" onkeydown="if(event.key===" + String.fromCharCode(39) + "Enter" + String.fromCharCode(39) + ")this.blur()">'
      :'<span class="sub-text" onclick="startEdit('+i+')">'+esc(s.text||'')+'</span><button class="edit-btn" onclick="startEdit('+i+')" title="编辑 (E)">✏️</button>';
    return'<div class="subtitle-item '+cls+'" data-idx="'+i+'" onmousedown="onMD(event,'+i+')" onmousemove="onMM(event,'+i+')" onmouseup="onMU(event,'+i+')" ondblclick="onDbl('+i+')"><span class="sub-num">'+(i+1)+'</span><span class="sub-time" onclick="jump('+i+')">'+fmt(s.start)+' → '+fmt(s.end)+'</span>'+textHtml+'</div>';
  }).join('');
  if(editingIdx>=0){
    const el=subList.querySelector('[data-idx="'+editingIdx+'"] .sub-text-input');
    if(el){el.focus();el.select();}
  }
}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmt(s){const m=Math.floor(s/60),sec=(s%60).toFixed(2);return String(m).padStart(2,'0')+':'+sec.padStart(5,'0');}
function fmt2(s){if(!s||isNaN(s))return'00:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}
function jump(i){if(!subs[i])return;curIdx=i;lastDragIdx=i;v.currentTime=subs[i].start;v.play().catch(()=>{});render();scrollTo(i);}
function scrollTo(i){const el=subList.querySelector('[data-idx="'+i+'"]');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});}
function startEdit(idx){editingIdx=idx;render();}
function saveEdit(idx,newText){if(subs[idx]){subs[idx].text=newText.trim();setStatus('✅ 已保存: "'+subs[idx].text+'"','ok');}editingIdx=-1;render();updateStats();}
function splitAtPlayhead(){
  if(curIdx<0||curIdx>=subs.length){setStatus('⚠ 请先播放到要拆分的位置','err');return;}
  const t=v.currentTime;const s=subs[curIdx];
  if(t<=s.start||t>=s.end){setStatus('⚠ 播放头 '+fmt(t)+' 不在字幕 '+(curIdx+1)+' 范围内 ['+fmt(s.start)+'-'+fmt(s.end)+']','err');return;}
  const newSub={start:+t.toFixed(3),end:+s.end.toFixed(3),text:s.text};
  s.end=+t.toFixed(3);
  subs.splice(curIdx+1,0,newSub);
  setStatus('✅ 已拆分字幕 '+(curIdx+1)+'，新字幕在 '+fmt(t)+' 处断开','ok');
  render();updateStats();
}
function onMD(e,i){if(e.button!==0)return;e.preventDefault();}
function onMM(e,i){}
function onMU(e,i){
  if(e.button!==0)return;
  if(e.shiftKey){
    isDragging=true;
    const from=Math.min(lastDragIdx>=0?lastDragIdx:i,i);
    const to=Math.max(lastDragIdx>=0?lastDragIdx:i,i);
    selected.clear();
    for(let j=from;j<=to;j++)selected.add(j);
    render();updateStats();
    dragHint.style.display='block';dragHint.style.left=(e.clientX+5)+'px';dragHint.style.top=(e.clientY-20)+'px';
    lastDragIdx=i;
  }else{jump(i);}
}
document.addEventListener('mousemove',e=>{if(!isDragging)return;
  const item=e.target.closest('.subtitle-item');if(!item)return;
  const idx=parseInt(item.dataset.idx);
  const from=Math.min(lastDragIdx,idx),to=Math.max(lastDragIdx,idx);
  selected.clear();for(let j=from;j<=to;j++)selected.add(j);
  render();updateStats();
  dragHint.style.left=(e.clientX+5)+'px';dragHint.style.top=(e.clientY-20)+'px';
});
document.addEventListener('mouseup',()=>{if(isDragging){isDragging=false;dragHint.style.display='none';}});
function onDbl(i){selected.has(i)?selected.delete(i):selected.add(i);render();updateStats();}
v.addEventListener('timeupdate',()=>{
  const t=v.currentTime;
  const i=subs.findIndex(s=>t>=s.start&&t<s.end);
  if(i>=0&&i!==curIdx){curIdx=i;render();scrollTo(i);}
  if(skipBtn._enabled!==false){for(const si of Array.from(selected).sort((a,b)=>a-b)){const s=subs[si];if(s&&t>=s.start&&t<s.end){v.currentTime=s.end;return;}}}
  td.textContent=fmt2(t)+' / '+fmt2(v.duration);
});
v.addEventListener('play',()=>playBtn.textContent='⏸ 暂停');v.addEventListener('pause',()=>playBtn.textContent='▶ 播放');
function togglePlay(){v.paused?v.play().catch(()=>{}):v.pause();}
function toggleSkip(){skipBtn._enabled=skipBtn._enabled===false?true:false;skipBtn.style.background=skipBtn._enabled?'#c62828':'#555';setStatus(skipBtn._enabled?'⏭ 跳过已开启':'⏭ 跳过已关闭');}
function jumpSel(d){v.currentTime=Math.max(0,Math.min(v.duration||0,v.currentTime+d));}
function selectAll(){subs.forEach((_,i)=>selected.add(i));render();updateStats();}
function clearAll(){selected.clear();render();updateStats();}
function invertAll(){subs.forEach((_,i)=>{selected.has(i)?selected.delete(i):selected.add(i);});render();updateStats();}
function updateStats(){selCount.textContent=selected.size;let d=0;selected.forEach(i=>{if(subs[i])d+=subs[i].end-subs[i].start;});delDur.textContent=d.toFixed(1);updateDelPreview();}
function updateDelPreview(){if(!selected.size){delPreview.style.display='none';return;}delPreview.style.display='block';
  const segs=[];Array.from(selected).sort((a,b)=>a-b).forEach(i=>{if(subs[i])segs.push({start:+subs[i].start.toFixed(3),end:+subs[i].end.toFixed(3)});});
  const m=[];for(const s of segs){if(!m.length){m.push({...s});continue;}if(Math.abs(s.start-m[m.length-1].end)<0.1){m[m.length-1].end=s.end;}else{m.push({...s});}}
  delPre.textContent=JSON.stringify(m,null,2);
}
function copyDeleteList(){if(!selected.size){setStatus('⚠ 请先选中字幕','err');return;}
  const segs=[];Array.from(selected).sort((a,b)=>a-b).forEach(i=>{if(subs[i])segs.push({start:+subs[i].start.toFixed(3),end:+subs[i].end.toFixed(3)});});
  const m=[];for(const s of segs){if(!m.length){m.push({...s});continue;}if(Math.abs(s.start-m[m.length-1].end)<0.1){m[m.length-1].end=s.end;}else{m.push({...s});}}
  navigator.clipboard.writeText(JSON.stringify(m,null,2)).then(()=>setStatus('✅ 已复制 '+m.length+' 个片段（已合并相邻）','ok')).catch(()=>{const t=document.createElement('textarea');t.value=JSON.stringify(m,null,2);document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);setStatus('✅ 已复制','ok');});
}
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  else if(e.code==='ArrowLeft'){e.preventDefault();v.currentTime=Math.max(0,v.currentTime-(e.shiftKey?5:1));}
  else if(e.code==='ArrowRight'){e.preventDefault();v.currentTime=Math.min(v.duration||0,v.currentTime+(e.shiftKey?5:1));}
  else if(e.code==='KeyA'&&!e.ctrlKey&&!e.metaKey){selectAll();}
  else if(e.code==='KeyS'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();splitAtPlayhead();}
  else if(e.code==='KeyE'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();const i=curIdx;if(i>=0&&i<subs.length){editingIdx=i;render();setTimeout(()=>{const el=subList.querySelector('[data-idx="'+editingIdx+'"] .sub-text-input');if(el){el.focus();el.select();}},10);}}
  else if(e.code==='Escape'){if(editingIdx>=0){editingIdx=-1;render();}else{clearAll();}}
});
speedSelect.addEventListener('change',()=>{v.playbackRate=parseFloat(speedSelect.value);});
function setStatus(msg,type=''){statusBar.textContent=msg;statusBar.className='status-bar'+(type?' '+type:'');}
render();
</script>
</body>
</html>`;

fs.writeFileSync(outputFile, html);
console.log(`✅ 已生成: ${outputFile}`);
console.log(`📌 双击 ${outputFile} 在浏览器中打开`);
console.log(`📌 点击✏️或E键=编辑 | S键=拆分 | Shift+点击=批量选中 | 双击=选中/取消`);

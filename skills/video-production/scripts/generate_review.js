#!/usr/bin/env node
/**
 * 生成字幕审核网页
 *
 * 用法: node generate_review.js <subtitles.json> [output.html]
 *
 * 输出: review.html（可本地双击打开，无需服务器）
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'review.html';

if (!inputFile) {
  console.log('❌ 用法: node generate_review.js <subtitles.json> [output.html]');
  console.log('   示例: node generate_review.js subtitles_with_time.json');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error('❌ 文件不存在:', inputFile);
  process.exit(1);
}

const subtitles = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
if (!Array.isArray(subtitles)) {
  console.error('❌ JSON格式错误：需要数组');
  process.exit(1);
}

console.log(`📝 读取 ${subtitles.length} 条字幕...`);

// 简单的 HTML 生成（嵌入字幕数据，用户本地打开即可）
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>字幕审核</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #1a1a1a; color: #e0e0e0; }
    .header { background: #252525; padding: 12px 20px; border-bottom: 1px solid #333; display: flex; gap: 15px; align-items: center; flex-wrap: wrap; }
    h1 { font-size: 16px; }
    .info { font-size: 13px; color: #888; }
    .main { display: flex; height: calc(100vh - 55px); }
    .video-panel { flex: 1; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
    video { width: 100%; max-height: 60vh; background: #000; border-radius: 6px; }
    .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .btn { padding: 8px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn-primary { background: #4CAF50; color: white; }
    .btn-secondary { background: #333; color: #ddd; }
    .btn-danger { background: #f44336; color: white; }
    .btn-warning { background: #ff9800; color: white; }
    .speed { padding: 7px 10px; background: #333; color: white; border: none; border-radius: 4px; }
    .time { font-family: monospace; color: #888; font-size: 13px; margin-left: auto; }
    .status { padding: 6px 15px; background: #1a1a3a; color: #64B5F6; font-size: 12px; }
    .subtitle-panel { width: 400px; border-left: 1px solid #333; display: flex; flex-direction: column; }
    .sub-header { padding: 12px 15px; background: #252525; border-bottom: 1px solid #333; }
    .sub-header h2 { font-size: 14px; margin-bottom: 6px; }
    .stats { font-size: 12px; color: #888; }
    .stats .s { color: #ff9800; }
    .sub-list { flex: 1; overflow-y: auto; }
    .sub-item { padding: 8px 15px; border-bottom: 1px solid #252525; cursor: pointer; display: flex; gap: 10px; }
    .sub-item:hover { background: #252525; }
    .sub-item.sel { background: #3a1a1a; border-left: 3px solid #f44336; }
    .sub-item.sel .sub-text { text-decoration: line-through; color: #f44336; }
    .sub-item.cur { background: #1a2a4a; border-left: 3px solid #2196F3; }
    .sub-time { font-family: monospace; font-size: 11px; color: #666; min-width: 85px; }
    .sub-text { flex: 1; font-size: 13px; word-break: break-all; }
    .help-bar { padding: 8px 15px; background: #252525; border-top: 1px solid #333; font-size: 12px; color: #666; }
    .preview { padding: 10px 15px; background: #252525; border-top: 1px solid #333; max-height: 100px; overflow-y: auto; }
    .preview pre { font-family: monospace; font-size: 11px; color: #aaa; white-space: pre-wrap; }
  </style>
</head>
<body>
<div class="header">
  <h1>🎬 字幕审核</h1>
  <span class="info">${subtitles.length} 条字幕 · 红华管家</span>
  <label style="font-size:13px;cursor:pointer;color:#64B5F6;margin-left:auto;">
    📹 选择视频
    <input type="file" id="videoInput" accept="video/*" style="display:none">
  </label>
</div>
<div class="main">
  <div class="video-panel">
    <video id="v" controls></video>
    <div class="controls">
      <button class="btn btn-primary" id="playBtn" onclick="togglePlay()">▶️ 播放</button>
      <select class="speed" onchange="v.playbackRate=parseFloat(this.value)">
        <option value="0.5">0.5x</option><option value="1" selected>1x</option>
        <option value="1.5">1.5x</option><option value="2">2x</option><option value="3">3x</option>
      </select>
      <button class="btn btn-warning" onclick="selectAll()">☑️ 全选</button>
      <button class="btn btn-danger" onclick="clearAll()">🗑️ 清空</button>
      <button class="btn btn-primary" onclick="copyList()">📋 复制删除列表</button>
      <span class="time" id="td">00:00 / 00:00</span>
    </div>
    <div class="status" id="status">就绪 · 点击字幕跳转，双击选中（删除）</div>
  </div>
  <div class="subtitle-panel">
    <div class="sub-header">
      <h2>字幕列表 <span id="cnt">(${subtitles.length})</span></h2>
      <div class="stats">已选 <span class="s" id="sel">0</span> 条 · 删除约 <span class="s" id="del">0</span>s</div>
    </div>
    <div class="sub-list" id="list"></div>
    <div class="preview" id="preview" style="display:none"><pre id="p"></pre></div>
    <div class="help-bar">
      <span>🖱️ 单击=跳转</span><span>🖱️ 双击=选中</span><span>⌨️ 空格=播放/暂停</span>
    </div>
  </div>
</div>
<script>
const v=document.getElementById('v'), list=document.getElementById('list');
const td=document.getElementById('td'), sel=document.getElementById('sel');
const del=document.getElementById('del'), cnt=document.getElementById('cnt');
const status=document.getElementById('status'), preview=document.getElementById('preview');
const p=document.getElementById('p'), playBtn=document.getElementById('playBtn');
const subs=${JSON.stringify(subtitles)};
let selected=new Set(), cur=-1;

document.getElementById('videoInput').addEventListener('change',e=>{
  const f=e.target.files[0];
  if(f){v.src=URL.createObjectURL(f);setStatus('视频已加载','info');}
});

function render(){
  cnt.textContent='('+subs.length+')';
  list.innerHTML=subs.map((s,i)=>'<div class="sub-item'+(selected.has(i)?' sel':'')+(cur===i?' cur':'')+'" onclick="jump('+i+')" ondblclick="toggle('+i+')"><span class="sub-time">'+fmt(s.start)+' → '+fmt(s.end)+'</span><span class="sub-text">'+esc(s.text||'')+'</span></div>').join('');
  updateStats();
}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmt(s){const m=Math.floor(s/60),sec=(s%60).toFixed(2);return String(m).padStart(2,'0')+':'+sec.padStart(5,'0');}
function fmt2(s){if(!s||isNaN(s))return'00:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}
function jump(i){if(!subs[i])return;v.currentTime=subs[i].start;v.play().catch(()=>{});cur=i;render();}
function toggle(i){selected.has(i)?selected.delete(i):selected.add(i);render();}
function updateStats(){
  sel.textContent=selected.size;
  let d=0;selected.forEach(i=>{if(subs[i])d+=subs[i].end-subs[i].start;});
  del.textContent=d.toFixed(1);
  if(selected.size===0){preview.style.display='none';return;}
  preview.style.display='block';
  const segs=[];Array.from(selected).sort((a,b)=>a-b).forEach(i=>{if(subs[i])segs.push({start:parseFloat(subs[i].start.toFixed(3)),end:parseFloat(subs[i].end.toFixed(3))});});
  // 合并相邻
  const m=[];
  for(const s of segs){if(m.length===0){m.push({...s});continue;}const l=m[m.length-1];if(Math.abs(s.start-l.end)<0.1){l.end=s.end;}else{m.push({...s});}}
  p.textContent=JSON.stringify(m,null,2);
}
function selectAll(){subs.forEach((_,i)=>selected.add(i));render();}
function clearAll(){selected.clear();render();}
function copyList(){
  if(selected.size===0){setStatus('⚠️ 请先选中字幕');return;}
  const segs=[];Array.from(selected).sort((a,b)=>a-b).forEach(i=>{if(subs[i])segs.push({start:parseFloat(subs[i].start.toFixed(3)),end:parseFloat(subs[i].end.toFixed(3))});});
  const m=[];for(const s of segs){if(m.length===0){m.push({...s});continue;}const l=m[m.length-1];if(Math.abs(s.start-l.end)<0.1){l.end=s.end;}else{m.push({...s});}}
  navigator.clipboard.writeText(JSON.stringify(m,null,2)).then(()=>setStatus('✅ 已复制 '+m.length+' 个片段（已合并相邻）')).catch(()=>{const t=document.createElement('textarea');t.value=JSON.stringify(m,null,2);document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);setStatus('✅ 已复制（fallback）');});
}
function togglePlay(){v.paused?v.play().catch(()=>{}):v.pause();}
function setStatus(msg,type=''){status.textContent=msg;status.className='status'+(type?' '+type:' status');}
v.addEventListener('timeupdate',()=>{
  const t=v.currentTime;
  const i=subs.findIndex(s=>t>=s.start&&t<s.end);
  if(i>=0&&i!==cur){cur=i;render();}
  td.textContent=fmt2(t)+' / '+fmt2(v.duration);
});
v.addEventListener('play',()=>playBtn.textContent='⏸️ 暂停');
v.addEventListener('pause',()=>playBtn.textContent='▶️ 播放');
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  else if(e.code==='ArrowLeft'){v.currentTime=Math.max(0,v.currentTime-(e.shiftKey?5:1));}
  else if(e.code==='ArrowRight'){v.currentTime=v.currentTime+(e.shiftKey?5:1);}
});
render();
</script>
</body>
</html>`;

fs.writeFileSync(outputFile, html);
console.log(`✅ 已生成: ${outputFile}`);
console.log(`📌 双击 ${outputFile} 在浏览器中打开`);
console.log(`📌 加载视频后，点击字幕跳转，双击选中要删除的片段`);
console.log(`📌 点击"复制删除列表"获取 JSON 格式的删除片段`);

#!/usr/bin/env node
/**
 * review.html 生成器
 * 
 * 用法:
 *   node generate_review.js <视频文件> <字幕JSON文件> [输出路径]
 * 
 * 示例:
 *   node generate_review.js video.mp4 subtitles_with_time.json
 *   node generate_review.js video.mp4 subtitles_with_time.json my_review.html
 *
 * 字幕JSON格式支持:
 *   - 纯数组: [{start, end, text}, ...]
 *   - {subs: [...]} 或 {subtitles: [...]}
 *   - 支持 start/end/tstart/tend 等多种字段名
 */

const fs = require('fs');
const path = require('path');

// ============ 参数解析 ============
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('用法: node generate_review.js <视频文件> <字幕JSON文件> [输出路径]');
  process.exit(1);
}

const videoPath = path.resolve(args[0]);
const jsonPath = path.resolve(args[1]);
const outputPath = args[2]
  ? path.resolve(args[2])
  : path.join(path.dirname(jsonPath), 'review.html');

// ============ 读取文件 ============
if (!fs.existsSync(videoPath)) {
  console.error('❌ 视频文件不存在:', videoPath);
  process.exit(1);
}
if (!fs.existsSync(jsonPath)) {
  console.error('❌ 字幕JSON不存在:', jsonPath);
  process.exit(1);
}

// 获取当前脚本所在目录（skills/video-production/scripts/）
const scriptDir = __dirname;
const templatePath = path.join(scriptDir, 'review.html');

if (!fs.existsSync(templatePath)) {
  console.error('❌ 模板文件不存在:', templatePath);
  console.error('请确保 review.html 在同一目录下');
  process.exit(1);
}

let template = fs.readFileSync(templatePath, 'utf8');
let rawData = fs.readFileSync(jsonPath, 'utf8');

// ============ 解析字幕JSON ============
let rawJson;
try {
  rawJson = JSON.parse(rawData);
} catch (e) {
  console.error('❌ JSON解析失败:', e.message);
  process.exit(1);
}

// 支持多种格式
let subsArray;
if (Array.isArray(rawJson)) {
  subsArray = rawJson;
} else if (rawJson.subs && Array.isArray(rawJson.subs)) {
  subsArray = rawJson.subs;
} else if (rawJson.subtitles && Array.isArray(rawJson.subtitles)) {
  subsArray = rawJson.subtitles;
} else if (rawJson.segments && Array.isArray(rawJson.segments)) {
  // faster-whisper 格式
  subsArray = rawJson.segments.map((seg, i) => ({
    start: seg.tstart / 1000,
    end: seg.tend / 1000,
    text: seg.text || seg.words?.map(w => w.word).join('') || ''
  }));
} else {
  console.error('❌ 字幕JSON格式不支持');
  console.error('支持的格式: 数组 | {subs} | {subtitles} | {segments}');
  process.exit(1);
}

// 标准化字段名
function normalizeTime(val) {
  if (typeof val === 'number') return val;
  if (val == null) return 0;
  // tstart/tend 可能是毫秒
  return parseFloat(val) > 1000 ? parseFloat(val) / 1000 : parseFloat(val);
}

subsArray = subsArray.map(item => ({
  start: normalizeTime(item.start ?? item.tstart ?? item.begin ?? 0),
  end: normalizeTime(item.end ?? item.tend ?? item.finish ?? 0),
  text: String(item.text || item.content || item.word || '')
}));

// ============ 生成字幕数组代码 ============
const subsCode = 'const subs=' + JSON.stringify(subsArray, null, 2) + ';';

// ============ 替换模板内容 ============

// 1. 替换字幕数据
template = template.replace(/const subs=\[[\s\S]*?\n\];/, subsCode);

// 2. 替换视频路径（支持 file:// 和绝对路径）
const videoSrc = 'file://' + videoPath.replace(/\\/g, '/');
template = template.replace(
  /<video[^>]*src="[^"]*"/,
  `<video id="v" src="${videoSrc}" controls style="width:100%;max-width:480px;background:#000">`
);

// 3. 输出文件
fs.writeFileSync(outputPath, template, 'utf8');

// ============ 完成 ============
const videoSize = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
const subCount = subsArray.length;
console.log('✅ 审核页面已生成');
console.log('   视频:', videoPath);
console.log('   字幕:', subCount + '条');
console.log('   输出:', outputPath);
console.log('');
console.log('用浏览器打开:', outputPath);

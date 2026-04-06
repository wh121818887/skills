# videocut - 语义剪辑技能（OpenClaw适配版）

## 核心思路

把 videocut-skills 的语义剪辑流程适配到 OpenClaw 工作区。

**核心问题**：口播视频里说错了、说重复了、说一半停了——这些剪映智能剪口播识别不了的，AI 可以。

**输入**：mp4视频文件
**输出**：经语义审核后剪辑的视频

## 完整流程

```
1. 提取音频 → audio.mp3
2. faster-whisper 词级转录 → subtitles_words.json
3. AI语义分析（9类规则） → auto_selected.json
4. 生成审核网页 → review.html
5. 启动审核服务器 → http://localhost:8899
6. 宝哥审核确认 → 点击执行剪辑
7. FFmpeg filter_complex 精确剪辑 → 输出视频
```

## 执行方式

### 方式A：直接运行（自动全程）
```
/videocut 视频路径
```

### 方式B：分步执行
```
/videocut:转录 视频路径     # 只做转录
/videocut:分析              # AI分析口误
/videocut:审核              # 生成并打开审核网页
/videocut:剪辑 视频路径     # 执行剪辑
```

## 技术规格

- 转录：faster-whisper large-v3（已有本地模型）
- 词级时间戳：faster-whisper word_timings=True
- 审核前端：wavesurfer.js v7 + 内网穿透
- 剪辑：FFmpeg filter_complex + 50ms扩展 + 30ms跨淡

## 依赖

- ffmpeg ✅
- python3 + faster-whisper ✅
- node.js ✅
- cut_video.sh ✅（来自videocut-skills）
- generate_review.js ✅（来自videocut-skills）
- review_server.js ✅（来自videocut-skills）

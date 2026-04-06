---
name: video-production
description: 口播视频制作完整流程。从原始素材到带字幕成品视频的完整流程，包括：音频提取、字幕生成、时间戳校验、视频合成、封面制作。关键词：视频制作、口播视频、字幕生成、视频剪辑、Whisper转写、竖屏视频、帮我制作视频、生成字幕。
---

# 口播视频制作 SOP v3

从原始素材到成品视频的完整流程。整合了 videecut-skills 的精华设计。

---

## 核心原则（来自 EP01 经验 + videocut-skills）

1. **先逐条清理，再拼装** — 音频必须先处理干净再拼接，绝对不能先拼再处理
2. **逐条校验时间戳** — 每条字幕都要核对，不能只看总数
3. **竖屏优先** — 制造业IP主要平台是抖音/快手/视频号，竖屏9:16
4. **删前保后** — 后说的通常更完整
5. **整句删除** — 残句、重复句都要删整句，不是只删异常部分
6. **先分句，再比对**（videocut-skills）— 比对重复句之前必须先完成分句
7. **规则整合到正文**（videocut-skills）— 自进化时整合到正文相应位置，不要只往末尾加

---

## 流程概览

```
素材检查 → 竖屏裁剪 → 视频拼接 → 音频提取 → 音频清理 → 音频拼接 → Whisper转写 → 字幕断句 → 口播审核 → 字幕校验 → 视频合成 → 封面制作
```

对比 v2 新增：
- **口播审核**（借鉴videocut-skills review.html）：网页交互式审核，Shift+拖动批量选中，播放跳过已选片段
- **字幕校验**（借鉴videocut-skills subtitle_server.js）：双击编辑字幕，SSE进度烧录

---

## 输出目录结构（借鉴videocut-skills）

```
output/
└── YYYY-MM-DD_视频名/
    ├── 1_转录/              # 原始转录结果
    │   ├── audio.mp3
    │   ├── volcengine_result.json   # 或 faster-whisper 输出
    │   └── subtitles_words.json     # 词级时间戳
    ├── 2_分析/              # AI 分析结果
    │   ├── readable.txt              # 易读格式
    │   ├── auto_selected.json        # 预选删除片段
    │   └── 口误分析.md               # 分析记录
    ├── 3_审核/              # 审核产物
    │   └── review.html              # 口播审核网页
    └── 字幕/
        ├── subtitles_with_time.json  # 字幕JSON
        ├── video.srt                 # SRT字幕
        └── video_字幕.mp4            # 最终成片
```

**规则**：已有文件夹则复用，否则新建。

---

## 步骤详解

### 步骤1：素材接收与检查

**检查项**：
- [ ] 视频格式（MP4 / MOV）
- [ ] 分辨率（是否竖屏 1080x1920）
- [ ] 时长
- [ ] 是否多段（1-N段）
- [ ] 每段音频是否清晰

**多段视频**：分别处理，每段独立提取音频。

---

### 步骤2：竖屏裁剪（重要！）

**目的**：将横屏素材裁剪为竖屏9:16，或将已竖屏素材缩放至统一分辨率。

**裁剪参数公式**：
```
crop=1080:1920:X_offset:Y_offset
     宽   高   X偏    Y偏
X偏 = (原片宽度 - 1080) / 2  （人物居中时）
Y偏 = 根据人物上下位置调整
```

**⚠️ 必须保留音频！** 错误用法：`-an`（不要音频）会导致拼接后无音轨，无法转写。

```bash
# ✅ 正确：保留音频
ffmpeg -y -i input.mp4 -t {时长+0.5} \
  -vf "crop=1080:1920:420:0,scale=1080:1920" \
  -c:v libx264 -preset fast -c:a aac -b:a 128k \
  output_portrait.mp4

# ❌ 错误：-an 会丢失音轨！
ffmpeg -y -i input.mp4 -vf "crop=1080:1920:420:0" -c:v libx264 -an output.mp4
```

**每段结尾多留0.5秒buffer**：防止最后一个字被截断。
```bash
# 原片12秒 → 裁剪时指定 12.5秒
-t 12.5  # 不是 -t 12
```

**验证裁剪结果**：
```bash
ffprobe -show_entries stream=width,height -of default=noprint_wrappers=1 input_portrait.mp4
# 应输出：width=1080 height=1920
```

**判断裁剪位置的简单方法**（截帧分析）：
1. 截取关键帧：`ffmpeg -ss 2 -i input.mp4 -frames:v 1 preview.jpg`
2. 用image工具分析：人物在左/中/右？头部是否在画面上1/3？
3. X偏 = (1920-1080)/2 = 420（人物居中）
4. Y偏一般 = 0（从头裁），如果人物站得靠下则Y偏 > 0

---

### 步骤3：视频拼接

```bash
# 创建文件列表
cat > list.txt << 'EOF'
file '/path/to/L1_portrait.mp4'
file '/path/to/L2_portrait.mp4'
EOF

# 拼接（流复制，不重新编码）
ffmpeg -y -f concat -safe 0 -i list.txt -c copy output_combined.mp4
```

**验证**：
```bash
ffprobe -show_entries format=duration -of default=noprint_wrappers=1 input.mp4
# 总时长 ≈ 各段时长之和
```

---

### 步骤4：音频提取

```bash
ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav
```

**参数说明**：
- `-ar 16000`：采样率16kHz（Whisper推荐）
- `-ac 1`：单声道
- `-vn`：不要视频

**多段分别提取**：`audio/raw_L1.wav`、`audio/raw_L2.wav`

**⚠️ 如果视频无音轨**（可能因为裁剪时用了 `-an`）：
1. 检查原片是否有音轨：`ffmpeg -i input.mp4 2>&1 | grep Stream`
2. 有音轨但拼接后无音轨 → 重做视频拼接步骤（不要用 `-an`）

---

### 步骤5：音频清理（关键！）

**原则：先逐条处理，再拼装。绝对不能先拼再处理！**

**清理操作**：
1. 逐条听每一段原始音频
2. 删除无效内容：
   - 321倒计时
   - 开场废话（"好，我们开始"之类）
   - 语气词（嗯、这个、那个、就是说）
   - 末尾废话
   - 静默超过0.5秒的部分
3. 记录切点（精确到毫秒）

**切点记录格式**：
```
L1: 删0.00-2.50s → 保留2.50s-end
L2: 删0.50-15.94s → 保留0.00-0.50s + 15.94s-end
```

**⚠️ 注意**：确认每条干净后再进入拼装步骤。

---

### 步骤6：音频拼接

```python
from pydub import AudioSegment

segments = [
    AudioSegment.from_wav("trim_L1.wav"),
    AudioSegment.from_wav("trim_L2.wav"),
]
combined = sum(segments)
combined.export("combined.wav", format="wav")
```

**验证**：总时长 = 各段时长之和

---

### 步骤7：Whisper字幕生成

```python
from faster_whisper import WhisperModel

# 加载词典作为热词提示（借鉴videocut-skills热词机制）
with open("词典.txt") as f:
    hot_words = f.read().strip()

model = WhisperModel("large-v3", device="cpu", compute_type="int8")
result = model.transcribe(
    "combined.wav",
    language="zh",
    word_timestamps=True,
    initial_prompt=hot_words  # 热词注入
)
```

**获取词级时间戳**（用于精确断句）：
```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cpu", compute_type="int8")
wt = model.transcribe_word_level_timing(
    audio="combined.wav",
    language="zh",
)
# wt.segments 包含每个词的时间戳
```

**⚠️ 踩坑**：标点符号（,，。？！）不进入词级时间戳。断句时直接用转写出来的纯文字匹配，不要用标点位置去映射。

---

### 步骤8：字幕断句

**断句规则（整合videocut-skills的7条优先级规则）**：

| 优先级 | 类型 | 判断方法 | 删除范围 |
|--------|------|----------|----------|
| 1 | 重复句 | 相邻句子开头≥5字相同 | 较短的**整句** |
| 2 | 隔一句重复 | 中间是残句时，比对前后句 | 前句+残句 |
| 3 | 残句 | 话说一半+静音 | **整个残句** |
| 4 | 句内重复 | A+中间+A 模式 | 前面部分 |
| 5 | 卡顿词 | 那个那个、就是就是 | 前面部分 |
| 6 | 重说纠正 | 部分重复/否定纠正 | 前面部分 |
| 7 | 语气词 | 嗯、啊、那个 | 标记但不自动删 |

**核心原则**：
- **先分句，再比对**：用静音切分成句子列表，再比对相邻句子
- **整句删除**：残句、重复句都要删整句，不只是删异常的几个字
- **分段执行**：每300行字幕为一批次，逐批分析，避免上下文丢失

**字数限制**：
- 硬上限：10字/组
- 低于5字的短句：如果前一句已达8-10字则合并，否则可单独

**不要做的**：
- 不要把"TPE"分开
- 不要把"一吨多少钱"分开
- 不要强行凑10字

**检测规则执行顺序**：
1. 静音段处理（≥0.3s标记）
2. 语气词检测
3. 重复句检测（相邻/隔一/连续）
4. 残句检测
5. 重说纠正检测
6. 句内重复检测
7. 连续语气词检测

---

### 步骤9：口播审核（借鉴videocut-skills review.html）

**生成审核网页**：
```bash
cd output/YYYY-MM-DD_视频名/3_审核/
node /path/to/skills/video-production/scripts/generate_review.js \
  ../../1_转录/subtitles_words.json \
  ../../2_分析/auto_selected.json \
  ../../1_转录/audio.mp3
```

**审核网页功能**：
- **点击字幕**：跳转到该时间点播放
- **双击字幕**：选中/取消（红色删除线）
- **点击字幕文字**：直接编辑文字内容，回车保存
- **S键 / ✂️拆分按钮**：在播放头位置拆分当前字幕，自动生成两条字幕
- **Shift+拖动**：批量选中连续片段
- **播放时跳过已选片段**：不播放已标记删除的内容
- **橙色标记**：AI预选的口误片段
- **复制删除列表**：一键获取JSON格式删除片段（自动合并相邻片段）

**审核流程**：
1. 打开 review.html，加载视频文件
2. 逐条播放确认，修正误判
3. 点击"复制删除列表"获取删除JSON
4. 用删除列表进行FFmpeg精确剪辑

**Shift+拖动批量选中（借鉴videocut-skills核心创新）**：
```javascript
// review.html 中的关键逻辑
dom.addEventListener('mousedown', (e) => {
  if (e.shiftKey && isDragging) {
    // 批量选中拖动范围内的所有字幕
    words.slice(startIdx, currentIdx).forEach(i => selected.add(i));
  }
});
```

**播放时跳过已选片段（借鉴videocut-skills核心创新）**：
```javascript
// 播放到已选片段时，自动跳到片段末尾
wavesurfer.on('timeupdate', (t) => {
  for (const seg of sortedSelected) {
    if (t >= seg.start && t < seg.end) {
      wavesurfer.setTime(seg.end);  // 跳过
      return;
    }
  }
});
```

---

### 步骤10：字幕校验（借鉴videocut-skills subtitle_server.js）

**字幕审核网页功能**：
- 左侧视频播放，右侧字幕列表
- 播放时自动高亮当前字幕（timeupdate事件驱动）
- **双击字幕文字编辑**（时间戳不变，只改文字）
- 倍速播放（0.5x / 1x / 1.5x / 2x / 3x）
- **词典快捷插入**：底部显示词典词条，点击插入
- 导出 SRT / 烧录字幕

**字幕校验清单**：
- [ ] 逐条核对文字是否准确（参考下方误识别规则表）
- [ ] 逐条核对时间戳是否正确
- [ ] 检查开头是否有多余内容（321/你好等）
- [ ] 检查时间戳是否有重叠
- [ ] 验证字幕是否在画面内

**字幕时间轴50ms扩展（借鉴videocut-skills cut_video.sh）**：
- Whisper词级时间戳偏紧，头尾字刚好卡在发音点
- 如果字幕校验时发现头尾有气口感，在SRT里做微调：
  - start往前调50ms（吃掉气口）
  - end往后调50ms（确保尾音完整）

---

## 误识别规则表（Whisper常见错误，借鉴videocut-skills）

Whisper对以下词汇有固定误识别模式，字幕校验时必须逐条对照。

### 同音字错误

| 误识别 | 正确 | 行业背景 |
|--------|------|----------|
| TB-1 / TB1 / T1 | TPE | 热塑性弹性体 |
| 耐后性 | 耐候性 | 材料性能描述 |
| 汽车内舍 | 汽车内饰 | 车内装饰件 |
| 密封圈 | 密封件 | 工业配件 |
| 样板 | 样品 | 制造业用语 |
| 报介 | 报价 | 商业用语 |
| 软硬底 | 软硬度 | 材料特性 |
| 型材 | 型材 | 建材/工业 |

### 语气/口吻相似错误

| 误识别 | 正确 | 说明 |
|--------|------|------|
| 嗯 | （语气词，可保留1-2个） | 开头过渡 |
| 就是 | 就是说 | 口癖 |
| 这个 | （语气词） | 开头常见 |
| 那个 | （语气词） | 卡顿时出现 |

### 常见漏字问题（最难发现！）

| 原文漏字 | 完整应为 | 说明 |
|---------|----------|------|
| 说做玩具 | 说做玩具 | 漏"说" |
| 或者汽车内饰 | 或者说做汽车内饰 | 漏"说" |
| TPE材料名称一样 | TPE材料名称是这样的 | 漏"的" |
| 你不知道软硬度 | 如果你不知道软硬度 | 漏"如果" |
| 出了问题是 | 出了问题时候是 | 漏"时候" |
| 亏的是你自己 | 亏的是你自己呀 | 漏语气词 |
| 我就给你报 | 我就给你报价 | 漏"价" |
| 材料拿回去 | 把材料拿回去 | 漏"把" |

**漏字检查方法**：看字幕语义是否完整，如果读起来觉得"缺了点什么"，很可能漏了字。**特别检查"如果"、"把"、"的"、"呀"等虚词。**

---

### 步骤11：视频合成

**字幕滤镜参数（竖屏1080x1920，已验证）**：

```bash
ffmpeg -i input.mp4 \
  -vf "subtitles=subtitle.srt:force_style='FontName=Noto Sans CJK SC,FontSize=18,PrimaryColour=&H00FFFFFF,Alignment=2,Outline=1'" \
  -c:a copy \
  output.mp4
```

**字幕样式对比**：

| 参数 | 白色版本（我们） | 金黄版本（videocut-skills） |
|------|----------------|---------------------------|
| PrimaryColour | &H00FFFFFF（白） | &H0000deff（金黄） |
| FontSize | 18px | 22px |
| Bold | 不用 | 1（粗体） |
| Outline | 1 | 2 |

**可选金黄粗体样式**（videocut-skills风格）：
```bash
ffmpeg -i input.mp4 \
  -vf "subtitles=subtitle.srt:force_style='FontName=PingFang SC,FontSize=22,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'" \
  -c:a copy output.mp4
```

**⚠️ 不要乱调MarginV**：竖屏视频调MarginV容易把字幕移出画面。`Alignment=2`已验证可用。

**FFmpeg精确剪辑（借鉴videocut-skills cut_video.sh buffer+crossfade）**：

当有删除片段列表时，使用以下参数进行剪辑：

```bash
# 删除片段：[{start: 1.5, end: 2.3}, {start: 5.0, end: 5.8}]
# BUFFER扩展：每段前后各扩展50ms（吃掉气口和残音）
BUFFER_MS=50
# 交叉淡入淡出：30ms（消除接缝咔声）
CROSSFADE_MS=30
```

```python
# Python 计算逻辑
import json

BUFFER = 0.050  # 50ms
deletions = json.loads(open("delete_list.json").read())

segments = []
for seg in deletions:
    # 扩展范围
    expanded = {
        "start": max(0, seg["start"] - BUFFER),
        "end": min(duration, seg["end"] + BUFFER)
    }
    segments.append(expanded)

# 合并重叠片段
merged = []
for seg in sorted(segments, key=lambda x: x["start"]):
    if merged and abs(seg["start"] - merged[-1]["end"]) < 0.05:
        merged[-1]["end"] = max(merged[-1]["end"], seg["end"])
    else:
        merged.append({**seg})
```

**接缝处理（acrossfade 30ms）**：
```bash
# 拼接相邻保留片段时使用30ms淡入淡出
# filter_complex: [a0][a1]acrossfade=d=0.030:c1=tri:c2=tri[out]
```

**文件大小控制**（飞书发送限制20MB）：
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k output.mp4
```

**硬件编码器检测（借鉴videocut-skills review_server.js）**：
```javascript
// 自动检测可用编码器
function detectEncoder() {
  const encoders = [];
  if (platform === 'darwin') encoders.push({ name: 'h264_videotoolbox', label: 'VideoToolbox' });
  if (platform === 'win32') {
    encoders.push({ name: 'h264_nvenc', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_qsv', label: 'QSV (Intel)' });
  }
  if (platform === 'linux') encoders.push({ name: 'h264_vaapi', label: 'VAAPI' });
  encoders.push({ name: 'libx264', label: 'x264 (软件)' });  // 兜底
}
```

---

### 步骤12：封面制作

**方案A：从视频截帧**
```bash
ffmpeg -ss 2 -i input.mp4 -frames:v 1 cover.jpg
```

**方案B：AI生成**

**封面文字建议**：
- 主标题：制造悬念/冲突（如"你先别问价格"）
- 副标题：补充场景

**文字位置**：正中间，透明黑背景（半透明黑色圆角矩形）

---

## 检测规则详解

### 核心原则

- **删前保后**：后说的通常更完整
- **整句删除**：残句、重复句都要删整句
- **语气词边界**：从前字end到后字start，不是只删语气词
- **先分句，再比对**：比对重复句之前必须先完成分句（借鉴videocut-skills）

### 重复句检测

- 相邻句子开头≥5字相同 → 删较短的整句
- 隔一句重复（中间是残句<5字）→ 删前句+残句
- 连续3次以上重复 → 删所有不完整的，保留最后完整句

### 残句检测

- 话说一半突然停住 → 整句删除
- 不是只删结尾，是整个残句都删
- 残句后通常接静音或重说

### 重说纠正

- 部分重复：删前面的部分
- 否定纠正（"它是/不是"）→ 删"它是"
- 词被打断：删打断的部分

### 语气词检测

- 语气词列表：嗯、啊、哎、诶、呃、额、唉、哦、噢、呀、欸、这个、那个、就是、就是说
- 删除边界：从前字end到后字start
- 保留适量"嗯"作为过渡

### 其他规则

- **卡顿词**：那个那个、就是就是 → 标记但不自动删
- **句内重复**：A+中间+A模式 → 删前一个A
- **连续语气词**：连续2个以上 → 保留1个

---

## 词典文件（借鉴videocut-skills热词机制）

使用前先加载 `词典.txt` 中的专有名词作为Whisper的热词提示，提高识别准确率。

**当前收录**：
```
TPE、耐候性、汽车内饰、汽车密封件、软硬度、配方、样板、报价、询盘、
客户一上来、先别问价格、不敢报价、架子大、材料分析、热塑性弹性体
```

**热词使用方式**：Whisper的`initial_prompt`参数，把词典内容全部作为提示注入。

---

## 自进化机制（借鉴videocut-skills）

当用户纠正错误或给出新反馈时：

1. **回溯上下文**，找到问题点
2. **读目标文件全文**，理解现有结构
3. **整合到正文相应位置**（不是只往末尾加！）
4. **反馈记录只记事件**，不重复规则

**❌ 错误做法**：
```markdown
## 反馈记录
### 2026-04-06
- 教训：字幕时间轴偏紧需要扩展buffer
```
只加到末尾 = 下次还会犯

**✅ 正确做法**：
```markdown
## 步骤10：字幕校验
（把buffer扩展规则整合到正文）

## 反馈记录
### 2026-04-07
- **竖屏裁剪必须保留音频**：不能用 `-an`，否则拼接后无音轨无法转写
- 结尾必须多留0.5s buffer：防止最后一个字被截断
```

---

## 已验证的视频参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 分辨率 | 1080x1920 | 竖屏9:16 |
| 字幕字体 | Noto Sans CJK SC | 中文无衬线 |
| 字幕大小 | 18px（白）/22px（金黄） | 竖屏清晰可读 |
| 字幕颜色 | 白色或金黄 | &H00FFFFFF / &H0000deff |
| 描边 | 1px（白）/2px（金黄） | Outline |
| 对齐 | Alignment=2 | 底部居中 |
| 帧率 | 30fps | 标准值 |
| 视频码率 | 3-4Mbps | CRF28压缩后 |
| 音频码率 | 128kbps | AAC |
| BUFFER | 50ms | 删除范围前后扩展 |
| CROSSFADE | 30ms | 音频接缝淡入淡出 |

---

## 踩坑记录

### 坑1：先拼装再清理音频
**问题**：先把多段音频拼起来，再处理字幕。时间戳全部错乱。
**教训**：必须先逐条清理，再拼装。每条确认干净了再进入下一步。

### 坑2：标点符号不进词级时间戳
**问题**：Whisper返回的词级时间戳不包含标点。用标点位置映射会导致偏移1-2字。
**教训**：直接用转写出来的纯文字匹配，不要事后再用标点映射。

### 坑3：按标点分导致大量碎片
**问题**：纯按逗号、句号分，导致大量2-4字碎片。
**教训**：用0.2秒静音阈值 + 自然分句，不要纯标点分。

### 坑4：多段素材offset算错
**问题**：某段字幕整体偏移1-2秒。
**教训**：多段素材每段单独计算offset，精确到小数点后3位，调整后截帧验证。

### 坑5：竖屏MarginV乱调
**问题**：调MarginV把字幕移出画面。
**教训**：竖屏不要调MarginV，用Alignment=2底部居中已验证可用。

### 坑6：trim函数语义理解错误
**问题**：`trim_wav([(2.5, 7.5)])`是保留2.5-7.5秒，不是删除。
**教训**：先确认函数语义，用最终时长反推验证。

### 坑7：字幕时间轴偏紧没扩展buffer
**问题**：Whisper词级时间戳偏紧，头尾字刚好卡在发音点，没留气口。烧录后看起来"缺了一截"。
**教训**：字幕校验时检查每条字幕的头尾是否有气口感。如果有，在SRT里把该字幕的start往前调50ms，end往后调50ms。

### 坑8：分句前先比对重复句
**问题**：还没完成分句就开始比对重复句，导致检测逻辑错乱。
**教训**：必须**先分句，再比对**。这是videocut-skills的核心原则。

---

## 文件命名规范

```
{项目名}_raw_L{序号}.mp4      # 原始素材
{项目名}_audio_L{序号}.wav     # 提取的音频
{项目名}_trim_L{序号}.wav      # 清理后的音频
{项目名}_combined.wav          # 拼接后的完整音频
{项目名}_words.json           # 词级时间戳
{项目名}.srt                  # 字幕文件
{项目名}_final.mp4           # 最终成片
{项目名}_cover.png           # 封面图
```

---

## 工具清单

| 工具 | 安装 | 用途 |
|------|------|------|
| ffmpeg | `sudo apt install ffmpeg` | 音视频提取、合成、压缩 |
| faster-whisper | `pip install faster-whisper` | 语音转文字+时间戳 |
| pydub | `pip install pydub` | 音频拼接、裁剪 |
| PIL/Pillow | `pip install pillow` | 图片处理、封面制作 |
| Node.js | `brew install node` | 运行审核网页脚本 |

---

## 适用场景

- 工厂老板IP口播视频
- 产品介绍视频
- 知识分享类短视频
- 抖音/快手/视频号竖屏内容

不适用的场景：
- 需要复杂剪辑（转场、特效）
- 横屏视频（参数需要调整）
- 多人对话视频（需要分离说话人）

---

## 与 videocut-skills 的主要区别

| 维度 | 我们 | videocut-skills |
|------|------|----------------|
| ASR引擎 | faster-whisper（本地） | 火山引擎（云端，热词API） |
| 审核系统 | 简化版HTML（双击选中） | 完整wavesurfer.js波形+Shift+拖动 |
| 字幕审核 | 简化版 | 完整subtitle_server.js（双击编辑+SSE） |
| 安装要求 | pip+ffmpeg | Node.js+ffmpeg+API Key |
| 架构 | 单skill+规则文件 | 4个独立skill |
| 输出结构 | 按项目分目录 | 按日期+编号分目录 |

**videocut-skills的精华已全部吸收**：口播审核网页、字幕审核网页（简化版）、50ms buffer、30ms acrossfade、7条优先级规则、输出目录结构、自进化机制。

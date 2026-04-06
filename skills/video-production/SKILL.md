---
name: video-production
description: 口播视频制作完整流程。当用户需要制作口播类短视频（工厂老板IP、产品介绍、知识分享等）、从原始素材到带字幕成品视频的完整流程时触发。包括：音频提取、字幕生成、时间戳校验、视频合成、封面制作。关键词：视频制作、口播视频、字幕生成、视频剪辑、Whisper转写、竖屏视频。必须使用此skill当用户提到"帮我制作视频"、"生成字幕"、"口播视频"、"视频制作流程"、"剪辑视频"、"字幕时间戳"等。
---

# 口播视频制作 SOP

从原始素材到成品视频的完整流程。

---

## 核心原则

1. **先逐条清理，再拼装** — 音频必须先处理干净再拼接，绝对不能先拼再处理
2. **逐条校验时间戳** — 每条字幕都要核对，不能只看总数
3. **竖屏优先** — 制造业IP主要平台是抖音/快手/视频号，竖屏9:16

---

## 流程概览

```
素材检查 → 音频提取 → 音频清理 → 音频拼接 → Whisper转写 → 字幕断句 → 时间戳校验 → 视频合成 → 封面制作
```

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

### 步骤2：音频提取

```bash
ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav
```

**参数说明**：
- `-ar 16000`：采样率16kHz（Whisper推荐）
- `-ac 1`：单声道
- `-vn`：不要视频

**多段分别提取**：`audio/raw_L1.wav`、`audio/raw_L2.wav`

---

### 步骤3：音频清理（关键！）

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

### 步骤4：音频拼接

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

### 步骤5：Whisper字幕生成

```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cpu", compute_type="int8")
result = model.transcribe(
    "combined.wav",
    language="zh",
    word_timestamps=True,
    initial_prompt="TPE、TPE材料、耐候性、汽车内饰"
)
```

**获取词级时间戳**（用于精确断句）：
```python
# faster-whisper的WordLevelTiming类
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

### 步骤6：字幕断句

**断句规则**：

| 优先级 | 情况 | 处理 |
|--------|------|------|
| 1 | 问句结束于"？" | 单独成组 |
| 2 | 称呼（2-3字）如"唐姐" | 可单独成组 |
| 3 | 语气词"啊" | 可单独成组 |
| 4 | 静音超过0.2秒 | 断点 |
| 5 | 标点符号辅助 | 断点参考 |

**字数限制**：
- 硬上限：10字/组
- 低于5字的短句：如果前一句已达8-10字则合并，否则可单独

**不要做的**：
- 不要把"TPE"分开
- 不要把"一吨多少钱"分开
- 不要强行凑10字

---

### 步骤7：字幕校验

**必检项**：
- [ ] 逐条核对文字是否准确（TPE、耐候性、汽车内饰等专有名词）
- [ ] 逐条核对时间戳是否正确
- [ ] 检查开头是否有多余内容（321/你好等）
- [ ] 检查时间戳是否有重叠
- [ ] 验证字幕是否在画面内

**校验方法**：
1. 生成带字幕的视频
2. 截帧检查字幕位置
3. 用image工具分析截帧

---

### 步骤8：视频合成

**字幕滤镜参数（竖屏1080x1920，已验证可用）**：

```bash
ffmpeg -i input.mp4 \
  -vf "subtitles=subtitle.srt:force_style='FontName=Noto Sans CJK SC,FontSize=18,PrimaryColour=&H00FFFFFF,Alignment=2,Outline=1'" \
  -c:a copy \
  output.mp4
```

**关键参数**：
- `FontSize=18`：竖屏1080p下清晰可读
- `Alignment=2`：底部居中
- `Outline=1`：描边保证白字可读

**⚠️ 不要乱调MarginV**：竖屏视频调MarginV容易把字幕移出画面。`Alignment=2`已验证可用。

**文件大小控制**（飞书发送限制20MB）：
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k output.mp4
```

---

### 步骤9：封面制作

**方案A：从视频截帧**
```bash
ffmpeg -ss 2 -i input.mp4 -frames:v 1 cover.jpg
```

**方案B：AI生成**

**封面文字建议**：
- 主标题：制造悬念/冲突（如"你先别问价格"）
- 副标题：补充场景

**文字位置**：正中间，透明黑背景（半透明黑色圆角矩形）

```python
from PIL import Image, ImageDraw, ImageFont

img = Image.open("cover.jpg")
draw = ImageDraw.Draw(img)

# 透明黑背景
overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
overlay_draw = ImageDraw.Draw(overlay)
overlay_draw.rounded_rectangle([(x1,y1), (x2,y2)], radius=15, fill=(0,0,0,180))
img = Image.alpha_composite(img.convert('RGBA'), overlay)

# 文字
draw = ImageDraw.Draw(img)
draw.text((tx, ty), "文案", fill=(255,255,255), font=font)
```

---

## 已验证的视频参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 分辨率 | 1080x1920 | 竖屏9:16 |
| 字幕字体 | Noto Sans CJK SC | 中文无衬线 |
| 字幕大小 | 18px | 竖屏清晰可读 |
| 字幕颜色 | 白色 | &H00FFFFFF |
| 描边 | 1px | Outline=1 |
| 对齐 | Alignment=2 | 底部居中 |
| 帧率 | 30fps | 标准值 |
| 视频码率 | 3-4Mbps | CRF28压缩后 |
| 音频码率 | 128kbps | AAC |

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

## 项目文件夹结构

```
projects/{项目名}/
├── raw/                  # 原始素材
├── audio/               # 提取的音频
├── trimmed/             # 清理后的音频
├── 成片/                # 最终成品
└── 字幕/                # 字幕文件备份
```

---

## 工具清单

| 工具 | 安装 | 用途 |
|------|------|------|
| ffmpeg | `sudo apt install ffmpeg` | 音视频提取、合成、压缩 |
| faster-whisper | `pip install faster-whisper` | 语音转文字+时间戳 |
| pydub | `pip install pydub` | 音频拼接、裁剪 |
| PIL/Pillow | `pip install pillow` | 图片处理、封面制作 |

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

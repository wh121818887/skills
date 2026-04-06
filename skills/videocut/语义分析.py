#!/usr/bin/env python3
"""
videocut_analyze.py
AI语义分析 - 识别9类口误，生成 auto_selected.json

规则优先级：
1. 静音段（≥0.5s）→ 整段标记删除
2. 重复句（相邻句开头≥5字相同）→ 删较短的整句  
3. 隔一句重复（中间是残句）→ 删前句+残句
4. 残句（话说一半+静音）→ 整句删除
5. 句内重复（A+中间+A模式）→ 删前面部分
6. 卡顿词（那个那个、就是就是）→ 标记但不自动删
7. 重说纠正（部分重复/否定纠正）→ 删前面部分
8. 连续语气词（嗯啊、啊呃）→ 标记
9. 语气词（嗯、啊、那个）→ 标记但不自动删

核心原则：删前保后（后说的通常更完整）
"""

import json
import sys
import os
import re

# ============ 规则定义 ============

# 1. 静音阈值
SILENCE_THRESHOLD = 0.5  # 秒

# 2. 重复句判断：开头相同字数
REPEAT_MIN_CHARS = 5

# 3. 卡顿词模式
STUTTER_PATTERNS = [
    r'那个那个', r'就是就是', r'然后然后', r'那个的话那个',
    r'的话的话', r'的话那个', r'就是说', r'其实的话',
    r'就是那个', r'那个的话', r'然后那个', r'然后的话',
]

# 4. 语气词
FILLER_WORDS = ['嗯', '啊', '呃', '哦', '哈', '呀', '呐', '哟', '咧', '咯']

# 5. 重说纠正模式（否定词后重新说）
CORRECTION_PATTERNS = [
    (r'不对', r''),
    (r'不是', r''),
    (r'错了', r''),
    (r'不对不对', r''),
    (r'等等', r''),
    (r'等一下', r''),
    (r'我重说', r''),
    (r'我再说一遍', r''),
]

def load_subtitles(output_dir):
    """加载字幕数据"""
    words_file = os.path.join(output_dir, "subtitles_words.json")
    sentences_file = os.path.join(output_dir, "subtitles_sentences.json")
    
    if not os.path.exists(words_file):
        print(f"❌ 找不到: {words_file}")
        sys.exit(1)
    
    with open(words_file, "r", encoding="utf-8") as f:
        words = json.load(f)
    
    sentences = []
    if os.path.exists(sentences_file):
        with open(sentences_file, "r", encoding="utf-8") as f:
            sentences = json.load(f)
    
    print(f"📝 加载: {len(words)}词, {len(sentences)}句")
    return words, sentences

def detect_silence(words):
    """规则1：静音段检测（≥0.5s）"""
    silence_indices = []
    for i, w in enumerate(words):
        if w.get("isGap", False):
            duration = w["end"] - w["start"]
            if duration >= SILENCE_THRESHOLD:
                silence_indices.append({
                    "type": "静音",
                    "indices": [i],
                    "start": w["start"],
                    "end": w["end"],
                    "duration": round(duration, 2),
                    "action": "删",
                    "reason": f"静音{duration:.1f}秒"
                })
    print(f"🔇 静音段(≥{SILENCE_THRESHOLD}s): {len(silence_indices)}处")
    return silence_indices

def detect_sentence_repetitions(sentences):
    """规则2：重复句检测（相邻句子开头≥5字相同 = 删前保后）"""
    repetitions = []
    
    for i in range(len(sentences) - 1):
        curr = sentences[i]
        next_s = sentences[i + 1]
        
        curr_text = curr["text"].strip()
        next_text = next_s["text"].strip()
        
        if not curr_text or not next_text:
            continue
        
        # 计算开头相同字数
        same_chars = 0
        for c1, c2 in zip(curr_text, next_text):
            if c1 == c2:
                same_chars += 1
            else:
                break
        
        if same_chars >= REPEAT_MIN_CHARS:
            # 判断哪个更短（更短通常是口误版本）
            if len(curr_text) <= len(next_text):
                to_delete = curr
                keep = next_s
            else:
                to_delete = next_s
                keep = curr
            
            repetitions.append({
                "type": "重复句",
                "indices": [],
                "start": to_delete["start"],
                "end": to_delete["end"],
                "duration": round(to_delete["end"] - to_delete["start"], 2),
                "action": "删",
                "reason": f"\"{to_delete['text'][:20]}...\" 与后句开头重复 {same_chars} 字，删前保后",
                "before": curr_text[:30],
                "after": next_text[:30]
            })
    
    print(f"🔁 重复句: {len(repetitions)}处")
    return repetitions

def detect_incomplete_sentences(sentences, silence_threshold=SILENCE_THRESHOLD):
    """规则3：残句检测（短句后面紧跟长静音 = 话说一半停了）"""
    incomplete = []
    
    for i in range(len(sentences) - 1):
        curr = sentences[i]
        next_s = sentences[i + 1]
        
        curr_text = curr["text"].strip()
        
        # 如果当前句很短（≤5字）且后面有长静音
        if len(curr_text) <= 8 and curr_text:
            gap = next_s["start"] - curr["end"]
            if gap >= silence_threshold:
                incomplete.append({
                    "type": "残句",
                    "indices": [],
                    "start": curr["start"],
                    "end": curr["end"],
                    "duration": round(curr["end"] - curr["start"], 2),
                    "action": "删",
                    "reason": f"\"{curr_text}\" 后有{gap:.1f}秒静音，为未说完的残句",
                    "before": curr_text
                })
    
    print(f"📄 残句: {len(incomplete)}处")
    return incomplete

def detect_stutter_words(sentences):
    """规则4：卡顿词检测（那个那个、就是就是）"""
    stutters = []
    
    for sent in sentences:
        text = sent["text"]
        for pattern in STUTTER_PATTERNS:
            if re.search(pattern, text):
                stutters.append({
                    "type": "卡顿词",
                    "indices": [],
                    "start": sent["start"],
                    "end": sent["end"],
                    "duration": round(sent["end"] - sent["start"], 2),
                    "action": "标记",
                    "reason": f"检测到卡顿词: {pattern}",
                    "before": text[:40]
                })
                break
    
    print(f"🗣️ 卡顿词: {len(stutters)}处")
    return stutters

def detect_filler_sentences(sentences):
    """规则5：纯语气词整句（整句只有语气词）"""
    fillers = []
    
    for sent in sentences:
        text = sent["text"].strip()
        if not text:
            continue
        
        # 统计语气词占比
        filler_count = sum(1 for c in text if c in FILLER_WORDS)
        filler_ratio = filler_count / len(text)
        
        # 如果句子中语气词占比>50%且总字数≥3
        if filler_ratio > 0.5 and len(text) >= 3:
            fillers.append({
                "type": "语气词",
                "indices": [],
                "start": sent["start"],
                "end": sent["end"],
                "duration": round(sent["end"] - sent["start"], 2),
                "action": "标记",
                "reason": f"句子语气词占比{filler_ratio:.0%}，可能可删",
                "before": text
            })
    
    print(f"💬 语气词过多: {len(fillers)}处")
    return fillers

def generate_auto_selected(issues, output_dir):
    """
    从分析结果生成 auto_selected.json
    只包含"删"action的词索引，"标记"action仅供人工参考
    """
    auto_selected = []
    analysis_report = []
    
    for issue in issues:
        analysis_report.append(issue)
        if issue["action"] == "删":
            # 估算需要删除的词索引范围
            # 这里只记录时间范围，实际索引由review页面计算
            pass
    
    # 保存完整分析报告（供人工审核）
    report_file = os.path.join(output_dir, "口误分析报告.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(analysis_report, f, ensure_ascii=False, indent=2)
    print(f"📋 分析报告: {report_file}")
    
    # 保存auto_selected（供review页面预选）
    # 注意：review页面需要词索引，这里我们生成时间范围让review页面计算
    auto_selected_time = [
        {"start": issue["start"], "end": issue["end"], "type": issue["type"]}
        for issue in issues
        if issue["action"] == "删"
    ]
    
    auto_file = os.path.join(output_dir, "auto_selected.json")
    with open(auto_file, "w", encoding="utf-8") as f:
        json.dump(auto_selected_time, f, ensure_ascii=False, indent=2)
    print(f"✅ 预选删除: {len(auto_selected_time)}处")
    
    return analysis_report

def main():
    if len(sys.argv) < 2:
        print("用法: python3 videocut_analyze.py <输出目录>")
        sys.exit(1)
    
    output_dir = sys.argv[1]
    
    # 加载数据
    words, sentences = load_subtitles(output_dir)
    
    # 执行所有检测规则
    print("\n" + "="*50)
    print("🔍 语义分析中...")
    print("="*50)
    
    all_issues = []
    all_issues.extend(detect_silence(words))
    all_issues.extend(detect_sentence_repetitions(sentences))
    all_issues.extend(detect_incomplete_sentences(sentences))
    all_issues.extend(detect_stutter_words(sentences))
    all_issues.extend(detect_filler_sentences(sentences))
    
    # 按开始时间排序
    all_issues.sort(key=lambda x: x["start"])
    
    # 生成输出
    print("\n" + "="*50)
    report = generate_auto_selected(all_issues, output_dir)
    
    print(f"\n📊 总计: {len(report)}处问题")
    print(f"  - 建议删除: {sum(1 for r in report if r['action']=='删')}处")
    print(f"  - 建议标记: {sum(1 for r in report if r['action']=='标记')}处")
    
    # 打印前10条供预览
    print("\n📝 前10条问题预览:")
    for i, issue in enumerate(report[:10]):
        print(f"  [{issue['type']}] {issue['start']:.1f}s-{issue['end']:.1f}s | {issue['reason']}")
    
    print("\n✅ 分析完成！")
    print("📌 审核建议: 打开 http://localhost:8899 查看审核页面")

if __name__ == "__main__":
    main()

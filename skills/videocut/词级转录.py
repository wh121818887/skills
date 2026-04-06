#!/usr/bin/env python3
"""
videocut_transcribe.py
用 faster-whisper 生成词级时间戳字幕（subtitles_words.json）

输入: video.mp4
输出: 
  - audio.mp3
  - subtitles_words.json  (词级)
  - subtitles_sentences.json (句级)
"""

import sys
import json
import subprocess
import os
from faster_whisper import WhisperModel

def extract_audio(video_path, audio_path="audio.mp3"):
    """从视频提取音频"""
    print(f"🎬 提取音频: {video_path}")
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1",
        audio_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ 音频提取失败: {result.stderr[-200:]}")
        sys.exit(1)
    print(f"✅ 音频已保存: {audio_path}")

def transcribe_wordlevel(audio_path):
    """用 faster-whisper large-v3 做词级转录"""
    print(f"🎙️ 开始转录 (词级时间戳)...")
    
    model = WhisperModel(
        "large-v3",
        device="cuda" if os.path.exists("/proc/driver/nvidia") else "cpu",
        compute_type="float16" if os.path.exists("/proc/driver/nvidia") else "int8"
    )
    
    segments, info = model.transcribe(
        audio_path,
        language="zh",
        word_timings=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500)
    )
    
    print(f"📊 语言: {info.language} | 语速: {info.language_probability:.0%}")
    
    words_data = []
    sentences_data = []
    current_sentence_words = []
    sentence_start = None
    
    for segment in segments:
        for word in segment.words:
            w = {
                "word": word.word,
                "start": round(word.start, 2),
                "end": round(word.end, 2),
                "probability": round(word.probability, 3),
                "isGap": False
            }
            words_data.append(w)
            
            # 句级收集
            if sentence_start is None:
                sentence_start = word.start
            current_sentence_words.append(word)
            
            # 静音处理（VAD过滤后的长间隔）
            if word.word.strip() == "":
                gap_duration = word.end - word.start
                if gap_duration >= 0.3:
                    # 标记为静音段
                    gap_entry = {
                        "word": "",
                        "start": round(word.start, 2),
                        "end": round(word.end, 2),
                        "probability": 0.0,
                        "isGap": True
                    }
                    words_data.append(gap_entry)
                    
                    # 保存当前句子
                    if current_sentence_words:
                        text = "".join(w.word for w in current_sentence_words if w.word.strip())
                        if text:
                            sentences_data.append({
                                "text": text,
                                "start": round(sentence_start, 2),
                                "end": round(current_sentence_words[-1].end, 2)
                            })
                        current_sentence_words = []
                        sentence_start = None
    
    # 保存最后一句
    if current_sentence_words:
        text = "".join(w.word for w in current_sentence_words if w.word.strip())
        if text:
            sentences_data.append({
                "text": text,
                "start": round(sentence_start, 2),
                "end": round(current_sentence_words[-1].end, 2)
            })
    
    print(f"📝 词数: {len(words_data)} | 句数: {len(sentences_data)}")
    return words_data, sentences_data

def save_outputs(words_data, sentences_data, output_dir="."):
    """保存输出文件"""
    # 词级（for review page）
    words_file = os.path.join(output_dir, "subtitles_words.json")
    with open(words_file, "w", encoding="utf-8") as f:
        json.dump(words_data, f, ensure_ascii=False, indent=2)
    print(f"✅ 词级字幕: {words_file}")
    
    # 句级（for AI分析）
    sentences_file = os.path.join(output_dir, "subtitles_sentences.json")
    with open(sentences_file, "w", encoding="utf-8") as f:
        json.dump(sentences_data, f, ensure_ascii=False, indent=2)
    print(f"✅ 句级字幕: {sentences_file}")

def main():
    if len(sys.argv) < 2:
        print("用法: python3 videocut_transcribe.py <视频.mp4> [输出目录]")
        sys.exit(1)
    
    video_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    
    audio_path = os.path.join(output_dir, "audio.mp3")
    
    # Step 1: 提取音频
    extract_audio(video_path, audio_path)
    
    # Step 2: 词级转录
    words_data, sentences_data = transcribe_wordlevel(audio_path)
    
    # Step 3: 保存
    save_outputs(words_data, sentences_data, output_dir)
    
    print("\n✅ 转录完成！下一步: /videocut:分析")

if __name__ == "__main__":
    main()

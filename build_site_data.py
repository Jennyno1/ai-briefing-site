#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 content-research 日报 Markdown 生成站点 JSON 与 manifest。

输出结构（与 data/*.json 现有 schema 一致，本版新增两处字段）：
  { date, version, points, tracks[{key,emoji,name,news,insights,actions}],
    github[{repo,url,stars,track,note,why}],          ← 新增 track/why
    consensus{text,quotes}, division{text,quotes},
    reading[{title,url,source,reason}],               ← 新增 reason（推荐理由原文）
    format }

用法：
  python3 build_site_data.py [--md-dir DIR] [--out DIR] [--since 2026-08-01] [--manifest-only]
  python3 build_site_data.py --manifest-only --out DIR     # 仅据 <out>/*.json 重建 manifest

历史与边界（重要）：
  * 2026-08-01 之前的日报是「**加粗**当标题」的早期格式，解析器认不出 → `--since 2026-08-01` 起
    才纳入产出；更早的日期一律跳过（用户 09-20 决定：舍弃 7 月及更早的历史数据）。
  * sources.count / items_count 等采集管线字段无法从 md 还原，不写入。
  * version 从正文正则提取，提取不到则为空字符串。
"""

import argparse
import datetime
import json
import re
import sys
from pathlib import Path

TRACK_KEYS = {
    "AI产业技术": "ai_tech",
    "企业AI应用": "enterprise_ai",
    "内容创作": "content_creation",
}
# 赛道标题的历史写法（8 月简报用过「企业职场AI应用」「AI内容创作」等变体）
TRACK_NAME_ALIASES = {
    "AI产业技术": "AI产业技术", "产业技术": "AI产业技术", "AI产业": "AI产业技术",
    "企业AI应用": "企业AI应用", "企业职场AI应用": "企业AI应用", "职场AI应用": "企业AI应用", "企业AI": "企业AI应用",
    "内容创作": "内容创作", "AI内容创作": "内容创作",
}
TRACK_EMOJI = {"ai_tech": "❶", "enterprise_ai": "❷", "content_creation": "❸"}
TRACK_ORDER = ("AI产业技术", "企业AI应用", "内容创作")

# GitHub 段里的赛道标签有简写形态（「企业AI」「产业技术」「AI内容创作」…）
TRACK_ALIASES = {
    "ai产业技术": "AI产业技术", "产业技术": "AI产业技术", "ai产业": "AI产业技术",
    "企业ai应用": "企业AI应用", "企业ai": "企业AI应用",
    "内容创作": "内容创作", "ai内容创作": "内容创作", "内容": "内容创作",
}

LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
VERSION_RE = re.compile(r"v\d+\.\d+\.\d+")
ITEM_MARK = re.compile(r"^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]")
BULLET_RE = re.compile(r"^[▸•·●◆▶\-\u25cf]")
SUB_SECTIONS = {"最新动态": "news", "洞察发现": "insights", "落地行动": "actions", "行动": "actions"}

# ── 发布净化（2026-09-20 落地「actions 不上站」）─────────────────────────────
# 站点 data/*.json 是**对外公开、可直接下载**的文件——前端隐藏不算脱敏，必须在生成层剥离。
# 白名单之外的一切字段一律不落地（version 内部版本号、tracks[].actions 落地行动等）。
PUBLISH_TOP_KEYS = ("date", "format", "points", "tracks", "github", "reading", "consensus", "division")
PUBLISH_TRACK_KEYS = ("key", "emoji", "name", "news", "insights", "actions")
AI_MARK = {"ai_generated": True, "generator": "AI 简报生成流水线（自动采集 + 模型整理）"}

# 结论段重写映射：数据文件（单一来源，可审计/回滚），见 ~/.hermes/scripts/site_consensus_rewrite.json
CONSENSUS_REWRITE_PATH = Path.home() / ".hermes" / "scripts" / "site_consensus_rewrite.json"


def load_consensus_rewrite(path=None):
    p = Path(path) if path else CONSENSUS_REWRITE_PATH
    if not p.exists():
        return {}
    try:
        return (json.loads(p.read_text(encoding="utf-8")) or {}).get("rewrite", {})
    except Exception as e:  # noqa: BLE001
        print(f"[warn] 结论段重写映射读取失败（忽略）：{e}", file=sys.stderr)
        return {}


CONSENSUS_REWRITE = load_consensus_rewrite()

# 自由文本脱敏（**2026-09-20 按用户裁决停用**）。
# 用户原话：「所有的 hermes、小禾账号等落地行动等相关内容原样保留即可，这些本来就是公开的，
# 也不属于个人隐私信息」。→ 原始 md 与站点 JSON 一律照原样发布，不再替换任何品牌/账号名。
# 规则表保留为空列表，便于审计与日后恢复；确需重新启用时把规则填回这里即可。
SCRUB_RULES_PUBLIC = []


def _scrub(obj):
    if isinstance(obj, str):
        for pat, rep in SCRUB_RULES_PUBLIC:
            obj = pat.sub(rep, obj)
        return obj
    if isinstance(obj, list):
        return [_scrub(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _scrub(v) for k, v in obj.items()}
    return obj


def sanitize(data, generated_at=""):
    """按白名单落地字段，写入 AI 生成标识，并应用结论段重写映射。"""
    out = {k: data[k] for k in PUBLISH_TOP_KEYS if k in data}
    out["tracks"] = [{k: t[k] for k in PUBLISH_TRACK_KEYS if k in t} for t in data.get("tracks", [])]
    out.update(AI_MARK)
    out["generated_at"] = generated_at
    date = out.get("date") or data.get("date")
    rw = CONSENSUS_REWRITE.get(date) or {}
    for field in ("consensus", "division"):
        if field in rw and out.get(field):
            if isinstance(out[field], dict):
                out[field]["text"] = rw[field]
            else:
                out[field] = rw[field]
    return _scrub(out)


def clean_bullet(line: str) -> str:
    """去掉行首编号/项目符号前缀。"""
    line = line.strip()
    line = re.sub(r"^[▸•·●◆▶\-\u25cf]\s*", "", line)
    line = re.sub(r"^\d+[\.、\)]\s*", "", line)
    line = re.sub(r"^[①②③④⑤⑥⑦⑧⑨⑩]\s*", "", line)
    return line.strip()


def clean_marker(line: str, marker: str) -> str:
    """去掉「**🔵 共识解读**」「## 🔵 共识解读」这类标记，返回正文。"""
    s = re.sub(r"^#{1,6}\s*", "", line.strip())
    s = re.sub(r"^\*{1,2}|\*{1,2}$", "", s).strip()
    pos = s.find(marker)
    if pos >= 0:
        s = s[pos + len(marker):]
    s = re.sub(r"^[\s：:，,。—\-*「」]+", "", s)
    s = s.strip("* ").strip()
    return s


def find_track_name(line: str):
    """识别赛道标题（含历史变体）。长行不当作标题，避免正文误命中。"""
    if len(line) > 40:
        return None
    stripped = re.sub(r"^#{1,6}\s*", "", line).strip()
    stripped = stripped.strip("*＂\"").strip()
    # 去掉行首 emoji/符号
    stripped = re.sub(r"^[\W_]+", "", stripped, flags=re.UNICODE)
    for alias, name in TRACK_NAME_ALIASES.items():
        if alias in stripped:
            return name
    return None


def detect_track_alias(line: str):
    """从 GitHub/阅读条目的赛道尾标里识别赛道（宽松匹配）。"""
    m = re.split(r"[—\-–]\s*", line)
    tail = m[-1].strip().strip("*").strip() if len(m) > 1 else ""
    key = tail.lower().replace(" ", "")
    for alias, name in TRACK_ALIASES.items():
        if key == alias or key.endswith(alias):
            return name
    for alias, name in TRACK_ALIASES.items():
        if alias in line.lower():
            return name
    return None


def parse_md(text, date=""):
    data = {
        "date": date,
        "version": "",
        "points": [],
        "tracks": [],
        "github": [],
        "consensus": {"text": "", "quotes": []},
        "division": {"text": "", "quotes": []},
        "reading": [],
        "format": "summary",
    }
    m = VERSION_RE.search(text)
    if m:
        data["version"] = m.group(0)

    tracks = {}
    cur_track = None
    cur_sub = None
    mode = None            # points / track / github / viewpoint / reading
    pending = None         # 收集「续行」的目标：reading 项 / github 项

    def ensure_track(name):
        if name not in tracks:
            tracks[name] = {"key": TRACK_KEYS[name], "emoji": TRACK_EMOJI[TRACK_KEYS[name]],
                            "name": name, "news": [], "insights": [], "actions": []}
        return tracks[name]

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        # ── 区块切换（顺序重要：先识别大区块标题） ─────────────────────
        if re.search(r"推荐阅读", line) and (line.startswith("#") or "📖" in line):
            mode, cur_sub, cur_track, pending = "reading", "reading", None, None
            continue
        if re.search(r"Github\s*推荐", line, re.IGNORECASE) and (line.startswith("#") or "⭐" in line):
            mode, cur_sub, cur_track, pending = "github", "github", None, None
            continue
        if (("最大共识" in line or "共识与分歧" in line or "共识/分歧" in line)
                and len(line.strip()) <= 30                     # 只认标题行；正文里同时出现「共识」「分歧」不切换
                and (line.startswith("#") or line.startswith("*") or "📊" in line)):
            mode, cur_track, cur_sub, pending = "viewpoint", None, None, None
            continue

        # ── 续行（推荐理由 / GitHub 描述与落地点）───────────────────────
        if pending is not None and line.startswith("📝"):
            pending["reason" if mode == "reading" else "note"] = clean_bullet(
                line.lstrip("📝").strip())[:600]
            continue
        if pending is not None and line.startswith("💡"):
            pending["why"] = clean_bullet(line.lstrip("💡").strip())[:600]
            continue

        # ── 共识 / 分歧 ────────────────────────────────────────────
        if mode == "viewpoint":
            if "共识解读" in line:
                cur_sub = "consensus"
                data["consensus"]["text"] = clean_marker(line, "共识解读")
                continue
            if "分歧解读" in line:
                cur_sub = "division"
                data["division"]["text"] = clean_marker(line, "分歧解读")
                continue
            if cur_sub in ("consensus", "division"):
                if "引用" in line:
                    q = clean_bullet(line).split("：", 1)[-1].strip().strip("*").strip()
                    if len(q) >= 4:                        # 跳过「**引用事件：**」这种空壳行
                        data[cur_sub]["quotes"].append(q)
                    continue
                if not data[cur_sub]["text"]:              # 09-05 型：正文在标题的下一行
                    txt = clean_bullet(line).replace("**", "").strip()
                    if txt:
                        data[cur_sub]["text"] = txt
                continue
            continue

        # ── 要点区（历史写法：`🎯 **今天要点**` / `## 🎯 要点`）──────────
        if "要点" in line and len(line) < 40 and not line.startswith("▸"):
            mode, cur_sub, cur_track, pending = "points", "points", None, None
            continue

        # ── 共识/分歧（8 月写法是各自独立的 `## 🔵 共识解读`）────────────
        if "共识解读" in line and mode != "reading":
            mode, cur_sub, cur_track, pending = "viewpoint", "consensus", None, None
            data["consensus"]["text"] = clean_marker(line, "共识解读")
            continue
        if "分歧解读" in line and mode != "reading":
            mode, cur_sub, cur_track, pending = "viewpoint", "division", None, None
            data["division"]["text"] = clean_marker(line, "分歧解读")
            continue

        # ── 赛道标题（无子区标题的历史格式：条目默认归入「最新动态」）──────
        name = find_track_name(line) if mode not in ("reading", "github") else None
        if name is not None and "要点" not in line:
            mode, cur_track, cur_sub, pending = "track", name, "news", None
            ensure_track(name)
            continue

        # ── 赛道子区 ──────────────────────────────────────────────
        sub = next((SUB_SECTIONS[k] for k in SUB_SECTIONS if k in line), None)
        if sub and cur_track:
            cur_sub = sub
            pending = None
            continue

        # ── 逐条收集 ──────────────────────────────────────────────
        content = clean_bullet(line)
        if not content:
            continue

        if mode == "points" and cur_sub == "points":
            data["points"].append(content)

        elif mode == "track" and cur_track and cur_sub in ("news", "insights", "actions"):
            tracks[cur_track][cur_sub].append(content)

        elif mode == "reading":
            lm = LINK_RE.search(content)
            if lm and (ITEM_MARK.match(line) or lm.start() == 0):
                title, url = lm.group(1), lm.group(2)
                source = re.split(r"[—\-]\s*", content[lm.end():].strip())[0].strip() if content[lm.end():].strip() else ""
                item = {"title": title, "url": url, "source": source, "reason": ""}
                data["reading"].append(item)
                pending = item
            elif pending is not None and not line.startswith("#"):
                # 没有 📝 前缀的续行也当作推荐理由
                if not pending["reason"]:
                    pending["reason"] = content[:600]

        elif mode == "github":
            lm = LINK_RE.search(content)
            if lm and (BULLET_RE.match(line) or lm.start() == 0):
                repo, url = lm.group(1), lm.group(2)
                stars_m = re.search(r"⭐\s*([\d.]+[KM]?)", content)
                item = {
                    "repo": repo, "url": url,
                    "stars": stars_m.group(1) if stars_m else "",
                    "track": detect_track_alias(content) or "",
                    "note": "", "why": "",
                }
                data["github"].append(item)
                pending = item
            elif pending is not None and not line.startswith("#"):
                if not pending["note"]:
                    pending["note"] = content[:600]

    ordered = [tracks[n] for n in TRACK_ORDER
               if n in tracks and (tracks[n]["news"] or tracks[n]["insights"] or tracks[n]["actions"])]
    data["tracks"] = ordered
    return data


def date_from_filename(path):
    """只认标准日报文件名 content-research-YYYY-MM-DD.md。

    为什么严格：目录里还有 `content-research-2026-08-28-weixin.md` 这类衍生稿，
    宽松提取日期会让它**覆盖**同一天的标准日报产出（解析为空 → 抹掉当天数据）。
    """
    m = re.fullmatch(r"content-research-(\d{4}-\d{2}-\d{2})\.md", path.name)
    return m.group(1) if m else ""


def write_manifest(out_dir, since=None):
    """清单只收录【有内容】的日期；since 为下限（含）。"""
    out_dir = Path(out_dir)
    dates, skipped = [], []
    for p in sorted(out_dir.glob("*.json")):
        if p.name == "manifest.json":
            continue
        if since and p.stem < since:
            skipped.append(p.stem)
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            skipped.append(p.stem)
            continue
        has_content = bool(data.get("points")) or any(
            (t.get("news") or t.get("insights") or t.get("actions")) for t in data.get("tracks", [])
        )
        (dates.append(p.stem) if has_content else skipped.append(p.stem))
    dates.sort()
    (out_dir / "manifest.json").write_text(json.dumps(dates, ensure_ascii=False, indent=2), encoding="utf-8")
    tail = f"，跳过 {len(skipped)} 个无内容/早于下限的日期：{skipped}" if skipped else ""
    print(f"manifest.json → {len(dates)} 个有内容的日期{tail}")
    # 完整性摘要：github / reading reason 覆盖情况
    gh_days = sum(1 for d in dates if json.loads((out_dir / f"{d}.json").read_text()).get("github"))
    reason_days = sum(1 for d in dates
                      if any(r.get("reason") for r in json.loads((out_dir / f"{d}.json").read_text()).get("reading", [])))
    print(f"字段覆盖：含 GitHub 模块 {gh_days}/{len(dates)} 天；推荐阅读带理由 {reason_days}/{len(dates)} 天")


def build_from_md(md_dir, out_dir, since=None):
    md_dir, out_dir = Path(md_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    count, skipped_early = 0, 0
    for md_path in sorted(md_dir.glob("content-research-*.md")):
        date = date_from_filename(md_path)
        if not date:
            continue
        if since and date < since:
            skipped_early += 1
            continue
        try:
            data = parse_md(md_path.read_text(encoding="utf-8"), date)
        except Exception as e:  # noqa: BLE001
            print(f"[skip] 解析失败 {md_path.name}: {e}", file=sys.stderr)
            continue
        if not data["points"] and not data["tracks"]:
            print(f"[warn] {md_path.name} 解析结果为空", file=sys.stderr)
        (out_dir / f"{date}.json").write_text(
            json.dumps(sanitize(data, generated_at=datetime.datetime.now().strftime("%Y-%m-%dT%H:%M%z")),
                       ensure_ascii=False, indent=2), encoding="utf-8")
        count += 1
    print(f"已生成 {count} 个日期 JSON → {out_dir}" + (f"（跳过 {skipped_early} 个早于 {since} 的日期）" if since else ""))
    write_manifest(out_dir, since=since)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--md-dir", default="../")
    ap.add_argument("--out", default="data")
    ap.add_argument("--since", default="2026-08-01", help="只处理该日期（含）之后的报告")
    ap.add_argument("--manifest-only", action="store_true")
    args = ap.parse_args()
    if args.manifest_only:
        write_manifest(args.out, since=args.since)
        return
    build_from_md(args.md_dir, args.out, since=args.since)


if __name__ == "__main__":
    main()

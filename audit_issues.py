#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 简报站点数据质量问题审计（离线版）"""
import json, re
from pathlib import Path
from collections import defaultdict

SITE = Path("/home/ubuntu/hermes-output/content-research/site/data")

def audit():
    files = sorted(SITE.glob("*.json"))
    results = {
        "issue_1_missing_modules": {},
        "issue_2_asterisks": [],
        "issue_3_dashes": {},
    }
    
    for f in files:
        try:
            d = json.loads(f.read_text())
            if not isinstance(d, dict):
                print(f"⚠️ {f.name} 不是 dict，跳过", file=__import__('sys').stderr)
                continue
        except Exception as e:
            print(f"⚠️ {f.name} 解析失败: {e}", file=__import__('sys').stderr)
            continue
            
        date = f.stem
        
        # ① 检查各模块是否为空
        empty = []
        if not isinstance(d.get("points"), list) or len(d["points"]) == 0:
            empty.append("points=空")
        if not isinstance(d.get("tracks"), list) or len(d["tracks"]) == 0:
            empty.append("tracks=空")
        if not isinstance(d.get("github"), list) or len(d["github"]) == 0:
            empty.append("github=空")
        cons = d.get("consensus", {})
        if not isinstance(cons, dict) or len(cons.get("text", "")) == 0:
            empty.append("consensus=空")
        div = d.get("division", {})
        if not isinstance(div, dict) or len(div.get("text", "")) == 0:
            empty.append("division=空")
        if not isinstance(d.get("reading"), list) or len(d["reading"]) == 0:
            empty.append("reading=空")
        
        if empty:
            results["issue_1_missing_modules"][date] = empty
    
    # ② * 号问题
    pat = re.compile(r'(?<!\*)\*(?!\*)(.+?)\*(?!\*)')
    for f in files:
        try:
            txt = f.read_text(encoding="utf-8", errors="ignore")
            hits = pat.findall(txt)
            if hits:
                results["issue_2_asterisks"].append((f.stem, hits[:3]))
        except:
            pass
    
    # ③ -- 占位符
    def find_dashes(obj, path="", depth=0):
        if depth > 10: return
        if isinstance(obj, str) and obj.strip() == "--":
            results["issue_3_dashes"].setdefault(f.stem, []).append((path, obj))
        elif isinstance(obj, list):
            for i, x in enumerate(obj):
                find_dashes(x, f"{path}[{i}]", depth+1)
        elif isinstance(obj, dict):
            for k, v in obj.items():
                find_dashes(v, f"{path}.{k}", depth+1)
    
    for f in files:
        try:
            d = json.loads(f.read_text())
            if isinstance(d, dict):
                find_dashes(d)
        except:
            pass
    
    results["issue_3_dashes"] = {k: v for k, v in results["issue_3_dashes"].items() if v}
    return results

if __name__ == "__main__":
    import sys
    r = audit()
    print(json.dumps(r, ensure_ascii=False, indent=2))

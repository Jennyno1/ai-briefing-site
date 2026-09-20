# AI 简报 · 每日 AI 动态静态站

按赛道分组的每日 AI 动态静态站：左侧日期导航 + 右侧每日简报（今日要点 / 赛道动态 / 最大共识与分歧 / 推荐阅读 / GitHub 项目推荐）。纯静态（HTML + CSS + 原生 JS），无后端、无追踪脚本、无 Cookie，托管于 GitHub Pages。

- 线上地址：https://jennyno1.github.io/ai-briefing-site/
- 数据直接可读：`data/manifest.json`（日期清单）与 `data/YYYY-MM-DD.json`（单日数据），前端只 fetch 一次 manifest，单日点击懒加载。

## 内容性质

- 全部条目、摘要与「共识/分歧」解读，由自动化流水线采集公开信源后、由 AI 模型整理生成，经人工整理与筛选后发布。页脚与页面 `<meta name="ai-generated">`、数据文件内的 `ai_generated` 字段均作显式标识（《人工智能生成合成内容标识办法》2025-09-01 施行）。
- 「落地行动」板块为主理人的工作笔记，供同好参考；站内内容不构成投资、法律或商业建议。
- 条目为对公开报道与公开项目页面的转述与摘要，不逐字大段复制原文；版权归原媒体/原作者/原项目方所有，链接指向原始来源。权利主张与下架见 [NOTICE](./NOTICE)。

## 数据结构（发布字段白名单）

单日 JSON 顶层字段：

| 字段 | 说明 |
|---|---|
| `date` | 日期 `YYYY-MM-DD` |
| `format` | 数据格式版本标识 |
| `points` | 今日要点（字符串数组） |
| `tracks[]` | 赛道数组：`key / emoji / name / news[] / insights[] / actions[]` |
| `github[]` | 项目推荐：`repo / url / stars / track / note / why` |
| `reading[]` | 推荐阅读：`title / url / source / reason` |
| `consensus` / `division` | 最大共识 / 主要分歧：`{ text }`（结论段不出现品牌名与事件级数字，只写判断与模式） |
| `ai_generated` / `generator` / `generated_at` | AI 生成标识（隐式层） |

白名单之外的内部字段不落盘——站点数据是**公开可下载**的文件，前端隐藏不算脱敏。

## 未收录日期

收录区间自 **2026-08-01** 起。区间内未收录 7 天：

- 2026-08-03、08-04、08-05、08-09、08-22、08-23：含个人化表述，不予公开；
- 2026-08-14：当日无简报产出（无源文件）。

该清单与页面披露文案统一维护在发布配置文件中（单一来源），避免多处副本漂移。

## 生成与发布

1. 日报 Markdown → 生成单日 JSON（字段白名单 + AI 标识 + 结论段口径）。
2. 发布构建：白名单拷贝资产 → 日期筛选 → 重建 manifest → 硬门禁扫描（账号标识 / 内部版本号 / 凭据样式 / 基础设施路径）+ 发布集自检（`ai_generated` 齐备、manifest 与实际文件一致、页脚标识存在）。**任一不过即拒绝发布。**
3. 发布到本仓库，GitHub Pages 直接生效。

## 许可

代码与样式：MIT（见 [LICENSE](./LICENSE)）。聚合内容与第三方素材不适用该许可（见 [NOTICE](./NOTICE)）。

## 规划

见 [FEATURES.md](./FEATURES.md)。

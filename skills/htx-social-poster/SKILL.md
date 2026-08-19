---
name: htx-social-poster
description: 快速生成 HTX 品牌社媒海报，仅支持蓝色栅格和柔和蓝白渐变两种背景。用于活动、奖励、返佣、招募、社群、产品信息与公告；适配 1080×1080 或信息较多时的 1080×1280 中文或英文海报。火宝海报使用 htx-huobao-fast；VIP 金色、复杂长图、模板复刻或严格品牌质检使用 htx-brand。
---

# HTX 社媒海报

生成无火宝的 HTX 海报，只输出一个最终 PNG。

## 流程

1. 逐字锁定用户文案，不增写、不润色。
2. 只选一个布局：
   - `big-number-grid`：金额、比例、奖池、交易赛、步骤或信息较多的活动。
   - `soft-information`：招募、社群、产品介绍、温和公告；用户配图时优先使用。
3. 默认 1080×1080；正文较多时使用 1080×1280。背景保持原始比例，不拉伸；加高区域用自然渐隐衔接。
4. 写临时 JSON，运行 `scripts/render_social_poster.mjs`。
5. 查看 PNG；若有裁切、碰撞、异常换行或背景断层，只做一次针对性修正后交付。

## 配置

```json
{
  "layout": "big-number-grid",
  "output": "/absolute/path/poster.png",
  "eyebrow": "HTX 合约交易季",
  "title": "交易挑战赢50,000USDT",
  "titleSize": null,
  "eyebrowSize": null,
  "value": "",
  "valueSuffix": "",
  "cta": null,
  "modules": [
    {"title": "交易排行", "body": "完成合约交易任务参与每日排行榜"}
  ],
  "footer": "2026.08.10—08.31",
  "note": ""
}
```

- `layout` 只能是 `big-number-grid` 或 `soft-information`。
- `title` 必填，其余文案可空；`modules` 最多 3 项。
- `cta` 与 `modules` 二选一。单项不编号，2–3 项显示 `01/02/03`。
- 完整主标题放在 `title`；金额、比例和单位不得拆出后单独放大。`value` 仅兼容确有独立副标题的旧配置。
- 只用 `\n` 控制换行，不改写词句。
- `titleSize`、`eyebrowSize` 仅在用户指定字号时使用，范围 18–160 px。

## 排版规则

- 主标题约为画布宽度的 10%（108 px），不横向拉伸，字重 700，行高 130%。
- 小标题使用 Regular/400；主副标题紧凑成组，不贴安全边距。
- 时间与补充信息同级：28 px、Regular/400、纯黑；时间前自动添加同高、同色的时钟图标并垂直居中。
- 普通正文使用 Regular/400；只给主标题保留粗体，模块标题最多 Medium/500。
- 四边目标安全边距 80 px，硬下限 64 px。Logo 为 100×100，固定距上、右各 60 px。
- 品牌蓝 `#0066FF`；浅色区域文字使用纯黑。字体使用本 Skill 的 HarmonyOS Sans SC 与 Urbanist。

## 两种布局

### 蓝色栅格 `big-number-grid`

- 使用 `assets/backgrounds/blue-grid-gradient-01.png`，背景本身承担主题画面，原则上不配图。
- 主副标题和时间使用纯黑；时间可放在主标题下方，正文模块按内容放在下部。
- 1080×1280 时保持栅格原始 1080×1080，不放大；底部用透明至白色渐隐延展，禁止硬接缝。

### 柔和渐变 `soft-information`

- 使用 `assets/backgrounds/soft-blue-white-01.svg`。
- 左上标题组、中部视觉或信息、底部时间与补充信息；文案少时允许适度放大或放宽占位。
- 用户提供配图时等比放置，默认宽度约画布 40%，不得裁切或变形。

## 交付前检查

- 文案逐字完整，层级清楚；没有裁切、碰撞、异常断词或拉伸字体。
- 时间图标与时间文字等高、同色、垂直对齐；时间和补充信息字号一致。
- 背景未拉伸，栅格加高处没有断层；Logo 尺寸与边距正确。
- 只使用上述两种背景，不添加插画占位、阴影、霓虹或额外装饰。

仅交付最终 PNG；除非用户明确要求，不交付临时 HTML 或 JSON。

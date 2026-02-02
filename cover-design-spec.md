# 公众号封面设计规范

## 微信官方尺寸

| 类型 | 尺寸 | 比例 | 说明 |
|------|------|------|------|
| 头条大图 | 900 × 383 px | 2.35:1 | 文章封面主图 |
| 高清版本 | 1080 × 460 px | 2.35:1 | 推荐使用，更清晰 |
| 信息流裁剪 | 383 × 383 px (居中) | 1:1 | 历史消息列表/分享时的正方形裁剪 |
| 次条小图 | 200 × 200 px | 1:1 | 非头条文章封面 |

## 安全区设计

```
┌──────────────────────────────────────┐
│         1080 × 460 px                │
│                                      │
│  ┌─────────┐                         │
│  │ 460×460 │    文字区 620×460       │
│  │ 安全区   │    主标题 + 副标题      │
│  │ (裁剪区) │                        │
│  └─────────┘                         │
│                                      │
└──────────────────────────────────────┘
```

- **生成尺寸**: 1080 × 460 px（高清 2.35:1）
- **左侧安全区**: 460 × 460 px — 微信信息流/分享时的正方形裁剪区
  - 放主视觉图形/插画，构图需在正方形裁剪后仍完整
  - **不放关键文字**（裁剪后文字会被截断）
- **右侧文字区**: 620 × 460 px — 主标题 + 副标题
- **核心内容居中**: 重要元素集中在中央 383×383 区域内

## 视觉风格

- **背景**: 深色系渐变（深蓝 #0a1628 → 深紫 #1a0a3e），科技感
- **主视觉**: 与文章主题相关的抽象插画/图形
  - 使用发光线条、几何形状、光效粒子增加层次
  - 风格统一：扁平 + 微3D，不要写实照片
- **配色**: 主色深蓝/深紫 + 强调色根据主题变化
  - AI/技术类: 青蓝 #00d4ff + 紫 #a855f7
  - 工具/效率类: 绿 #10b981 + 蓝 #3b82f6
  - 观点/思考类: 橙 #f59e0b + 粉 #ec4899

## 排版规则

- **主标题**: 白色，粗体，手机上必须清晰可读
  - 最多两行，每行不超过 10 个中文字符
- **副标题**: 浅灰或强调色，比主标题小一号
  - 一行，简短补充
- **间距**: 主副标题间距适中

## 左侧视觉区设计原则

根据文章主题选择图形隐喻：
- 记忆/AI → 大脑、神经网络、数据流
- 架构/系统 → 层级结构、积木、齿轮
- 工具/教程 → 工具箱、代码编辑器、终端
- 数据/分析 → 图表、仪表盘、数据可视化

要求：
1. 在 460×460 正方形内构图完整
2. 有纵深感（多层叠加、发光边缘）
3. 不要太满，留呼吸空间
4. 与右侧文字区自然过渡（渐变融合）

## 生成模型

**必须使用 `gemini-3-pro-image-preview`**（通过 SOCKS5 代理）

## Prompt 模板

```
Generate a WeChat article cover image, exactly 1080x460 pixels, landscape banner format (2.35:1 ratio).

LEFT THIRD (460x460 square safe zone - will be cropped to square in WeChat feed):
[主题相关的视觉描述]
- Must look complete when cropped to a square
- Abstract, modern tech illustration style
- Glowing lines, subtle particles, depth layers
- Dark blue/purple gradient background

RIGHT TWO-THIRDS (text area):
- Main title in large bold white Chinese text: "[主标题]"
- Subtitle in [accent color] smaller text: "[副标题]"
- Text centered vertically in the right portion

Background: Dark navy/deep blue-purple gradient (#0a1628 to #1a0a3e), subtle geometric grid lines and floating light particles.
Style: Modern tech editorial, flat with subtle 3D depth, glowing accents. Professional, magazine-quality. NOT photorealistic.
```

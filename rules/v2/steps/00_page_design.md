# 页面设计技能 (Page Design)

## 技能定位
为前端测试页面提供结构化设计规范，确保UI/UX设计符合Apple设计语言，功能逻辑清晰简洁。

## 执行时机
在剧本创作工作流启动前，用于指导写作工作台(StudioView)的界面设计决策。

## 输入变量

```yaml
page_type: "studio" | "dashboard" | "demo"
user_persona: "编剧" | "导演" | "制片人"
workflow_steps: 6  # 写作工作台固定6步
feature_set:
  - session_management    # 会话管理
  - project_settings      # 项目设置
  - material_selection    # 素材选择
  - issue_feedback        # 历史问题反馈
  - step_execution        # 步骤执行
  - export                # 导出功能
```

## 设计规范 (Apple Design Language)

### 1. 颜色系统

```css
/* 浅色模式 */
--apple-bg-primary: #FFFFFF;           /* 主背景 */
--apple-bg-secondary: #F5F5F7;         /* 次级背景 */
--apple-bg-tertiary: #FFFFFF;          /* 卡片背景 */
--apple-label-primary: #1D1D1F;        /* 主文字 */
--apple-label-secondary: #6E6E73;      /* 次级文字 */
--apple-label-tertiary: #86868B;       /* 辅助文字 */
--apple-separator: rgba(0,0,0,0.08);   /* 分割线 */
--apple-accent-blue: #0071E3;          /* 主强调色 */
--apple-accent-green: #34C759;         /* 成功色 */
--apple-accent-orange: #FF9500;        /* 警告色 */
--apple-accent-red: #FF3B30;           /* 错误色 */
--apple-accent-purple: #AF52DE;        /* 创意色 */
--apple-glass-bg: rgba(255,255,255,0.72); /* 毛玻璃背景 */
```

### 2. 字体系统

```css
/* 字体栈 */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;

/* 字号层级 */
--font-large-title: 34px/1.2 600;      /* 页面大标题 */
--font-title-1: 28px/1.25 600;         /* 页面标题 */
--font-title-2: 22px/1.3 600;          /* 区块标题 */
--font-title-3: 17px/1.35 600;         /* 卡片标题 */
--font-body: 17px/1.5 400;             /* 正文 */
--font-callout: 16px/1.4 400;          /* 说明文字 */
--font-subhead: 15px/1.4 400;          /* 次级文字 */
--font-footnote: 13px/1.4 400;         /* 脚注 */
--font-caption: 12px/1.3 400;          /* 标签 */
```

### 3. 间距系统

```css
/* 8pt网格系统 */
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
--space-3xl: 64px;
```

### 4. 圆角系统

```css
--radius-sm: 8px;      /* 小元素 */
--radius-md: 12px;     /* 按钮、输入框 */
--radius-lg: 18px;     /* 卡片 */
--radius-xl: 28px;     /* 大卡片、弹窗 */
```

### 5. 阴影系统

```css
/* 极简阴影 */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
--shadow-md: 0 4px 16px rgba(0,0,0,0.06);
--shadow-lg: 0 8px 32px rgba(0,0,0,0.08);
```

## 页面布局规范

### StudioView 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│  Navigation Bar (Sticky)                                    │
│  - 返回/面包屑  |  页面标题  |  快捷操作                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌───────────────────────────────────┐ │
│  │                 │  │                                   │ │
│  │  Session List   │  │  Main Content Area                │ │
│  │  (Fixed 280px)  │  │  - Project Info                   │ │
│  │                 │  │  - Startup Checklist              │ │
│  │  [+ New]        │  │  - Materials & Feedback           │ │
│  │                 │  │  - Writing Steps                  │ │
│  └─────────────────┘  │                                   │ │
│                       └───────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 交互原则

1. **渐进式披露**
   - 默认展示核心功能
   - 高级选项折叠在"更多"中
   - 根据当前步骤动态显示相关操作

2. **即时反馈**
   - 所有操作有视觉反馈
   - 加载状态明确
   - 错误提示 inline

3. **手势友好**
   - 大按钮(最小44px)
   - 可滑动的会话列表
   - 支持键盘快捷键

4. **上下文感知**
   - 根据当前会话状态显示相关操作
   - 智能推荐下一步
   - 已完成步骤可折叠

## 组件规范

### 1. 会话卡片

```
┌──────────────────────────────┐
│ ○ Session Name               │
│   创建于 2024-01-15          │
│                              │
│   [标签] [标签]              │
└──────────────────────────────┘
```

- 圆角: 18px
- 背景: 白色，选中时蓝色边框
- 悬停: 轻微上浮 + 阴影
- 点击区域: 整张卡片

### 2. 步骤指示器

```
概念 → 角色 → 节拍 → 分场 → 正文 → 分镜
 ●     ○     ○     ○     ○     ○
```

- 已完成: 实心圆 + 绿色
- 当前: 实心圆 + 蓝色 + 放大
- 未完成: 空心圆 + 灰色
- 点击可跳转已完成的步骤

### 3. 操作按钮层级

```
主操作:     [  一键生成  ]     ← 实心蓝色
次级操作:   [  保存修改  ]     ← 描边
辅助操作:   [  导出  ▼  ]      ← 文字按钮
```

### 4. 输入框样式

- 背景: #F5F5F7
- 边框: 无(聚焦时显示蓝色边框)
- 圆角: 12px
- 内边距: 12px 16px
- 占位符: 灰色，斜体

### 5. 素材卡片

```
┌────────────────────────────────────────┐
│ □  素材标题                            │
│     类别 · 平台 · 热度                 │
│     [预览内容...]                      │
└────────────────────────────────────────┘
```

- 多选: 左上角 checkbox
- 选中: 蓝色边框 + 淡蓝背景
- 悬停: 显示"加入会话"按钮

## 动效规范

### 过渡时间

```css
--duration-instant: 100ms;   /* 微交互 */
--duration-fast: 200ms;      /* 状态变化 */
--duration-normal: 300ms;    /* 页面切换 */
--duration-slow: 500ms;      /* 复杂动画 */
```

### 缓动函数

```css
--ease-default: cubic-bezier(0.4, 0.0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0.0, 1, 1);
--ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 交互动画

1. **卡片悬停**
   - transform: translateY(-2px)
   - box-shadow: 增强
   - duration: 200ms

2. **按钮点击**
   - transform: scale(0.96)
   - duration: 100ms

3. **页面切换**
   - opacity: 0→1
   - transform: translateY(10px)→0
   - duration: 300ms

4. **Toast提示**
   - 从顶部滑入
   - 自动消失
   - duration: 300ms in, 200ms out

## 响应式断点

```css
--breakpoint-sm: 640px;   /* 手机横屏 */
--breakpoint-md: 768px;   /* 平板竖屏 */
--breakpoint-lg: 1024px;  /* 平板横屏/小笔记本 */
--breakpoint-xl: 1280px;  /* 桌面 */
--breakpoint-2xl: 1536px; /* 大屏 */
```

### 布局适配

- < 768px: 单栏，会话列表可收起
- 768px - 1024px: 双栏，会话列表240px
- > 1024px: 双栏，会话列表280px，最大内容宽度900px

## 无障碍规范

1. **色彩对比度**: 至少 4.5:1
2. **焦点状态**: 蓝色外边框 2px
3. **屏幕阅读器**: 所有图标有 aria-label
4. **键盘导航**: Tab顺序合理，支持Enter/Space

## 输出格式

```json
{
  "context_output": "页面设计规范摘要：Apple风格、6步写作流程、会话管理模式",
  "full_output": "完整的CSS变量定义、组件规范、动效规范（见上文）",
  "design_tokens": {
    "colors": { ... },
    "typography": { ... },
    "spacing": { ... },
    "shadows": { ... }
  },
  "component_specs": [ ... ],
  "interaction_specs": { ... }
}
```

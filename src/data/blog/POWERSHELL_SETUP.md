---
title: 'Windows PowerShell 终极美化与增强指南'
description: '将 Windows PowerShell 打造成一个类似 Oh My Zsh 的高效、美观的终端环境，包含 Starship、Zoxide、智能补全和 0x96f 主题配置。'
pubDatetime: 2025-12-31T00:00:00Z
featured: true
tags:
  - PowerShell
  - DevTools
  - Setup
  - Windows-Terminal
---

本文档记录了如何将 Windows PowerShell 打造成一个类似 Oh My Zsh 的高效、美观的终端环境。

## 📦 1. 前置准备

确保已安装包管理器 **Scoop**（用于安装工具）和 **PNPM**（如果需要 Node 环境）。

```powershell
# 检查 Scoop 是否安装
scoop --version
```

## 🛠️ 2. 核心工具安装

我们使用 Scoop 安装以下三大神器：

*   **Starship**: 极速、可高度定制的终端提示符（Prompt）。
*   **Zoxide**: 智能目录跳转工具（比 `cd` 更快）。
*   **Bat**: 支持语法高亮的 `cat` 替代品。

```powershell
scoop install starship zoxide bat
```

## ⌨️ 3. 智能补全与预测 (PSReadLine)

为了实现类似 `zsh-autosuggestions` 的灰色行内自动补全，我们需要升级 `PSReadLine` 到最新版。

```powershell
# 安装最新稳定版
Install-Module PSReadLine -Force -SkipPublisherCheck -Scope CurrentUser
```

## 🎨 4. 解决图标乱码 (Nerd Fonts)

Starship 依赖 Nerd Fonts 来显示漂亮的图标（如 Git 分支、语言 Logo 等）。

1.  **添加字体库并安装**:
    ```powershell
    scoop bucket add nerd-fonts
    scoop install Maple-Mono-NF-CN
    ```
2.  **配置终端**:
    打开 Windows Terminal 设置 -> 外观 -> 字体，选择 **`Maple Mono NF CN`**。

## 🎨 5. Windows Terminal 主题配置 (0x96f)

为了获得更佳的视觉体验，我们推荐使用 [0x96f Terminal Theme](https://github.com/filipjanevski/0x96f-term-theme) —— 一个简洁舒适的深色终端主题。

### 安装步骤

1.  **下载主题文件**:
    从 [0x96f-term-theme](https://github.com/filipjanevski/0x96f-term-theme) 仓库下载 `windows-terminal` 文件夹中的主题文件。

2.  **打开 Windows Terminal 设置**:
    按 `Ctrl + ,` 打开设置界面。

3.  **编辑 settings.json**:
    在左侧窗格底部点击 `Open JSON file`，打开 `settings.json` 文件。

4.  **添加颜色方案**:
    找到 `schemes` 部分（应该类似 `"schemes": []`），将以下内容粘贴进去：

    ```json
    "schemes": [
        {
            "name": "0x96f",
            "background": "#262427",
            "black": "#262427",
            "blue": "#49CAE4",
            "brightBlack": "#545452",
            "brightBlue": "#64D2E8",
            "brightCyan": "#BAEBF6",
            "brightGreen": "#C6E472",
            "brightPurple": "#AEA3E6",
            "brightRed": "#FF8787",
            "brightWhite": "#FCFCFA",
            "brightYellow": "#FFD271",
            "cursorColor": "#FCFCFA",
            "cyan": "#AEE8F4",
            "foreground": "#FCFCFA",
            "green": "#BCDF59",
            "purple": "#A093E2",
            "red": "#FF7272",
            "selectionBackground": "#FCFCFA",
            "white": "#FCFCFA",
            "yellow": "#FFCA58"
        }
    ]
    ```

5.  **应用主题**:
    *   在左侧窗格中点击 `Color schemes`
    *   选择 `0x96f` 并点击 `Set as default`
    *   确保你使用的配置文件的颜色方案设置为 `0x96f`

### 主题特点

*   **背景**: 深灰色 `#262427`，护眼舒适
*   **前景色**: 接近白色的 `#FCFCFA`，清晰易读
*   **配色和谐**: 红、蓝、绿、紫等颜色经过精心调配，不会过于刺眼
*   **语法高亮优秀**: 适合代码开发，关键字和字符串颜色分明

> 💡 **提示**: 该主题已被 [mbadolato/iTerm2-Color-Schemes](https://github.com/mbadolato/iTerm2-Color-Schemes) 官方收录，质量有保证。

## ⚙️ 6. 配置文件 (`$PROFILE`)

运行 `code $PROFILE` (如果已配置别名) 或 `notepad $PROFILE`，写入以下内容：

```powershell
# ==============================
#  基本设置
# ==============================
$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding

# ==============================
#  常用别名 (Aliases)
# ==============================
Set-Alias p pnpm
Set-Alias dc docker-compose
Set-Alias which where.exe  # 模拟 Linux 'which'
Set-Alias code cursor      # 使用 'code' 打开 Cursor 编辑器

# 注意：PowerShell 内置了 'cat' 别名且无法覆盖，
# 请直接使用 'bat' 命令查看文件，或设置其他别名如 'b'。

# ==============================
#  PSReadLine 配置 (智能补全)
# ==============================
if ($host.Name -eq 'ConsoleHost' -or $host.Name -eq 'Visual Studio Code Host') {
    Import-Module PSReadLine
    # 启用历史记录预测
    Set-PSReadLineOption -PredictionSource History
    # 设置为行内视图 (灰色文字)
    Set-PSReadLineOption -PredictionViewStyle InlineView
    # 设置预测文字颜色
    Set-PSReadLineOption -Colors @{ "Prediction" = [ConsoleColor]::DarkGray }
    
    # 键位绑定：上下键搜索历史
    Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
    Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward
}

# ==============================
#  工具初始化
# ==============================

# 🚀 Starship Prompt
Invoke-Expression (&starship init powershell)

# 📂 Zoxide (智能跳转)
# 注意：PowerShell 5.1 需要添加 '--hook prompt'
Invoke-Expression (& { (zoxide init powershell --hook prompt | Out-String) })
```

## 💡 使用技巧

*   **快速跳转**: 经常访问目录 `C:\Users\Name\Projects\web` 后，只需输入 `z web` 即可瞬间跳转。
*   **历史搜索**: 输入 `git` 然后按 `↑` (上箭头)，只会翻阅以 `git` 开头的历史命令。
*   **查看文件**: 使用 `bat README.md` 替代 `cat`，享受语法高亮。
*   **自动补全**: 输入命令时看到灰色建议，按 `→` (右箭头) 即可采纳。

---
*Created by Gemini CLI Assistant*


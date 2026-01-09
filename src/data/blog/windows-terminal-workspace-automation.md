---
title: 'Windows Terminal + PowerShell 一键启动本地开发工作区'
description: '在 Windows 环境下实现类似 tmux 的工作区自动化：一键打开窗口、按固定布局分屏、并在各面板中自动启动开发服务。'
pubDatetime: 2026-01-09T00:00:00Z
featured: true
tags:
  - Windows-Terminal
  - PowerShell
  - Automation
  - DevTools
---

本文记录如何在 **Windows Terminal + PowerShell** 下实现类似 `tmux` 的工作区自动化：一键打开窗口、按固定布局分屏、并在各 pane 中自动启动对应服务进程。

## 🎯 1. 目标效果

*   **窗口/Tab 标题**：`DevWorkspace`（可自定义）
*   **Pane 布局**：
    *   **最右侧整列**：`assistant` (占满高度)
    *   **左侧从上到下**：`web` → `backend` → `worker`
*   **自动命令**：每个 pane 自动进入对应目录并执行命令（如 `yarn dev`）。

---

## ⚠️ 2. 常见坑与解决思路

在 Windows Terminal 中，`wt` 需要启动一个真实存在的“可执行文件”。如果把 `yarn dev` 直接交给 `wt` 当成 commandline，容易出现 `0x80070002`（系统找不到指定的文件），因为 `wt` 会把整段字符串当作 exe 名去查找。

> 💡 **最稳方案**：让 `wt` 只启动 `cmd.exe`，再由 `cmd` 执行 `cd && <command>`。这样 `wt` 启动的是始终存在的程序，命令解析由 shell 完成。

---

## 🛠️ 3. 前置条件

确保以下命令在 **CMD 环境**可用：

```powershell
cmd /c where wt
cmd /c where node
cmd /c where yarn
cmd /c where assistant-cli
```

若 `yarn` 不存在，可尝试修复：
```powershell
corepack enable
corepack prepare yarn@stable --activate
```

---

## ⚙️ 4. 自动化脚本 (`Start-DevWorkspace.ps1`)

将以下内容保存为 `Start-DevWorkspace.ps1`。你可以根据项目需求调整脚本开头的 **可配置区**。

```powershell
[CmdletBinding()]
param(
  [string]$RepoRoot = (Join-Path $HOME "repo"),
  [switch]$ReuseWindow,
  [string]$WindowName = "dev-workspace",
  [switch]$SelfCheck = $true,
  [switch]$PrintWtArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ====== 可配置区：目录名与启动命令 ======
$WorkspaceTitle = "DevWorkspace"
$WebDirName     = "app-web"
$BackendDirName = "app-backend"
$WorkerDirName  = "app-worker"

$WebCommand     = "yarn dev"
$BackendCommand = "yarn start"
$WorkerCommand  = "yarn start"
$AssistantCommand = "assistant-cli"   # 可替换为 gemini / aider 等
# =============================================================

function Assert-Path([string]$Path, [string]$Hint) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw ("Path not found: {0}`nHint: {1}" -f $Path, $Hint)
  }
}

function Require-Command([string]$Cmd, [string]$Hint) {
  $c = Get-Command $Cmd -ErrorAction SilentlyContinue
  if (-not $c) { throw ("Command not found: {0}`nHint: {1}" -f $Cmd, $Hint) }
  return $c.Source
}

function CmdCapture([string]$cmd) {
  try {
    $out = cmd.exe /c $cmd 2>$null
    if ($null -eq $out) { return "" }
    return ($out | Out-String).Trim()
  } catch { return "" }
}

# --- 依赖检查 ---
$WtExe = Require-Command "wt" "Please install Windows Terminal."
$yarnWhere = CmdCapture "where yarn"
if (-not $yarnWhere) { throw "yarn not found in CMD PATH." }
$HasAssistant = [bool](CmdCapture ("where " + ($AssistantCommand.Split(" ")[0])))

# --- 工作区路径 ---
$WebPath     = Join-Path $RepoRoot $WebDirName
$BackendPath = Join-Path $RepoRoot $BackendDirName
$WorkerPath  = Join-Path $RepoRoot $WorkerDirName

Assert-Path $RepoRoot "Use -RepoRoot to point to your repo folder."
Assert-Path $WebPath  ("Missing folder: {0}" -f $WebPath)

# --- 生成 cmd.exe 参数 ---
function CmdArgs([string]$WorkDir, [string]$Run, [string]$PaneTitle) {
  $cmdLine = 'title {0} && cd /d "{1}" && {2}' -f $PaneTitle, $WorkDir, $Run
  return @("cmd.exe", "/k", $cmdLine)
}

$WebArgs    = CmdArgs $WebPath     $WebCommand     "web"
$BackArgs   = CmdArgs $BackendPath $BackendCommand "backend"
$WorkArgs   = CmdArgs $WorkerPath  $WorkerCommand  "worker"
$AssistArgs = if ($HasAssistant) { CmdArgs $WebPath $AssistantCommand "assistant" } 
              else { CmdArgs $WebPath "echo assistant not found & pause" "assistant" }

# --- 组装 wt 参数 ---
$wtArgs = New-Object System.Collections.Generic.List[string]
if ($ReuseWindow) { $wtArgs.Add("-w"); $wtArgs.Add($WindowName) } else { $wtArgs.Add("-w"); $wtArgs.Add("-1") }

# 1) 左上：web
$wtArgs.Add("new-tab"); $wtArgs.Add("-d"); $wtArgs.Add($WebPath); $wtArgs.Add("--title"); $wtArgs.Add($WorkspaceTitle)
foreach ($a in $WebArgs) { $wtArgs.Add($a) }

# 2) 右侧：assistant (垂直分割)
$wtArgs.Add(";"); $wtArgs.Add("split-pane"); $wtArgs.Add("-V"); $wtArgs.Add("-d"); $wtArgs.Add($WebPath); $wtArgs.Add("--title"); $wtArgs.Add("assistant")
foreach ($a in $AssistArgs) { $wtArgs.Add($a) }

# 3) 回到左侧并水平分割出 backend 和 worker
$wtArgs.Add(";"); $wtArgs.Add("move-focus"); $wtArgs.Add("left")
$wtArgs.Add(";"); $wtArgs.Add("split-pane"); $wtArgs.Add("-H"); $wtArgs.Add("-d"); $wtArgs.Add($BackendPath); $wtArgs.Add("--title"); $wtArgs.Add("backend")
foreach ($a in $BackArgs) { $wtArgs.Add($a) }

$wtArgs.Add(";"); $wtArgs.Add("move-focus"); $wtArgs.Add("down")
$wtArgs.Add(";"); $wtArgs.Add("split-pane"); $wtArgs.Add("-H"); $wtArgs.Add("-d"); $wtArgs.Add($WorkerPath); $wtArgs.Add("--title"); $wtArgs.Add("worker")
foreach ($a in $WorkArgs) { $wtArgs.Add($a) }

# 焦点回到 web
$wtArgs.Add(";"); $wtArgs.Add("move-focus"); $wtArgs.Add("up"); $wtArgs.Add(";"); $wtArgs.Add("move-focus"); $wtArgs.Add("up")

& $WtExe @($wtArgs.ToArray())
```

---

## 💡 使用技巧

*   **默认启动**：`.\Start-DevWorkspace.ps1`
*   **指定目录**：`.\Start-DevWorkspace.ps1 -RepoRoot "D:\my-projects"`
*   **调试参数**：使用 `-PrintWtArgs` 查看最终传递给 `wt.exe` 的完整命令行。

## 🎨 定制建议

*   **固定比例**：在 `split-pane` 命令中加入 `--size 0.3`（不同版本 WT 支持略有差异）。
*   **静默标题**：若不希望窗口标题被应用覆盖，可增加 `--suppressApplicationTitle`。

---
*Created by Gemini CLI Assistant*

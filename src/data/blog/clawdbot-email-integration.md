---
title: '给 AI 助手装上邮箱：Clawdbot + Cloudflare 邮件集成实战'
description: '使用 Cloudflare Email Routing、Workers、Tunnel 和 Access 打造一个安全、实时、免费的 AI 邮件助理。Zero Trust 架构，邮件到达秒级响应。'
pubDatetime: 2026-01-27T18:00:00Z
featured: false
draft: true
tags:
  - AI
  - Clawdbot
  - Cloudflare
  - Email
  - Zero Trust
---

当你的 AI 助手能帮你读邮件、生成摘要、告诉你哪些需要处理时，收件箱焦虑就不存在了。

今天分享一下我如何用 Cloudflare 全家桶，给 Clawdbot 加上邮件接收能力——实时、免费、安全。

## 目标

实现这样的流程：

```
收到邮件 → AI 自动阅读 → 发送摘要到 Telegram
```

示例效果：

> 📧 收到邮件：Stripe 通知将于 2 月 25 日起自动开启"自适应定价"。不需要处理。

## 方案选型

### 从第一性原理出发

在动手之前，先想清楚几个问题：

1. **需要存储历史邮件吗？** —— 不需要，实时处理即可
2. **邮件来源？** —— 目前只有自己发，可用白名单
3. **触发方式？** —— 推送，邮件到达即处理

### 可选方案对比

| 方案 | 实时性 | 存储 | 复杂度 | 成本 |
|------|--------|------|--------|------|
| Cloudflare Worker | ✅ 实时 | ❌ 无 | 低 | 免费 |
| Gmail + IMAP 轮询 | ⏱ 延迟 | ✅ 有 | 低 | 免费 |
| 自建邮件服务器 | ✅ 实时 | ✅ 有 | 高 | 服务器 |

结论：**Cloudflare Worker** 最适合我的场景。

## 架构设计

最终方案的架构：

```
邮件 → bot@yourdomain.com
         ↓
   Cloudflare Email Routing
         ↓
   Email Worker (验证发件人白名单)
         ↓
   Cloudflare Tunnel
         ↓
   Cloudflare Access (Service Token 认证)
         ↓
   Clawdbot Gateway API
         ↓
   AI 处理 → 发送摘要
```

### 为什么要用 Tunnel + Access？

直接调用本地 Gateway 需要公网可访问。有两个选择：

1. **暴露端口到公网** —— 有安全风险
2. **Cloudflare Tunnel** —— Zero Trust，安全

Tunnel 的好处：
- 不暴露服务器真实 IP
- 通过 Cloudflare 网络保护
- 配合 Access 做身份验证

Access 的 Service Token 机制确保只有持有正确凭证的 Worker 才能访问 Gateway，即使 Tunnel URL 泄露也无法被滥用。

## 实现步骤

### 1. 创建 Email Worker

```javascript
// worker.js
const CONFIG = {
  allowedSenders: ['your-email@gmail.com'],
  gateway: {
    url: 'https://gateway.yourdomain.com',
    token: 'your-gateway-token',
  },
  access: {
    clientId: 'your-access-client-id',
    clientSecret: 'your-access-client-secret',
  },
};

export default {
  async email(message, env, ctx) {
    const from = message.from;
    const subject = message.headers.get('subject') || '(无主题)';
    
    // 验证发件人白名单
    const senderEmail = extractEmail(from);
    if (!CONFIG.allowedSenders.includes(senderEmail.toLowerCase())) {
      console.log(`发件人不在白名单: ${senderEmail}`);
      return; // 静默丢弃
    }
    
    // 读取邮件正文
    const rawEmail = await new Response(message.raw).text();
    const body = extractPlainTextBody(rawEmail);
    
    // 构建系统消息
    const systemMessage = `[SYSTEM:EMAIL_RECEIVED]
收到一封新邮件，请生成简短摘要。

发件人: ${from}
主题: ${subject}
正文: ${body}`;
    
    // 调用 Gateway API
    await sendToClawdbot(systemMessage);
  },
};

async function sendToClawdbot(message) {
  const response = await fetch(`${CONFIG.gateway.url}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.gateway.token}`,
      'CF-Access-Client-Id': CONFIG.access.clientId,
      'CF-Access-Client-Secret': CONFIG.access.clientSecret,
    },
    body: JSON.stringify({
      tool: 'sessions_send',
      args: { sessionKey: 'main', message },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Gateway error: ${response.status}`);
  }
}
```

### 2. 配置 Cloudflare Tunnel

```bash
# 安装 cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# 创建 Tunnel（通过 API 或 Dashboard）
# 配置 ingress 规则指向本地 Gateway 端口
```

创建 systemd 服务让 Tunnel 开机自启：

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
Environment="TUNNEL_TOKEN=your-tunnel-token"
ExecStart=/usr/local/bin/cloudflared tunnel run
Restart=always

[Install]
WantedBy=multi-user.target
```

### 3. 配置 Cloudflare Access

1. 创建 Access Application，绑定 `gateway.yourdomain.com`
2. 创建 Service Token
3. 创建 Access Policy，只允许该 Service Token 访问

验证配置：

```bash
# 不带 token - 应该返回 403
curl https://gateway.yourdomain.com/health

# 带 token - 应该返回 200
curl https://gateway.yourdomain.com/health \
  -H "CF-Access-Client-Id: your-client-id" \
  -H "CF-Access-Client-Secret: your-client-secret"
```

### 4. 配置 Email Routing

1. 在 Cloudflare Dashboard 进入域名设置
2. Email → Email Routing → Routing Rules
3. 创建规则：`bot@yourdomain.com` → Send to Worker → `email-to-clawdbot`

### 5. 让 AI 识别邮件消息

在 Clawdbot 的工作区配置（如 `AGENTS.md`）中添加邮件处理规则：

```markdown
## 邮件处理

当收到以 `[SYSTEM:EMAIL_RECEIVED]` 开头的消息时：

1. 阅读邮件内容
2. 生成简短摘要（1-2句话）
3. 如果需要用户操作，明确说明
4. 格式：`📧 收到邮件：<摘要> [需要/不需要处理]`
```

## 安全考量

### 1. 发件人白名单

只处理来自白名单的邮件，其他一律丢弃。这能防止：
- 垃圾邮件干扰
- **Prompt Injection 攻击**（恶意邮件内容可能诱导 AI 执行危险操作）

### 2. Zero Trust 架构

- Gateway 不直接暴露公网
- Tunnel 通过 Cloudflare 网络加密传输
- Access 强制认证，无 Token 无法访问

### 3. 最小权限原则

Service Token 只用于 Worker → Gateway 通信，不暴露给其他场景。

## 成本分析

| 组件 | 成本 |
|------|------|
| Cloudflare Email Routing | 免费 |
| Cloudflare Workers | 免费（每日 10 万次请求）|
| Cloudflare Tunnel | 免费 |
| Cloudflare Access | 免费（50 用户以内）|
| **总计** | **$0** |

## 总结

这套方案的优点：

- ✅ **实时** —— 邮件到达秒级处理
- ✅ **免费** —— 全部使用 Cloudflare 免费套餐
- ✅ **安全** —— Zero Trust 架构，多层防护
- ✅ **私密** —— 邮件在本地处理，不经第三方

现在我的 AI 助手会在收到邮件时自动告诉我重点内容，再也不用担心错过重要邮件了。

---

*本文基于 Clawdbot + Cloudflare 技术栈，具体实现可能因版本更新而有所变化。*

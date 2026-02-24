---
title: '透明代理下 Claude 提示地区不可用？八成是 DNS 泄露'
description: '同一个节点，Surge 能上 Claude，透明代理不行。排查了半天，最后一条 nftables 规则修好了。'
pubDatetime: 2026-02-24T00:00:00Z
featured: false
tags:
  - 网络
  - 代理
  - DNS
  - 踩坑
---

今天踩了个坑，记录一下。

手机开 Surge，同一个美国节点，claude.ai 正常。家里走透明代理，打开就是 "app unavailable in region"。

## 背景

家里的网络出口是 PVE 上一个 Alpine LXC，里面跑 Mihomo（Clash Meta）做透明代理。YouTube、Google 都没问题，就 Claude 不行。

翻了一圈规则，`claude.ai`、`claude.com`、`anthropic.com` 都指向 AI 代理组，选的美国节点。规则没毛病。

拿同一个机场同一个节点，手机 Surge 连上去试，Claude 正常。

所以不是节点的问题，是透明代理这边的实现漏了什么。

## 原因

DNS 泄露。

透明代理劫持了 TCP/UDP 流量到 Mihomo 的代理端口，但 DNS 查询走的是 UDP 53，没有被重定向到 Mihomo 的 DNS 监听端口 1053。

客户端解析 `claude.ai` 的时候，DNS 请求直接走了本地 ISP。虽然最终的 HTTPS 请求从美国出口出去了，但 DNS 那边已经暴露了你的真实位置。Claude 的风控比较严，综合判断后直接拒了。

Mihomo 的 DNS 配置其实写了 DoH，也配了 `fake-ip-range`，但客户端的 DNS 压根没发到 1053——配置写得再好，流量不进来等于没有。

Surge 不存在这个问题，因为它在应用层就把 DNS 接管了。透明代理是网关级劫持，DNS 要单独处理。

## 修复

一条 nftables 规则：

```bash
nft add rule ip nat mihomo_prerouting udp dport 53 redirect to :1053
```

加完刷新 claude.ai，立刻好了。

## 持久化

LXC 里跑的是 Alpine（OpenRC），需要手动持久化 nftables 规则：

```bash
# 导出当前规则
nft list ruleset > /etc/nftables.conf

# 写开机加载脚本
cat > /etc/local.d/nftables.start <<'EOF'
#!/bin/sh
nft -f /etc/nftables.conf
EOF
chmod +x /etc/local.d/nftables.start

# 确保 local 服务在 default runlevel
rc-update add local default
```

## 教训

以后遇到"地区不可用"，别只看出口 IP，先确认 DNS 有没有走代理。透明代理环境下 UDP 53 不会自动被劫持，需要显式重定向。

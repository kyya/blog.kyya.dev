---
title: '透明代理把我卖了：DNS 泄露导致 Claude 直接判我在中国'
description: '同一个美国节点，手机 Surge 能上 Claude，家里透明代理却一直 app unavailable in region。最后发现不是节点问题，是我没劫持 UDP 53。'
pubDatetime: 2026-02-24T00:00:00Z
featured: false
tags:
  - 网络
  - 代理
  - DNS
  - 踩坑
---

今天被 Claude 狠狠教育了一次：

- 手机开 Surge → claude.ai 正常
- 家里走透明代理 → 打开就是 “app unavailable in region”

最气的是：规则看起来一点毛病没有，节点也是美国的。折腾半天，最后只改了一条 nftables 规则就好了。

## 现象：透明代理下 Claude 提示不可用地区

我的网络大概是这样：

- 家里设备（电脑/手机/平板）
- 出口是 PVE 上一个 Alpine LXC
- LXC 里跑 Mihomo（Clash Meta）做透明代理（redir/tproxy 那套）

其它网站都很正常，YouTube、Google、各种 AI 站都没啥异常。

只有 claude.ai 一直弹：

> app unavailable in region

这个提示你一看就知道：它在做地区判断，而且它觉得我在不该出现的地方。

## 初步排查：规则没写错、节点也没问题

我第一反应当然是：规则写崩了。

翻了一圈 Mihomo 的规则：

- `claude.ai`
- `anthropic.com`

都明确指向 AI 代理组，AI 组里选的也是美国节点。

为了排除“节点被封/被 Claude 拉黑”的可能，我拿同一个机场、同一个节点，手机上用 Surge 直连试了下：Claude 正常登录、正常聊天。

这就很诡异了：

- 节点没问题
- 域名规则没问题
- 只有“透明代理”这条链路不行

## 关键线索：同一节点 Surge 能用，透明代理不行

这个对比基本把锅甩到了“实现细节”上：

- Surge 是客户端代理：应用层就把请求（包括 DNS）接管了
- 透明代理是网络层劫持：你只劫持了你以为的流量

讲人话：Surge 像“你所有快递都先送到我这，我再决定怎么发”。透明代理像“我在小区门口拦截快递车”，但你可能只拦了货车，没拦快递员骑的小电驴。

于是我开始怀疑：是不是有一部分关键流量没进代理。

## 根因：DNS 泄露（UDP 53 没被重定向）

最后的结论很土，但也最常见：DNS 泄露。

我的透明代理规则当时只做了两件事：

- 把 TCP/UDP 的普通流量重定向到 Mihomo 的透明代理端口
- 没管 DNS

结果就是：

- 访问 `claude.ai` 的 HTTP(S) 走了代理（美国出口）
- 但解析 `claude.ai` 的 DNS 查询直接走了本地 ISP（中国 DNS）

Claude 大概率是用“你解析到的 IP / DNS 路径特征 / 相关风控信号”综合判断地区。

你别看最终请求 IP 是美国出口，DNS 那边已经把你底裤都漏光了。

### 我当时的 Mihomo DNS 配置其实不差，但没用上

我在 Mihomo 里是配了 DoH 的，监听端口也放在了 `1053`：

```yaml
dns:
  enable: true
  listen: 0.0.0.0:1053
  nameserver:
    - https://1.1.1.1/dns-query
    - https://dns.google/dns-query
  fake-ip-range: 198.18.0.1/16
  # enhanced-mode 没开（或者没设置成 fake-ip）
```

看起来挺美。

但问题是：客户端压根没把 DNS 发到 `1053`，它们还在老老实实问路由器/ISP 的 `53`。

配置写得再花，流量不进来等于 0。

## 修复：nftables 劫持 UDP 53 → 1053

修复就一句话：把所有 UDP 53 重定向到 Mihomo 的 DNS 监听端口 `1053`。

我用的是 nftables，规则长这样（示例是 inet 表 + prerouting）：

```nft
table inet mihomo {
  chain prerouting {
    type nat hook prerouting priority -100; policy accept;

    # 让局域网客户端的 DNS 都先进 Mihomo 的 DNS
    udp dport 53 redirect to :1053

    # 如果你环境里有人用 TCP 53（少见，但不是没有）也可以一起加：
    # tcp dport 53 redirect to :1053
  }
}
```

加完立刻生效。

回到浏览器刷新 claude.ai，那个“app unavailable in region”当场消失。

我那一刻的感受是：

- 前面查规则、换节点、怀疑人生，全是弯路
- 真正的 bug 只有一行

## 为什么 Surge 不会踩这个坑？

因为 Surge（以及大部分“客户端代理”）默认就把 DNS 也管了：

- 你系统的 DNS 解析会走它的 DNS 组件
- 它再决定用 DoH/DoT/代理链路去解析

透明代理这边，你自己做的是“网关级劫持”，那就要想清楚：

- 你劫持了哪些端口？
- DNS 走 UDP 53，你有没有劫？
- 你是不是以为配置了 fake-ip-range 就等于开了 fake-ip？（并没有）

如果 DNS 没进代理，很多站你看不出问题（因为它们不敏感）。Claude 这种风控偏凶的，一眼把你揪出来。

## Alpine LXC 下 nftables 持久化（OpenRC 版）

LXC 里跑的是 Alpine，用的是 OpenRC。

我不想每次重启都手敲 nft，直接持久化：

1）确认规则没问题后导出：

```sh
nft list ruleset > /etc/nftables.conf
```

2）写一个开机脚本 `local.d`：

```sh
cat > /etc/local.d/nftables.start <<'EOF'
#!/bin/sh
nft -f /etc/nftables.conf
EOF

chmod +x /etc/local.d/nftables.start
```

3）确保 local 服务在 default runlevel：

```sh
rc-update add local default
```

重启后 `nft list ruleset` 看一眼，规则还在就 OK。

## 收尾：以后我排查“地区不可用”会先看 DNS

这次坑的本质是：我一直把“出口 IP 是美国”当成结束，但实际上“解析链路”也算一条腿。

所以以后再遇到类似问题，我的 checklist 会变成：

- 请求的流量有没有走代理（出口 IP）
- DNS 有没有走代理（是不是在问 ISP 的 53）
- 透明代理有没有单独做 DNS 劫持

如果你也在搞 Mihomo 透明代理，又刚好遇到 Claude/某些站诡异的地区提示，别跟我一样先怀疑节点。

先把 UDP 53 劫了。

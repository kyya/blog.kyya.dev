---
title: 'PVE LXC + Mihomo 透明代理踩坑全记录：从 DNS 泄露到 TProxy 全流量劫持'
description: '在 Proxmox Alpine LXC 上用 Mihomo（Clash Meta）搭透明代理，踩了三个坑才跑通。完整记录排查过程和最终方案。'
pubDatetime: 2026-02-25T00:00:00Z
featured: true
tags:
  - 网络
  - 代理
  - nftables
  - TProxy
  - Proxmox
  - 踩坑
---

在 PVE 上用一个 Alpine LXC（107）跑 Mihomo（Clash Meta）做家庭透明代理，前后踩了三个坑，每次都以为修好了，结果下一个问题在后面等着。这篇把三次排查合在一起，从头到尾讲清楚。

## 网络架构

```
Mac Mini (192.168.6.223)
  ↓ 网关 192.168.6.7
LXC 107 - clash-meta (Alpine)
  ├── eth0: 192.168.1.7/24（主网段）
  ├── eth1: 192.168.6.7/24（副网段）
  └── Mihomo 端口：
      ├── 7890  HTTP 代理
      ├── 7891  SOCKS 代理
      ├── 7892  TProxy 透明代理
      ├── 1053  DNS（fake-ip 模式）
      └── 9090  外部控制器
```

Mac Mini 把网关指向 192.168.6.7，所有流量都经过 LXC 107。Mihomo 负责根据规则分流：该直连的直连，该代理的走节点。

## 第一坑：DNS 泄露 → Claude 提示地区不可用

### 症状

YouTube、Google 正常，唯独 Claude 打不开，提示 "app unavailable in region"。

同一个机场同一个美国节点，手机开 Surge 连 Claude 没问题。说明不是节点的问题。

### 排查

看 nftables 规则，只有 mangle 表里的 TCP TProxy 规则，**没有任何 DNS 劫持**。

客户端解析 `claude.ai` 时，DNS 请求（UDP 53）直接走了上游路由器，最终到了 ISP 的 DNS 服务器。虽然后续 HTTPS 连接从美国节点出去了，但 DNS 查询已经暴露了真实位置。

Claude 的风控比较严格，DNS 解析地和出口 IP 不一致，直接拒绝。其他服务没这么严所以没感觉。

Surge 不存在这个问题——它在应用层接管 DNS。透明代理是网关级劫持，DNS 必须单独处理。

### 修复

```bash
nft add rule ip nat mihomo_prerouting udp dport 53 redirect to :1053
```

把所有 DNS 查询劫持到 Mihomo 的 1053 端口。加完刷新 Claude，立刻好了。

## 第二坑：TCP 重定向丢失 → 能解析但连不上

### 症状

过了几天，又不行了。这次不只是 Claude，所有外网都超时。

### 排查

进 LXC 看 nftables，只剩一条 DNS 劫持规则。TCP 的 TProxy/redirect 规则不知道什么时候丢了——可能是 Mihomo 重启或 LXC 重建把 nftables 覆盖了。

流量路径变成了：

1. Mac Mini DNS 查询 → 劫持到 Mihomo 1053 → 返回 fake-ip（198.18.x.x）✅
2. Mac Mini TCP 连接 198.18.x.x:443 → **没有任何规则劫持** → 直接出去 ❌

198.18.0.0/15 是 fake-ip 地址段，在公网上不存在。DNS 走了代理返回 fake-ip，但 TCP 没进代理做真正的连接，客户端拿到一个假地址当然连不上。

### 修复

加回 TCP 重定向规则，把 fake-ip 段和其他外网流量都导到 Mihomo：

```bash
nft add rule ip nat mihomo_prerouting \
  ip protocol tcp ip daddr 198.18.0.0/15 redirect to :7892
```

### 教训

nftables 规则必须持久化，而且要跟 Mihomo 的生命周期绑定，不能单独存一个文件指望它不被覆盖。

## 第三坑：TProxy 只匹配 fake-ip 段，但 DNS 返回真实 IP

### 症状

又过了一段时间。Mac Mini 再次无法访问外网，全部超时。

### 排查

这次 nftables 规则还在，mangle 表的 TProxy 规则完整：

```
chain mihomo_prerouting {
    type filter hook prerouting priority mangle; policy accept;
    ip saddr 192.168.6.7 return
    ip saddr 192.168.1.7 return
    ip daddr 192.168.0.0/16 return
    ip daddr 10.0.0.0/8 return
    ip daddr 127.0.0.0/8 return
    ip daddr 100.64.0.0/10 return
    ip daddr 198.18.0.0/15 ip protocol tcp tproxy to :7892 meta mark set 0x000000de
}
```

排除内网，fake-ip 段的 TCP 走 TProxy。看起来没问题。

但是：

```bash
nslookup google.com 192.168.6.7:1053
# Address: 142.250.198.174
```

**DNS 返回的是真实 IP，不是 fake-ip。**

`142.250.198.174` 不在 `198.18.0.0/15` 范围内，mangle 规则直接放行了。流量走默认路由出去，没经过代理。

同时用代理端口直接测试，200 OK，代理本身完全正常：

```bash
curl -x http://127.0.0.1:7890 https://www.google.com  # 200 ✅
```

### 为什么 fake-ip 没生效

Mihomo 配了 `enhanced-mode: fake-ip`，DNS 监听 1053。但 fake-ip 模式不保证所有查询都返回 fake-ip 地址——对于匹配 Direct 规则的域名、`nameserver-policy` 指定的域名，Mihomo 可能直接返回真实解析结果。

具体原因不重要，重要的是：**不能假设 DNS 一定返回 fake-ip。**

### 修复

把 mangle 规则从"只匹配 fake-ip 段"改为"匹配所有外网流量"：

```bash
nft flush chain ip mangle mihomo_prerouting

# 排除本机
nft add rule ip mangle mihomo_prerouting ip saddr 192.168.6.7 return
nft add rule ip mangle mihomo_prerouting ip saddr 192.168.1.7 return

# 排除内网和保留地址
nft add rule ip mangle mihomo_prerouting ip daddr 192.168.0.0/16 return
nft add rule ip mangle mihomo_prerouting ip daddr 10.0.0.0/8 return
nft add rule ip mangle mihomo_prerouting ip daddr 127.0.0.0/8 return
nft add rule ip mangle mihomo_prerouting ip daddr 100.64.0.0/10 return
nft add rule ip mangle mihomo_prerouting ip daddr 224.0.0.0/4 return
nft add rule ip mangle mihomo_prerouting ip daddr 255.255.255.255 return

# 所有外网 TCP + UDP
nft add rule ip mangle mihomo_prerouting ip protocol tcp tproxy to :7892 meta mark set 0x000000de
nft add rule ip mangle mihomo_prerouting ip protocol udp tproxy to :7892 meta mark set 0x000000de
```

改完 Google、ChatGPT、AI Studio、Claude 全部恢复。

## 最终方案：规则绑定 Mihomo 生命周期

三次踩坑，每次持久化都出问题。最终方案是把 nftables 规则直接写在 Mihomo 的 OpenRC init 脚本里：

```bash
#!/sbin/openrc-run

name="mihomo"
description="Mihomo (Clash Meta) Proxy"
command="/usr/local/bin/mihomo"
command_args="-d /etc/mihomo"
command_background=true
pidfile="/run/${RC_SVCNAME}.pid"
output_log="/var/log/mihomo/mihomo.log"
error_log="/var/log/mihomo/mihomo.log"

depend() {
    need net
    after firewall
}

start_post() {
    # TProxy 路由：fwmark 0xde 的包走 table 100（本地回环）
    ip route replace local default dev lo table 100
    ip rule add fwmark 0xde lookup 100 2>/dev/null

    # mangle 表：TProxy 全外网流量
    nft flush chain ip mangle mihomo_prerouting 2>/dev/null
    nft add table ip mangle 2>/dev/null
    nft add chain ip mangle mihomo_prerouting \
      "{ type filter hook prerouting priority mangle; policy accept; }" 2>/dev/null

    nft add rule ip mangle mihomo_prerouting ip saddr 192.168.6.7 return
    nft add rule ip mangle mihomo_prerouting ip saddr 192.168.1.7 return
    nft add rule ip mangle mihomo_prerouting ip daddr 192.168.0.0/16 return
    nft add rule ip mangle mihomo_prerouting ip daddr 10.0.0.0/8 return
    nft add rule ip mangle mihomo_prerouting ip daddr 127.0.0.0/8 return
    nft add rule ip mangle mihomo_prerouting ip daddr 100.64.0.0/10 return
    nft add rule ip mangle mihomo_prerouting ip daddr 224.0.0.0/4 return
    nft add rule ip mangle mihomo_prerouting ip daddr 255.255.255.255 return
    nft add rule ip mangle mihomo_prerouting ip protocol tcp tproxy to :7892 meta mark set 0x000000de
    nft add rule ip mangle mihomo_prerouting ip protocol udp tproxy to :7892 meta mark set 0x000000de

    # nat 表：DNS 劫持
    nft flush chain ip nat mihomo_prerouting 2>/dev/null
    nft add table ip nat 2>/dev/null
    nft add chain ip nat mihomo_prerouting \
      "{ type nat hook prerouting priority filter - 1; policy accept; }" 2>/dev/null
    nft add rule ip nat mihomo_prerouting udp dport 53 redirect to :1053

    einfo "TProxy rules applied"
}

stop_post() {
    nft flush chain ip mangle mihomo_prerouting 2>/dev/null
    nft flush chain ip nat mihomo_prerouting 2>/dev/null
    ip rule del fwmark 0xde lookup 100 2>/dev/null
    einfo "TProxy rules cleaned"
}
```

Mihomo 启动 → 自动加规则。Mihomo 停止 → 自动清理。不再依赖单独的 nftables 持久化文件。

## NAT redirect vs TProxy

前两次用的是 NAT redirect，最终方案用 TProxy。区别：

| | NAT redirect | TProxy |
|---|---|---|
| 工作层 | nat 表 | mangle 表 |
| 原理 | 改写目标地址 | 不改包头，fwmark 路由到本地 |
| 性能 | 需要 conntrack | 无需 conntrack，更轻量 |
| UDP | 不友好 | 原生支持 |
| 额外配置 | 无 | ip rule + ip route table |

TProxy 更适合全流量透明代理，尤其是 UDP 场景。

## 三坑总结

| 坑 | 缺了什么 | 症状 | 根因 |
|---|---|---|---|
| 第一坑 | DNS 劫持（UDP 53 → 1053） | Claude 地区不可用 | DNS 泄露真实位置 |
| 第二坑 | TCP 重定向规则 | 全部连接超时 | fake-ip 地址无人处理 |
| 第三坑 | 全流量 TProxy（不止 fake-ip 段） | 全部连接超时 | DNS 不返回 fake-ip，规则只匹配 fake-ip 段 |

核心教训：

1. **DNS 必须显式劫持**——透明代理不会自动接管 UDP 53
2. **TCP 规则必须持久化**——跟代理服务绑定，别单独存文件
3. **不要假设 DNS 行为**——fake-ip 模式不保证所有查询都返回 fake-ip，TProxy 规则要兜底匹配所有外网流量

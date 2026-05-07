# Git 与代理说明

## 适用场景

当出现以下情况时，可以参考本说明：

1. 浏览器可以正常打开 GitHub。
2. `git push` 或 `git pull` 无法连接 GitHub。
3. 终端报错类似：

```text
Failed to connect to github.com port 443
```

这通常说明：

1. 浏览器已经走了代理。
2. 但 Git 命令行没有走代理。

## 本项目已验证的代理方式

当前机器环境中，已确认可用的是本地 SOCKS 代理：

1. 本地地址：`127.0.0.1`
2. 端口：`1099`
3. 协议：`socks5`

## 临时让 Git 走代理

在项目终端中执行：

```bash
git config --global http.proxy socks5://127.0.0.1:1099
git config --global https.proxy socks5://127.0.0.1:1099
```

然后再执行：

```bash
git push origin main
```

或：

```bash
git pull
```

## 检查 Git 当前代理配置

```bash
git config --global --get http.proxy
git config --global --get https.proxy
```

如果输出为：

```text
socks5://127.0.0.1:1099
```

说明 Git 当前已经配置为走本地代理。

## 使用完成后取消 Git 代理

如果不希望 Git 长期走代理，可以执行：

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

## 常见判断方法

### 浏览器能上 GitHub，但 Git push 失败

优先判断为：

1. Git 没走代理。

### `curl -I https://github.com` 成功，但 `git push` 失败

优先判断为：

1. Git 网络配置或代理配置问题。

### GitHub 仓库网页正常打开，但 Vercel 或 Git push 不稳定

优先检查：

1. 当前网络是否需要代理。
2. Git 是否已单独配置代理。

## 项目建议

本项目后续默认开发链路为：

1. 本地写代码。
2. Git 提交。
3. 必要时为 Git 打开代理。
4. 推送到 GitHub。
5. 由 Vercel 自动部署。
6. 手机通过 HTTPS 地址真机测试。

如果再次出现 Git 推送失败，优先先检查本说明中的代理配置，而不是怀疑仓库本身异常。

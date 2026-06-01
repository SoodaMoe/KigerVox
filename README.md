<p align="center">
  <img src="logo.svg" alt="KigerVox" width="160" height="160">
</p>

<h1 align="center">KigerVox</h1>

<p align="center">一款面向 Kiger 群体的微信小程序文字转语音工具。</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-WeChat%20Mini%20Program-07C160" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/python-3.12-blue" alt="Python">
</p>

---

## 功能

- **一键播报**：点击首页按钮，即可以语音读出按钮上的文字，同时全屏展示文字内容
- **多种语音源**：支持三种模式切换
  - 默认服务器模式 —— 无需配置，开箱即用
  - 腾讯云 / 阿里云 —— 填写自带 API 密钥，自由选择音色
  - 自定义 HTTP 接口 —— 通过服务器代理，连接任意 TTS 服务
- **智能缓存**：客户端与服务端双重缓存，相同文字只合成一次，大幅节省 API 调用量
- **静音模式**：长按按钮切换静音，点击仅显示文字不播报
- **图片按钮**：长按选图，短按查看，方便辅助交流
- **自定义界面**：长按标题可修改首页文字

## 架构

<p align="center">
  <img src="docs/architecture.svg" alt="Architecture" width="100%">
</p>

- 小程序端：纯 JS 实现 TC3/AKP 签名、HMAC 算法，不依赖任何第三方库
- 服务端：Python 3.12 标准库，零第三方依赖，ffmpeg 转码 AAC 压缩
- 缓存：客户端 SHA256 内容寻址 + 服务端全局共享缓存，LRU 淘汰

## 快速开始

### 小程序端

1. 克隆仓库，用微信开发者工具导入项目
2. 在开发者工具中填入你自己的 AppID
3. 编译运行

### 服务端

```bash
cd server_files
# 编辑 server.py，填入腾讯云 SECRET_ID 和 SECRET_KEY
apt install -y ffmpeg
python3 server.py          # 默认监听 53824 端口
```

或使用 systemd：

```bash
cp kigervox.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kigervox
```

### 域名与 HTTPS

小程序要求 HTTPS。推荐 nginx 反向代理 + Let's Encrypt 证书：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:53824;
        proxy_set_header Host $host;
    }
}
```

参考 `server_files/nginx-kiger.conf` 获取完整配置。

## 项目结构

```
KigerVox/
├── pages/
│   ├── index/              # 首页（按钮管理、TTS 播放、图片按钮）
│   └── settings/           # 设置页（供应商切换、API 配置、缓存管理）
├── utils/
│   ├── tts.js              # TTS 引擎（多供应商分发、本地缓存）
│   ├── crypto.js           # SHA256 / SHA1 / HMAC（纯 JS）
│   └── cache.js            # 客户端音频缓存
├── server_files/
│   ├── server.py           # Python 服务端（缓存代理 + 默认 TTS）
│   ├── kigervox.service    # systemd 服务文件
│   └── nginx-kiger.conf    # nginx 配置参考
├── app.js                  # 小程序入口
├── app.json                # 全局配置
├── logo.svg                # Logo
├── PUBLISH_GUIDE.md        # 发布指南（含匿名发布说明）
└── README.md
```

## API

服务端提供两个端点：

| 端点 | 说明 | 缓存 |
|------|------|:---:|
| `POST /api/tts` | 调用腾讯云 TTS 合成语音 | ✅ 服务端缓存 |
| `POST /api/proxy-tts` | 代理转发到用户自定义 TTS 服务 | ❌ 不缓存 |
| `GET /api/stats` | 返回缓存统计信息 | - |

## License

MIT

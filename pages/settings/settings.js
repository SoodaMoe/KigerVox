var tts = require('../../utils/tts.js')
var crypto = require('../../utils/crypto.js')
var cache = require('../../utils/cache.js')

Page({
  data: {
    provider: 'server',
    providerIndex: 0,
    providers: ['默认（免配置）', '腾讯云 TTS', '阿里云 TTS', 'GPT-SoVITS'],

    // Server
    serverUrl: '',

    // Tencent
    secretId: '', secretKey: '', showKey: false,
    tcVoice: '101026', tcVoiceIndex: 0, tcVoiceList: tts.tencentVoices,

    // Alibaba
    aliKeyId: '', aliKeySecret: '', aliAppKey: '', showAliKey: false,
    aliVoice: 'xiaoyun', aliVoiceIndex: 0, aliVoiceList: tts.aliyunVoices,

    // Common
    speed: tts.defaultSpeed,

    // GPT-SoVITS
    gsApiBase: '', gsRefAudioPath: '', gsPromptText: '',
    gsPromptLang: 'zh', gsTextLang: 'zh', gsMediaType: 'wav',

    // Cache
    cacheSize: '', cacheCount: 0,

    testing: false
  },

  onLoad() {
    crypto.selfTest()
    var c = tts.getConfig()
    var provIdx = this.providerToIndex(c.provider)
    this.setData({
      provider: c.provider || 'server', providerIndex: provIdx,
      serverUrl: c.serverUrl || tts.DEFAULT_SERVER_URL || '',
      secretId: c.secretId || '', secretKey: c.secretKey || '',
      tcVoice: String(c.tencentVoice || 101026), tcVoiceIndex: this.findVoice(c.tencentVoice || 101026, tts.tencentVoices),
      aliKeyId: c.aliAccessKeyId || '', aliKeySecret: c.aliAccessKeySecret || '', aliAppKey: c.aliAppKey || '',
      aliVoice: c.aliVoice || 'xiaoyun', aliVoiceIndex: this.findVoice(c.aliVoice || 'xiaoyun', tts.aliyunVoices),
      speed: c.speed != null ? c.speed : tts.defaultSpeed,
      gsApiBase: c.gsApiBase || '', gsRefAudioPath: c.gsRefAudioPath || '',
      gsPromptText: c.gsPromptText || '', gsPromptLang: c.gsPromptLang || 'zh',
      gsTextLang: c.gsTextLang || 'zh', gsMediaType: c.gsMediaType || 'wav'
    })
    this.refreshCacheStats()
  },

  onShow() { this.refreshCacheStats() },

  providerToIndex(p) {
    if (p === 'tencent') return 1
    if (p === 'aliyun') return 2
    if (p === 'gptsovits') return 3
    return 0 // server
  },

  findVoice(id, list) {
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return i
    }
    return 0
  },

  refreshCacheStats() {
    var s = cache.getStats()
    var text = s.total < 1048576
      ? (s.total / 1024).toFixed(1) + ' KB'
      : (s.total / 1048576).toFixed(1) + ' MB'
    this.setData({ cacheSize: text, cacheCount: s.count })
  },

  // ─── Provider ────────────────────────────────
  onProviderChange(e) {
    var idx = Number(e.detail.value)
    var p = idx === 0 ? 'server' : (idx === 1 ? 'tencent' : (idx === 2 ? 'aliyun' : 'gptsovits'))
    this.setData({ providerIndex: idx, provider: p })
  },

  // ─── Tencent ─────────────────────────────────
  onTcSecretId(e) { this.setData({ secretId: e.detail.value }) },
  onTcSecretKey(e) { this.setData({ secretKey: e.detail.value }) },
  onTcToggleKey() { this.setData({ showKey: !this.data.showKey }) },
  onTcVoiceChange(e) {
    var idx = Number(e.detail.value)
    this.setData({ tcVoiceIndex: idx, tcVoice: tts.tencentVoices[idx].id })
  },

  // ─── Alibaba ─────────────────────────────────
  onAliKeyId(e) { this.setData({ aliKeyId: e.detail.value }) },
  onAliKeySecret(e) { this.setData({ aliKeySecret: e.detail.value }) },
  onAliToggleKey() { this.setData({ showAliKey: !this.data.showAliKey }) },
  onAliAppKey(e) { this.setData({ aliAppKey: e.detail.value }) },
  onAliVoiceChange(e) {
    var idx = Number(e.detail.value)
    this.setData({ aliVoiceIndex: idx, aliVoice: tts.aliyunVoices[idx].id })
  },

  // ─── Common ──────────────────────────────────
  onSpeedChange(e) { this.setData({ speed: Number(e.detail.value) }) },

  // ─── GPT-SoVITS ───────────────────────────────
  onGsApiBase(e) { this.setData({ gsApiBase: e.detail.value }) },
  onGsRefAudioPath(e) { this.setData({ gsRefAudioPath: e.detail.value }) },
  onGsPromptText(e) { this.setData({ gsPromptText: e.detail.value }) },
  onGsPromptLang(e) {
    var langs = ['zh', 'en', 'ja']
    this.setData({ gsPromptLang: langs[Number(e.detail.value)] })
  },
  onGsTextLang(e) {
    var langs = ['zh', 'en', 'ja', 'auto']
    this.setData({ gsTextLang: langs[Number(e.detail.value)] })
  },
  onGsMediaType(e) {
    var types = ['wav', 'mp3', 'ogg', 'aac']
    this.setData({ gsMediaType: types[Number(e.detail.value)] })
  },

  // ─── Save ────────────────────────────────────
  onSave() {
    if (this.data.provider === 'server') {
      // server mode: no required fields
    } else if (this.data.provider === 'tencent') {
      if (!this.data.secretId.trim()) { wx.showToast({ title: '请输入 SecretId', icon: 'none' }); return }
      if (!this.data.secretKey.trim()) { wx.showToast({ title: '请输入 SecretKey', icon: 'none' }); return }
    } else if (this.data.provider === 'aliyun') {
      if (!this.data.aliKeyId.trim()) { wx.showToast({ title: '请输入 AccessKey ID', icon: 'none' }); return }
      if (!this.data.aliKeySecret.trim()) { wx.showToast({ title: '请输入 AccessKey Secret', icon: 'none' }); return }
      if (!this.data.aliAppKey.trim()) { wx.showToast({ title: '请输入 AppKey', icon: 'none' }); return }
    } else {
      if (!this.data.gsApiBase.trim()) { wx.showToast({ title: '请输入 API 地址', icon: 'none' }); return }
    }

    tts.saveConfig({
      provider: this.data.provider,
      serverUrl: this.data.serverUrl || tts.DEFAULT_SERVER_URL,
      secretId: this.data.secretId.trim(), secretKey: this.data.secretKey.trim(),
      tencentVoice: Number(this.data.tcVoice),
      aliAccessKeyId: this.data.aliKeyId.trim(), aliAccessKeySecret: this.data.aliKeySecret.trim(),
      aliAppKey: this.data.aliAppKey.trim(), aliVoice: this.data.aliVoice,
      speed: this.data.speed,
      gsApiBase: this.data.gsApiBase.trim(),
      gsTextLang: this.data.gsTextLang, gsMediaType: this.data.gsMediaType
    })

    wx.showToast({ title: '保存成功', icon: 'success' })
  },

  // ─── Test ────────────────────────────────────
  onTest() {
    var self = this, p = this.data.provider
    if (p === 'server') {
      // no validation needed
    } else if (p === 'tencent') {
      if (!this.data.secretId.trim() || !this.data.secretKey.trim()) { wx.showToast({ title: '请先填写 API 密钥', icon: 'none' }); return }
    } else if (p === 'aliyun') {
      if (!this.data.aliKeyId.trim() || !this.data.aliKeySecret.trim() || !this.data.aliAppKey.trim()) {
        wx.showToast({ title: '请先填写阿里云 API 密钥和 AppKey', icon: 'none' }); return
      }
    } else {
      if (!this.data.gsApiBase.trim()) { wx.showToast({ title: '请先填写 API 地址', icon: 'none' }); return }
    }

    this.setData({ testing: true })

    tts.textToSpeech('你好，欢迎使用KigerVox！', {
      provider: p,
      voiceType: p === 'aliyun' ? this.data.aliVoice : (p === 'tencent' ? Number(this.data.tcVoice) : ''),
      speed: this.data.speed
    }).then(function(fp) {
      self.setData({ testing: false })
      var a = wx.createInnerAudioContext()
      a.src = fp; a.onEnded(function() { a.destroy() })
      a.onError(function() { a.destroy(); wx.showToast({ title: '播放失败', icon: 'none' }) })
      a.play()
      wx.showToast({ title: '测试播放中', icon: 'success' })
      self.refreshCacheStats()
    }).catch(function(err) {
      self.setData({ testing: false })
      wx.showModal({ title: '测试失败', content: err.message || '未知错误', showCancel: false })
    })
  },

  // ─── Cache ────────────────────────────────────
  onClearCache() {
    var self = this
    wx.showModal({
      title: '清除缓存',
      content: '将删除所有 ' + this.data.cacheCount + ' 个本地缓存的音频文件，确认？',
      success: function(res) {
        if (res.confirm) {
          cache.clearAll().then(function() {
            wx.showToast({ title: '缓存已清除', icon: 'success' })
            self.refreshCacheStats()
          })
        }
      }
    })
  },

  // ─── Links ────────────────────────────────────
  onOpenTencentConsole() {
    wx.setClipboardData({ data: 'https://console.cloud.tencent.com/tts',
      success: function() { wx.showToast({ title: '链接已复制', icon: 'none' }) } })
  },

  onOpenAliyunConsole() {
    wx.setClipboardData({ data: 'https://nls.console.aliyun.com/',
      success: function() { wx.showToast({ title: '链接已复制', icon: 'none' }) } })
  }
})

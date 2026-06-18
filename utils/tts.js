var crypto = require('./crypto.js')
var cache = require('./cache.js')

var VOLUME = 5  // hardcoded, not user-configurable

var DEFAULT_SERVER_URL = 'https://kiger.sooda.moe'

// ─── Config ───────────────────────────────────────────────
function defaultConfig() {
  return {
    provider: 'server',
    // Server
    serverUrl: DEFAULT_SERVER_URL,
    // Tencent
    secretId: '', secretKey: '', tencentVoice: 101026,
    // Alibaba
    aliAccessKeyId: '', aliAccessKeySecret: '', aliAppKey: '', aliVoice: 'xiaoyun',
    // Common
    speed: 0,
    // GPT-SoVITS
    gsApiBase: '', gsRefAudioPath: '', gsPromptText: '',
    gsPromptLang: 'zh', gsTextLang: 'zh', gsMediaType: 'wav'
  }
}

function getConfig() {
  var c = wx.getStorageSync('ttsConfig')
  if (!c || !c.provider) return defaultConfig()
  c.provider = c.provider || 'server'
  c.speed = c.speed != null ? c.speed : 0
  c.serverUrl = c.serverUrl || DEFAULT_SERVER_URL
  // migrate legacy keys
  if (c.provider === 'custom') c.provider = 'gptsovits'
  if (!c.tencentVoice && c.voiceType) c.tencentVoice = c.voiceType
  if (!c.aliAccessKeyId) c.aliAccessKeyId = ''
  if (!c.aliAccessKeySecret) c.aliAccessKeySecret = ''
  if (!c.aliAppKey) c.aliAppKey = ''
  if (!c.aliVoice) c.aliVoice = 'xiaoyun'
  if (!c.gsApiBase) c.gsApiBase = ''
  if (!c.gsRefAudioPath) c.gsRefAudioPath = ''
  if (!c.gsPromptText) c.gsPromptText = ''
  if (!c.gsPromptLang) c.gsPromptLang = 'zh'
  if (!c.gsTextLang) c.gsTextLang = 'zh'
  if (!c.gsMediaType) c.gsMediaType = 'wav'
  return c
}

function saveConfig(c) { wx.setStorageSync('ttsConfig', c) }

// ─── Dispatch ─────────────────────────────────────────────
function textToSpeech(text, options) {
  var config = getConfig()
  var provider = options && options.provider || config.provider

  var voice, speed
  if (provider === 'aliyun') {
    voice = (options && options.voiceType) || config.aliVoice || 'xiaoyun'
  } else if (provider === 'server') {
    voice = (options && options.voiceType) || '101026'
  } else if (provider === 'gptsovits') {
    voice = (options && options.voiceType) || config.gsRefAudioPath || ''
  } else {
    voice = (options && options.voiceType) || String(config.tencentVoice || 101026)
  }
  speed = (options && options.speed != null) ? options.speed : config.speed

  var hash = cache.calcHash(provider, String(voice), String(speed), text)

  return cache.get(hash).catch(function () {
    var task
    if (provider === 'tencent')  task = textToSpeechTencent(text, config, options, voice, speed)
    else if (provider === 'aliyun')   task = textToSpeechAliyun(text, config, options, voice, speed)
    else if (provider === 'gptsovits') task = textToSpeechGptSovits(text, config, options, voice, speed)
    else if (provider === 'server')   task = textToSpeechServer(text, config, options, voice, speed)
    else return Promise.reject(new Error('未知供应商: ' + provider))

    return task.then(function (tempPath) {
      return cache.put(hash, tempPath, text, String(voice), String(speed))
    })
  })
}

// ═══════════════════ Server Mode ═══════════════════════════
function textToSpeechServer(text, config, options, voice, speed) {
  return new Promise(function (resolve, reject) {
    var serverUrl = config.serverUrl || DEFAULT_SERVER_URL
    if (!serverUrl) {
      reject(new Error('服务器地址未配置，请联系开发者')); return
    }

    wx.request({
      url: serverUrl + '/api/tts',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { text: text, voice: String(voice), speed: Number(speed) },
      responseType: 'arraybuffer',
      success: function (res) {
        if (res.statusCode === 200) {
          var fp = wx.env.USER_DATA_PATH + '/tts_' + Date.now() + '.mp3'
          wx.getFileSystemManager().writeFile({
            filePath: fp, data: res.data,
            success: function () { resolve(fp) },
            fail: function (err) { reject(new Error('保存失败: ' + err.errMsg)) }
          })
        } else {
          try {
            var err = JSON.parse(buf2str(res.data))
            reject(new Error(err.error || '服务器错误 HTTP ' + res.statusCode))
          } catch (e) { reject(new Error('服务器错误: HTTP ' + res.statusCode)) }
        }
      },
      fail: function (err) { reject(new Error('服务器连接失败: ' + err.errMsg)) }
    })
  })
}

// ═══════════════════ Tencent Cloud ═════════════════════════
function textToSpeechTencent(text, config, options, voice, speed) {
  return new Promise(function(resolve, reject) {
    if (!config.secretId || !config.secretKey) {
      reject(new Error('请先设置腾讯云 API 密钥')); return
    }
    var voiceType = voice || config.tencentVoice || 101026

    var payload = JSON.stringify({
      Text: text, SessionId: uuid(),
      VoiceType: Number(voiceType), Codec: 'mp3',
      Speed: Number(speed), Volume: VOLUME
    })

    var timestamp = Math.floor(Date.now() / 1000).toString()
    var date = fmtDate(new Date())
    var service = 'tts', endpoint = 'tts.tencentcloudapi.com'

    var cr = 'POST\n/\n\ncontent-type:application/json\nhost:' + endpoint + '\n\ncontent-type;host\n' + crypto.sha256(payload)
    var cs = date + '/' + service + '/tc3_request'
    var sts = 'TC3-HMAC-SHA256\n' + timestamp + '\n' + cs + '\n' + crypto.sha256(cr)

    var kd = crypto.hmacSha256('TC3' + config.secretKey, date)
    var ks = crypto.hmacSha256(crypto.hexToBytes(kd), service)
    var ksign = crypto.hmacSha256(crypto.hexToBytes(ks), 'tc3_request')
    var sig = crypto.hmacSha256(crypto.hexToBytes(ksign), sts)

    var auth = 'TC3-HMAC-SHA256 Credential=' + config.secretId + '/' + cs +
               ', SignedHeaders=content-type;host, Signature=' + sig

    wx.request({
      url: 'https://' + endpoint, method: 'POST',
      header: { 'Content-Type': 'application/json', 'Host': endpoint,
                'X-TC-Action': 'TextToVoice', 'X-TC-Version': '2019-08-23',
                'X-TC-Timestamp': timestamp, 'Authorization': auth },
      data: payload, responseType: 'arraybuffer',
      success: function(res) {
        if (res.statusCode === 200) {
          var resp = JSON.parse(buf2str(res.data))
          if (resp.Response.Error) { reject(new Error(resp.Response.Error.Message)); return }
          if (resp.Response.Audio) {
            writeTemp(wx.base64ToArrayBuffer(resp.Response.Audio)).then(resolve).catch(reject)
          } else { reject(new Error('未返回音频数据')) }
        } else { reject(new Error('请求失败: HTTP ' + res.statusCode)) }
      },
      fail: function(err) { reject(new Error('网络请求失败: ' + err.errMsg)) }
    })
  })
}

// ═══════════════════ Alibaba Cloud ═════════════════════════
var aliTokenCache = { token: '', expireAt: 0 }

function getAliToken(config) {
  return new Promise(function(resolve, reject) {
    if (!config.aliAccessKeyId || !config.aliAccessKeySecret) {
      reject(new Error('请先设置阿里云 AccessKey')); return
    }
    if (aliTokenCache.token && Date.now() < aliTokenCache.expireAt - 60000) {
      resolve(aliTokenCache.token); return
    }

    var params = {
      AccessKeyId: config.aliAccessKeyId,
      Action: 'CreateToken',
      Format: 'JSON',
      RegionId: 'cn-shanghai',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: uuid(),
      SignatureVersion: '1.0',
      Timestamp: fmtISO(new Date()),
      Version: '2019-02-28'
    }

    var keys = Object.keys(params).sort()
    var qs = ''
    for (var i = 0; i < keys.length; i++) {
      if (i > 0) qs += '&'
      qs += encodeURIComponent(keys[i]) + '=' + encodeURIComponent(params[keys[i]])
    }

    var sts = 'GET&' + encodeURIComponent('/') + '&' + encodeURIComponent(qs)
    var sig = crypto.base64FromHex(crypto.hmacSha1(config.aliAccessKeySecret + '&', sts))
    var finalUrl = 'https://nls-meta.cn-shanghai.aliyuncs.com/?' + qs + '&Signature=' + encodeURIComponent(sig)

    wx.request({
      url: finalUrl, method: 'GET',
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.Token) {
          aliTokenCache.token = res.data.Token.Id
          aliTokenCache.expireAt = res.data.Token.ExpireTime * 1000
          resolve(aliTokenCache.token)
        } else {
          reject(new Error('获取Token失败: ' + (res.data && res.data.Message || '未知错误')))
        }
      },
      fail: function(err) { reject(new Error('获取Token网络失败: ' + err.errMsg)) }
    })
  })
}

function textToSpeechAliyun(text, config, options, voice, speed) {
  return new Promise(function(resolve, reject) {
    getAliToken(config).then(function(token) {
      if (!config.aliAppKey) { reject(new Error('请先设置阿里云 AppKey')); return }

      wx.request({
        url: 'https://nls-meta.cn-shanghai.aliyuncs.com/stream/v1/tts',
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        data: JSON.stringify({
          appkey: config.aliAppKey,
          text: text,
          voice: voice,
          format: 'mp3',
          sample_rate: 16000,
          volume: VOLUME * 10,
          speech_rate: speed * 50,
          pitch_rate: 0
        }),
        responseType: 'arraybuffer',
        success: function(res) {
          if (res.statusCode === 200) {
            writeTemp(res.data).then(resolve).catch(reject)
          } else {
            try {
              var err = JSON.parse(buf2str(res.data))
              reject(new Error(err.Message || err.message || '请求失败 HTTP ' + res.statusCode))
            } catch(e) {
              reject(new Error('请求失败: HTTP ' + res.statusCode))
            }
          }
        },
        fail: function(err) { reject(new Error('网络请求失败: ' + err.errMsg)) }
      })
    }).catch(reject)
  })
}

// ═══════════════════ GPT-SoVITS (via server proxy) ══════════
function textToSpeechGptSovits(text, config, options, voice, speed) {
  return new Promise(function(resolve, reject) {
    var apiBase = config.gsApiBase || ''
    if (!apiBase) {
      reject(new Error('请先设置 GPT-SoVITS API 地址')); return
    }
    var serverUrl = config.serverUrl || DEFAULT_SERVER_URL
    if (!serverUrl) {
      reject(new Error('服务器地址未配置')); return
    }

    // GPT-SoVITS native API root, POST with JSON body
    var targetUrl = apiBase.replace(/\/$/, '')

    var gsBody = JSON.stringify({
      text: text,
      text_language: config.gsTextLang || 'zh',
      speed_factor: 1.0 + speed * 0.5
    })

    wx.request({
      url: serverUrl + '/api/proxy-tts',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { url: targetUrl, method: 'POST', headers: {}, body: gsBody },
      responseType: 'arraybuffer',
      success: function(res) {
        if (res.statusCode === 200) {
          writeTemp(res.data).then(resolve).catch(reject)
        } else {
          try {
            var err = JSON.parse(buf2str(res.data))
            reject(new Error(err.error || 'GPT-SoVITS 请求失败 HTTP ' + res.statusCode))
          } catch(e) { reject(new Error('GPT-SoVITS 请求失败: HTTP ' + res.statusCode)) }
        }
      },
      fail: function(err) { reject(new Error('服务器连接失败: ' + err.errMsg + '\n\n[诊断] GPT-SoVITS → ' + targetUrl)) }
    })
  })
}

// ─── Helpers ──────────────────────────────────────────────
function writeTemp(buf) {
  return new Promise(function(resolve, reject) {
    var fp = wx.env.USER_DATA_PATH + '/tts_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.mp3'
    wx.getFileSystemManager().writeFile({
      filePath: fp, data: buf,
      success: function() { resolve(fp) },
      fail: function(err) { reject(new Error('保存失败: ' + err.errMsg)) }
    })
  })
}

function uuid() {
  var s = ''; for (var i = 0; i < 36; i++) s += Math.floor(Math.random()*16).toString(16)
  return s
}

function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate())
}

function fmtISO(d) {
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth()+1) + '-' + pad2(d.getUTCDate()) +
         'T' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + 'Z'
}

function pad2(n) { return n < 10 ? '0' + n : '' + n }

function buf2str(buf) { var a=new Uint8Array(buf),s=''; for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]); return s }

function jsonEsc(s) { return s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t') }

module.exports = {
  textToSpeech: textToSpeech, getConfig: getConfig, saveConfig: saveConfig,
  tencentVoices: [
    { id: '101026', name: '智希（通用女声）' },
    { id: '101027', name: '智梅（通用女声）' },
    { id: '101055', name: '智付（通用女声）' },
    { id: '101001', name: '智瑜（情感女声）' },
    { id: '101011', name: '智燕（新闻女声）' },
    { id: '101019', name: '智彤（粤语女声）' },
    { id: '101016', name: '智甜（女童声）' }
  ],
  aliyunVoices: [
    { id: 'xiaoyun', name: '小云（标准女声）' },
    { id: 'ruoxi', name: '若兮（温柔女声）' },
    { id: 'sijia', name: '思佳（标准女声）' },
    { id: 'sijing', name: '思婧（标准女声）' },
    { id: 'xiaomeng', name: '小萌（年轻女声）' }
  ],
  defaultSpeed: 0,
  DEFAULT_SERVER_URL: DEFAULT_SERVER_URL
}

/**
 * Local TTS audio cache with LRU eviction.
 * Cache key = SHA256(provider|voice|speed|text) first 16 chars
 */
var crypto = require('./crypto.js')

var PREFIX = 'ttscache_'
var MAX_SIZE_DEFAULT = 30 * 1024 * 1024 // 30MB

function calcHash(provider, voice, speed, text) {
  return crypto.sha256(provider + '|' + voice + '|' + speed + '|' + text).substring(0, 16)
}

function cachePath(hash) {
  return wx.env.USER_DATA_PATH + '/' + PREFIX + hash + '.mp3'
}

function getIndex() {
  try { return wx.getStorageSync('ttsCacheIndex') || {} } catch (e) { return {} }
}

function saveIndex(idx) {
  try { wx.setStorageSync('ttsCacheIndex', idx) } catch (e) {}
}

function getMaxSize() {
  try { return wx.getStorageSync('ttsCacheMaxSize') || MAX_SIZE_DEFAULT } catch (e) { return MAX_SIZE_DEFAULT }
}

// ─── check if cached file exists ────────────────────────
function exists(hash) {
  return new Promise(function (resolve) {
    wx.getFileSystemManager().access({
      path: cachePath(hash),
      success: function () { resolve(true) },
      fail: function () { resolve(false) }
    })
  })
}

// ─── put temp file into cache ───────────────────────────
function put(hash, tempPath, text, voice, speed) {
  return new Promise(function (resolve, reject) {
    var dest = cachePath(hash)
    wx.getFileSystemManager().copyFile({
      srcPath: tempPath, destPath: dest,
      success: function () {
        try {
          var stat = wx.getFileSystemManager().statSync(dest)
          var idx = getIndex()
          idx[hash] = { t: text, v: voice, s: speed, time: Date.now(), size: stat.size }
          saveIndex(idx)
          evict()
          // clean up temp
          try { wx.getFileSystemManager().unlinkSync(tempPath) } catch (e) {}
          resolve(dest)
        } catch (e) { resolve(dest) }
      },
      fail: function (err) {
        // if copy fails, just return the temp file
        resolve(tempPath)
      }
    })
  })
}

// ─── try to get cached file ─────────────────────────────
function get(hash) {
  return new Promise(function (resolve, reject) {
    var fp = cachePath(hash)
    wx.getFileSystemManager().access({
      path: fp,
      success: function () {
        // update access time for LRU
        try {
          var idx = getIndex()
          if (idx[hash]) { idx[hash].time = Date.now(); saveIndex(idx) }
        } catch (e) {}
        resolve(fp)
      },
      fail: function () { reject(new Error('cache miss')) }
    })
  })
}

// ─── LRU eviction ───────────────────────────────────────
function evict() {
  var idx = getIndex()
  var totalSize = 0
  var entries = []
  for (var k in idx) {
    totalSize += idx[k].size || 0
    entries.push({ key: k, time: idx[k].time || 0, size: idx[k].size || 0 })
  }

  var maxSize = getMaxSize()
  if (totalSize <= maxSize) return

  entries.sort(function (a, b) { return a.time - b.time })

  var fs = wx.getFileSystemManager()
  for (var i = 0; i < entries.length && totalSize > maxSize; i++) {
    try { fs.unlinkSync(cachePath(entries[i].key)) } catch (e) {}
    delete idx[entries[i].key]
    totalSize -= entries[i].size
  }
  saveIndex(idx)
}

// ─── stats ──────────────────────────────────────────────
function getStats() {
  var idx = getIndex()
  var total = 0, count = 0
  for (var k in idx) { total += idx[k].size || 0; count++ }
  return { total: total, count: count }
}

// ─── clear all ──────────────────────────────────────────
function clearAll() {
  return new Promise(function (resolve) {
    var idx = getIndex()
    var fs = wx.getFileSystemManager()
    var keys = Object.keys(idx)
    var deleted = 0
    function delNext() {
      if (deleted >= keys.length) { saveIndex({}); resolve(); return }
      try {
        fs.unlink({ filePath: cachePath(keys[deleted]), success: function () { deleted++; delNext() }, fail: function () { deleted++; delNext() } })
      } catch (e) { deleted++; delNext() }
    }
    if (keys.length === 0) { resolve(); return }
    delNext()
  })
}

// ─── set max cache size ─────────────────────────────────
function setMaxSize(bytes) {
  wx.setStorageSync('ttsCacheMaxSize', bytes)
  evict()
}

module.exports = {
  calcHash: calcHash,
  exists: exists,
  get: get,
  put: put,
  getStats: getStats,
  clearAll: clearAll,
  getMaxSize: getMaxSize,
  setMaxSize: setMaxSize
}

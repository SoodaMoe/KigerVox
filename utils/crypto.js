/**
 * Pure-JS SHA256, SHA1 + HMAC for WeChat Mini Program.
 * Used for Tencent Cloud (SHA256) and Alibaba Cloud (SHA1) API signing.
 */

// ─── Shared helpers ──────────────────────────────────────
function pad2(s) { s = String(s); return s.length === 1 ? '0' + s : s }
function rotr(x, n) { return (x >>> n) | (x << (32 - n)) }
function rotl(x, n) { return (x << n) | (x >>> (32 - n)) }

function bytesToWords(b, off) {
  return ((b[off] << 24) | (b[off+1] << 16) | (b[off+2] << 8) | b[off+3]) >>> 0
}

function wordsToHex(w) {
  return pad2(((w>>>24)&0xff).toString(16)) +
         pad2(((w>>>16)&0xff).toString(16)) +
         pad2(((w>>>8)&0xff).toString(16)) +
         pad2((w&0xff).toString(16))
}

function utf8ToBytes(str) {
  var bytes = [], i, c
  for (i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    if (c < 128) { bytes.push(c) }
    else if (c < 2048) { bytes.push(192 | (c>>6), 128 | (c&63)) }
    else if (c < 55296 || c > 57343) { bytes.push(224 | (c>>12), 128 | ((c>>6)&63), 128 | (c&63)) }
    else {
      i++; c = 65536 + (((c&1023)<<10) | (str.charCodeAt(i)&1023))
      bytes.push(240 | (c>>18), 128 | ((c>>12)&63), 128 | ((c>>6)&63), 128 | (c&63))
    }
  }
  return bytes
}

function hexToBytes(hex) {
  var bytes = [], i
  for (i = 0; i < hex.length; i += 2) { bytes.push(parseInt(hex.substring(i, i+2), 16)) }
  return bytes
}

// ─── SHA-256 ─────────────────────────────────────────────
var K256 = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]
var H2560 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]

function sha256(message) {
  var msg = typeof message === 'string' ? utf8ToBytes(message) : message.slice()
  var bitLen = msg.length * 8

  msg.push(0x80)
  while ((msg.length % 64) !== 56) { msg.push(0) }

  msg.push((bitLen/1099511627776)>>>0 & 0xff)
  msg.push((bitLen/4294967296)>>>0 & 0xff)
  msg.push((bitLen/16777216)>>>0 & 0xff)
  msg.push((bitLen/65536)>>>0 & 0xff)
  msg.push((bitLen>>>24)&0xff); msg.push((bitLen>>>16)&0xff)
  msg.push((bitLen>>>8)&0xff); msg.push(bitLen&0xff)

  var H = H2560.slice(), W = new Array(64), a,b,c,d,e,f,g,h, T1,T2, t, ch

  for (ch = 0; ch < msg.length; ch += 64) {
    for (t = 0; t < 16; t++) { W[t] = bytesToWords(msg, ch + t*4) }
    for (t = 16; t < 64; t++) {
      W[t] = ((rotr(W[t-15],7)^rotr(W[t-15],18)^(W[t-15]>>>3)) + W[t-7] +
              (rotr(W[t-2],17)^rotr(W[t-2],19)^(W[t-2]>>>10)) + W[t-16]) >>> 0
    }
    a=H[0];b=H[1];c=H[2];d=H[3];e=H[4];f=H[5];g=H[6];h=H[7]
    for (t = 0; t < 64; t++) {
      T1 = (h + (rotr(e,6)^rotr(e,11)^rotr(e,25)) + ((e&f)^(~e&g)) + K256[t] + W[t]) >>> 0
      T2 = ((rotr(a,2)^rotr(a,13)^rotr(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0
      h=g; g=f; f=e; e=(d+T1)>>>0; d=c; c=b; b=a; a=(T1+T2)>>>0
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0
  }

  var result = ''
  for (t = 0; t < 8; t++) { result += wordsToHex(H[t]) }
  return result
}

function hmacSha256(key, message) {
  return _hmac(sha256, 64, 32, key, message)
}

// ─── SHA-1 ───────────────────────────────────────────────
function sha1(message) {
  var msg = typeof message === 'string' ? utf8ToBytes(message) : message.slice()
  var bitLen = msg.length * 8

  msg.push(0x80)
  while ((msg.length % 64) !== 56) { msg.push(0) }

  msg.push((bitLen/1099511627776)>>>0 & 0xff)
  msg.push((bitLen/4294967296)>>>0 & 0xff)
  msg.push((bitLen/16777216)>>>0 & 0xff)
  msg.push((bitLen/65536)>>>0 & 0xff)
  msg.push((bitLen>>>24)&0xff); msg.push((bitLen>>>16)&0xff)
  msg.push((bitLen>>>8)&0xff); msg.push(bitLen&0xff)

  var H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  var W = new Array(80), a,b,c,d,e, T, t, ch

  for (ch = 0; ch < msg.length; ch += 64) {
    for (t = 0; t < 16; t++) { W[t] = bytesToWords(msg, ch + t*4) }
    for (t = 16; t < 80; t++) { W[t] = rotl(W[t-3]^W[t-8]^W[t-14]^W[t-16], 1) }

    a=H[0]; b=H[1]; c=H[2]; d=H[3]; e=H[4]

    for (t = 0; t < 80; t++) {
      if (t < 20) { T = (rotl(a,5) + ((b&c)^(~b&d)) + e + 0x5a827999 + W[t]) >>> 0 }
      else if (t < 40) { T = (rotl(a,5) + (b^c^d) + e + 0x6ed9eba1 + W[t]) >>> 0 }
      else if (t < 60) { T = (rotl(a,5) + ((b&c)^(b&d)^(c&d)) + e + 0x8f1bbcdc + W[t]) >>> 0 }
      else { T = (rotl(a,5) + (b^c^d) + e + 0xca62c1d6 + W[t]) >>> 0 }
      e=d; d=c; c=rotl(b,30); b=a; a=T
    }

    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0
  }

  var result = ''
  for (t = 0; t < 5; t++) { result += wordsToHex(H[t]) }
  return result
}

function hmacSha1(key, message) {
  return _hmac(sha1, 64, 20, key, message)
}

// ─── Generic HMAC ────────────────────────────────────────
function _hmac(hashFn, blockSize, outLen, key, message) {
  var keyBytes = typeof key === 'string' ? utf8ToBytes(key) : key.slice()
  if (keyBytes.length > blockSize) { keyBytes = hexToBytes(hashFn(keyBytes)) }
  while (keyBytes.length < blockSize) { keyBytes.push(0) }

  var oPad = [], iPad = [], i
  for (i = 0; i < blockSize; i++) { oPad.push(keyBytes[i] ^ 0x5c); iPad.push(keyBytes[i] ^ 0x36) }

  var msgBytes = typeof message === 'string' ? utf8ToBytes(message) : message.slice()
  return hashFn(oPad.concat(hexToBytes(hashFn(iPad.concat(msgBytes)))))
}

// ─── Base64 ──────────────────────────────────────────────
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
function bytesToBase64(bytes) {
  var result = '', i
  for (i = 0; i < bytes.length; i += 3) {
    var a = bytes[i], b = bytes[i+1], c = bytes[i+2]
    result += B64.charAt(a >> 2)
    result += B64.charAt(((a & 3) << 4) | (b >> 4))
    if (i + 1 < bytes.length) {
      result += B64.charAt(((b & 15) << 2) | (c >> 6))
      if (i + 2 < bytes.length) result += B64.charAt(c & 63)
      else result += '='
    } else {
      result += '=='
    }
  }
  return result
}

function base64FromHex(hex) {
  return bytesToBase64(hexToBytes(hex))
}

// ─── Self-test ───────────────────────────────────────────
function selfTest() {
  var t1 = sha256('hello')
  console.log('[crypto] SHA256(hello):', t1 === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', t1)

  var t2 = hmacSha256('key', 'The quick brown fox jumps over the lazy dog')
  console.log('[crypto] HMAC-SHA256:', t2 === 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8', t2)

  var t3 = sha1('abc')
  console.log('[crypto] SHA1(abc):', t3 === 'a9993e364706816aba3e25717850c26c9cd0d89d', t3)

  var t4 = hmacSha1('key', 'The quick brown fox jumps over the lazy dog')
  console.log('[crypto] HMAC-SHA1:', t4 === 'de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9', t4)
}

module.exports = {
  sha256: sha256, hmacSha256: hmacSha256,
  sha1: sha1, hmacSha1: hmacSha1,
  hexToBytes: hexToBytes, utf8ToBytes: utf8ToBytes,
  bytesToBase64: bytesToBase64, base64FromHex: base64FromHex,
  selfTest: selfTest
}

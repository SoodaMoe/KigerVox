const tts = require('../../utils/tts.js')
const app = getApp()

Page({
  data: {
    buttons: [],
    showModal: false,
    editingIndex: -1,
    editingText: '',
    speakingIndex: -1,
    showOverlay: false,
    overlayText: '',
    imgSrc: '',
    imgLabel: '',
    showImage: false,
    headerTitle: 'KigerVox',
    headerSubtitle: '点击按钮，用语音播放文字',
    guideStep: -1
  },

  audioCtx: null,

  onLoad() {
    this.loadButtons()
    this.loadImage()
    this.loadHeader()
    this.checkGuide()
    this.audioCtx = wx.createInnerAudioContext()
    this.audioCtx.onEnded(() => {
      this.setData({ speakingIndex: -1 })
    })
    this.audioCtx.onError(() => {
      this.setData({ speakingIndex: -1, showOverlay: false })
      wx.showToast({ title: '播放失败', icon: 'none' })
    })
  },

  onUnload() {
    if (this.audioCtx) {
      this.audioCtx.destroy()
      this.audioCtx = null
    }
  },

  loadButtons() {
    const buttons = wx.getStorageSync('buttons') || []
    this.setData({ buttons })
  },

  saveButtons() {
    wx.setStorageSync('buttons', this.data.buttons)
  },

  onAddButton() {
    const newButton = {
      id: app.generateId(),
      text: '新按钮'
    }
    const buttons = [...this.data.buttons, newButton]
    this.setData({ buttons })
    this.saveButtons()
    wx.showToast({ title: '已添加', icon: 'success', duration: 1000 })
  },

  onPlayText(e) {
    const { index } = e.currentTarget.dataset
    const button = this.data.buttons[index]
    if (!button || !button.text.trim()) {
      wx.showToast({ title: '按钮文字为空', icon: 'none' })
      return
    }

    if (this.data.speakingIndex === index) {
      return
    }

    this.setData({ speakingIndex: index, showOverlay: true, overlayText: button.text })

    if (button.silent) {
      return
    }

    tts.textToSpeech(button.text).then((audioPath) => {
      this.audioCtx.src = audioPath
      this.audioCtx.play()
    }).catch((err) => {
      console.error('TTS failed:', err)
      this.setData({ speakingIndex: -1, showOverlay: false })
      var msg = err.message || '语音合成失败，请重试'
      if (msg.indexOf('请先设置') !== -1) {
        wx.showModal({
          title: '未配置 API',
          content: msg,
          confirmText: '去设置',
          success: function(res) {
            if (res.confirm) {
              wx.navigateTo({ url: '/pages/settings/settings' })
            }
          }
        })
      } else {
        wx.showToast({ title: msg, icon: 'none' })
      }
    })
  },

  onEditButton(e) {
    const { index } = e.currentTarget.dataset
    const button = this.data.buttons[index]
    const silentLabel = button.silent ? '恢复播放' : '静音播放'

    wx.showActionSheet({
      itemList: ['编辑文字', silentLabel, '删除按钮'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.showEditModal(index, button.text)
        } else if (res.tapIndex === 1) {
          this.toggleSilent(index)
        } else if (res.tapIndex === 2) {
          this.deleteButton(index)
        }
      }
    })
  },

  showEditModal(index, text) {
    this.setData({
      showModal: true,
      editingIndex: index,
      editingText: text
    })
  },

  toggleSilent(index) {
    const buttons = [...this.data.buttons]
    buttons[index].silent = !buttons[index].silent
    this.setData({ buttons })
    this.saveButtons()
    wx.showToast({ title: buttons[index].silent ? '已切换为静音' : '已恢复播放', icon: 'none' })
  },

  deleteButton(index) {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个按钮吗？',
      success: (res) => {
        if (res.confirm) {
          const buttons = [...this.data.buttons]
          buttons.splice(index, 1)
          this.setData({ buttons })
          this.saveButtons()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  onTextInput(e) {
    this.setData({ editingText: e.detail.value })
  },

  onModalCancel() {
    this.setData({ showModal: false, editingIndex: -1, editingText: '' })
  },

  onModalConfirm() {
    const { editingIndex, editingText } = this.data
    if (editingIndex === -2) {
      var title = editingText.trim() || '文字转语音'
      this.setData({ headerTitle: title })
      wx.setStorageSync('headerTitle', title)
    } else if (editingIndex === -1) {
      this.saveImgLabel(editingText.trim())
    } else if (editingIndex >= 0 && editingText.trim()) {
      const buttons = [...this.data.buttons]
      buttons[editingIndex].text = editingText.trim()
      this.setData({ buttons })
      this.saveButtons()
    }
    this.setData({ showModal: false, editingIndex: -1, editingText: '' })
  },

  onOpenSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  // ─── Guide ─────────────────────────────────
  checkGuide() {
    var done = wx.getStorageSync('guideDone')
    if (!done) {
      this.setData({ guideStep: 0 })
    }
  },

  onGuideYes() {
    this.setData({ guideStep: 1 })
  },

  onGuideNo() {
    wx.setStorageSync('guideDone', true)
    this.setData({ guideStep: -1 })
  },

  onGuideNext() {
    var step = this.data.guideStep
    if (step >= 4) {
      wx.setStorageSync('guideDone', true)
      this.setData({ guideStep: -1 })
    } else {
      this.setData({ guideStep: step + 1 })
    }
  },

  // ─── Header ────────────────────────────────
  loadHeader() {
    var title = wx.getStorageSync('headerTitle') || 'KigerVox'
    this.setData({ headerTitle: title })
  },

  onHeaderLongPress() {
    var self = this
    wx.showActionSheet({
      itemList: ['修改标题'],
      success: function (res) {
        if (res.tapIndex === 0) {
          self.setData({
            showModal: true,
            editingIndex: -2,
            editingText: self.data.headerTitle
          })
        }
      }
    })
  },

  onOverlayTap() {
    if (this.audioCtx) {
      this.audioCtx.stop()
    }
    this.setData({ speakingIndex: -1, showOverlay: false })
  },

  // ─── Image button ──────────────────────────
  loadImage() {
    var src = wx.getStorageSync('imgSrc') || ''
    var label = wx.getStorageSync('imgLabel') || ''
    this.setData({ imgSrc: src, imgLabel: label })
  },

  saveImage(src) {
    this.setData({ imgSrc: src })
    wx.setStorageSync('imgSrc', src || '')
  },

  saveImgLabel(label) {
    this.setData({ imgLabel: label })
    wx.setStorageSync('imgLabel', label)
  },

  onImageTap() {
    if (!this.data.imgSrc) {
      wx.showToast({ title: '请先长按选择图片', icon: 'none' })
      return
    }
    this.setData({ showImage: true })
  },

  onImageLongPress() {
    var self = this
    var hasImg = !!self.data.imgSrc
    var items = hasImg ? ['修改文字', '更换图片'] : ['修改文字', '选择图片']
    wx.showActionSheet({
      itemList: items,
      success: function (res) {
        if (res.tapIndex === 0) {
          self.showImgLabelModal()
        } else if (res.tapIndex === 1) {
          self.pickImage()
        }
      }
    })
  },

  showImgLabelModal() {
    this.setData({
      showModal: true,
      editingIndex: -1,
      editingText: this.data.imgLabel || ''
    })
  },

  pickImage() {
    var self = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: function (res) {
        self.saveImage(res.tempFiles[0].tempFilePath)
        wx.showToast({ title: '图片已更新', icon: 'success' })
      }
    })
  },

  onImageClose() {
    this.setData({ showImage: false })
  },

  onImageChange() {
    var self = this
    wx.showActionSheet({
      itemList: ['修改文字', '更换图片'],
      success: function (res) {
        if (res.tapIndex === 0) {
          self.setData({ showImage: false })
          self.showImgLabelModal()
        } else if (res.tapIndex === 1) {
          self.pickImage()
        }
      }
    })
  }
})

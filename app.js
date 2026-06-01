App({
  onLaunch() {
    const buttons = wx.getStorageSync('buttons')
    if (!buttons || buttons.length === 0) {
      wx.setStorageSync('buttons', [
        { id: this.generateId(), text: '你好' },
        { id: this.generateId(), text: '谢谢' },
        { id: this.generateId(), text: '再见' },
        { id: this.generateId(), text: '我不方便说话' },
        { id: this.generateId(), text: '可以集邮吗' },
        { id: this.generateId(), text: '可以帮帮我吗' },
        { id: this.generateId(), text: '师傅您好，我的手机尾号是XXXX' },
        { id: this.generateId(), text: '师傅请您帮忙开门，我视野不好害怕撞到行人' }
      ])
    }
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }
})

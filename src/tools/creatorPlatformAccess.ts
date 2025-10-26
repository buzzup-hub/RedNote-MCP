import { Page } from 'playwright'
import logger from '../utils/logger'

/**
 * 创作者平台访问策略
 * 专门处理小红书创作者平台的登录跳转问题
 */
export class CreatorPlatformAccess {
  private page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * 访问创作者平台的完整策略
   */
  async accessCreatorPlatform(): Promise<boolean> {
    logger.info('Starting creator platform access strategy...')

    try {
      // 步骤1: 清理自动化痕迹
      await this.cleanAutomationTraces()

      // 步骤2: 建立正常用户会话
      await this.establishNormalUserSession()

      // 步骤3: 尝试访问创作者平台
      const success = await this.attemptCreatorPlatformAccess()

      if (success) {
        logger.info('Successfully accessed creator platform!')
        return true
      } else {
        logger.error('Failed to access creator platform')
        return false
      }
    } catch (error) {
      logger.error('Error in creator platform access:', error)
      return false
    }
  }

  /**
   * 清理自动化痕迹
   */
  private async cleanAutomationTraces(): Promise<void> {
    logger.info('Cleaning automation traces...')

    await this.page.evaluate(() => {
      // 删除所有常见的自动化检测标记
      const automationProperties = [
        '__nightmare',
        '_phantom',
        'callPhantom',
        '_selenium',
        'webdriver',
        '__driver_evaluate',
        '__webdriver_evaluate',
        '__selenium_evaluate',
        '__fxdriver_evaluate',
        '__driver_unwrapped',
        '__webdriver_unwrapped',
        '__selenium_unwrapped',
        '__fxdriver_unwrapped',
        'cdc_adoQpoasnfa76pfcZLmcfl_Array',
        'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
        'cdc_adoQpoasnfa76pfcZLmcfl_Symbol',
        '__webdriver_script_fn',
        '__webdriver_script_func',
        '__webdriver_script_eval',
        '$cdc_asdjflasutopfhvcZLmcfl_',
        '$chrome_asyncScriptInfo'
      ]

      automationProperties.forEach(prop => {
        delete (window as any)[prop]
        delete (document as any)[prop]
      })

      // 伪装navigator属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
      })

      // 添加更多真实的插件
      const realPlugins = [
        {
          name: 'Chrome PDF Plugin',
          description: 'Portable Document Format',
          filename: 'internal-pdf-viewer',
          length: 1
        },
        {
          name: 'Chrome PDF Viewer',
          description: 'Portable Document Format',
          filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
          length: 1
        },
        {
          name: 'Native Client',
          description: 'Native Client',
          filename: 'internal-nacl-plugin',
          length: 1
        },
        {
          name: 'WebKit built-in PDF',
          description: 'Portable Document Format',
          filename: 'WebKit built-in PDF',
          length: 1
        },
        {
          name: 'Microsoft Edge PDF Viewer',
          description: 'Portable Document Format',
          filename: 'edge-pdf-viewer',
          length: 1
        }
      ]

      Object.defineProperty(navigator, 'plugins', {
        get: () => realPlugins,
        configurable: true
      })

      // 模拟真实的MIME类型
      const mimeTypes = [
        {
          type: 'application/pdf',
          suffixes: 'pdf',
          description: 'Portable Document Format',
          enabledPlugin: realPlugins[0]
        },
        {
          type: 'application/x-google-chrome-pdf',
          suffixes: 'pdf',
          description: 'Portable Document Format',
          enabledPlugin: realPlugins[1]
        },
        {
          type: 'application/x-nacl',
          suffixes: 'nexe',
          description: 'Native Client Executable',
          enabledPlugin: realPlugins[2]
        },
        {
          type: 'application/x-pnacl',
          suffixes: 'pexe',
          description: 'Portable Native Client Executable',
          enabledPlugin: realPlugins[2]
        }
      ]

      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => mimeTypes,
        configurable: true
      })

      // 模拟真实的用户代理信息
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      Object.defineProperty(navigator, 'userAgent', {
        get: () => userAgent,
        configurable: true
      })

      // 模拟更多真实的硬件信息
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
        configurable: true
      })

      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: true
      })

      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0,
        configurable: true
      })

      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.',
        configurable: true
      })

      Object.defineProperty(navigator, 'vendorSub', {
        get: () => '',
        configurable: true
      })

      // 模拟真实的语言设置
      Object.defineProperty(navigator, 'language', {
        get: () => 'zh-CN',
        configurable: true
      })

      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en'],
        configurable: true
      })

      // 模拟真实的平台信息
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
        configurable: true
      })

      // 模拟真实的连接信息
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 100,
          downlink: 10,
          saveData: false
        }),
        configurable: true
      })

      // 伪装Chrome对象
      if ((window as any).chrome) {
        Object.defineProperty((window as any).chrome, 'runtime', {
          get: () => ({
            onConnect: undefined,
            onMessage: undefined,
            connect: undefined,
            sendMessage: undefined
          }),
          configurable: true
        })
      }

      // 隐藏自动化扩展和特征
      const originalQuery = window.navigator.permissions.query
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({
            state: 'granted',
            name: parameters.name,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false
          } as PermissionStatus) :
          originalQuery(parameters)
      )

      // 伪装getComputedStyle
      const originalGetComputedStyle = window.getComputedStyle
      window.getComputedStyle = function(...args: any[]) {
        const style = originalGetComputedStyle.apply(this, args)
        // 移除可能暴露自动化的样式
        delete style.getPropertyValue('display')
        return style
      }

      // 伪装Canvas指纹
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
      HTMLCanvasElement.prototype.toDataURL = function(...args: any[]) {
        // 添加一些随机噪声来避免Canvas指纹识别
        const context = this.getContext('2d')
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height)
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] += Math.random() * 0.1
            imageData.data[i + 1] += Math.random() * 0.1
            imageData.data[i + 2] += Math.random() * 0.1
          }
          context.putImageData(imageData, 0, 0)
        }
        return originalToDataURL.apply(this, args)
      }

      // 伪装WebGL指纹
      const originalGetParameter = WebGLRenderingContext.prototype.getParameter
      WebGLRenderingContext.prototype.getParameter = function(parameter: any) {
        if (parameter === 37445) {
          // UNMASKED_VENDOR_WEBGL
          return 'Intel Inc.'
        }
        if (parameter === 37446) {
          // UNMASKED_RENDERER_WEBGL
          return 'Intel(R) Iris(R) Xe Graphics'
        }
        return originalGetParameter.call(this, parameter)
      }

      // 添加一些随机延迟和事件监听器来模拟真实用户行为
      let mouseEvents = 0
      const addMouseEvents = () => {
        mouseEvents++
        if (mouseEvents > 10) return
        setTimeout(() => {
          const event = new MouseEvent('mousemove', {
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight,
            bubbles: true
          })
          window.dispatchEvent(event)
        }, Math.random() * 1000)
      }

      // 定期添加鼠标事件
      setInterval(addMouseEvents, 2000)
    })

    await this.page.waitForTimeout(2000)
  }

  /**
   * 建立正常用户会话
   */
  private async establishNormalUserSession(): Promise<void> {
    logger.info('Establishing normal user session...')

    // 首先访问小红书主页，模拟正常用户行为
    await this.page.goto('https://www.xiaohongshu.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })

    await this.page.waitForTimeout(3000)

    // 模拟人类浏览行为
    await this.simulateHumanBehavior()

    // 随机滚动
    await this.page.evaluate(() => {
      window.scrollBy(0, Math.random() * 500 + 100)
    })

    await this.page.waitForTimeout(2000)
  }

  /**
   * 模拟人类行为
   */
  private async simulateHumanBehavior(): Promise<void> {
    logger.info('Simulating human behavior...')

    await this.page.evaluate(() => {
      // 模拟复杂的鼠标移动轨迹
      const simulateMouseMovement = () => {
        const moves = []
        const startX = window.innerWidth / 2
        const startY = window.innerHeight / 2

        for (let i = 0; i < 5; i++) {
          moves.push({
            x: startX + (Math.random() - 0.5) * 200,
            y: startY + (Math.random() - 0.5) * 200,
            delay: Math.random() * 500 + 100
          })
        }

        moves.forEach((move, index) => {
          setTimeout(() => {
            const event = new MouseEvent('mousemove', {
              clientX: move.x,
              clientY: move.y,
              bubbles: true,
              cancelable: true
            })
            window.dispatchEvent(event)

            // 偶尔添加点击事件
            if (Math.random() > 0.7) {
              setTimeout(() => {
                const clickEvent = new MouseEvent('mousedown', {
                  clientX: move.x,
                  clientY: move.y,
                  bubbles: true,
                  button: 0
                })
                window.dispatchEvent(clickEvent)
              }, 50)
            }
          }, index * move.delay)
        })
      }

      // 模拟键盘输入
      const simulateKeyboard = () => {
        const keys = ['Tab', 'Shift', 'Control', 'Alt']
        const randomKey = keys[Math.floor(Math.random() * keys.length)]

        const downEvent = new KeyboardEvent('keydown', {
          key: randomKey,
          bubbles: true,
          cancelable: true
        })
        const upEvent = new KeyboardEvent('keyup', {
          key: randomKey,
          bubbles: true,
          cancelable: true
        })

        window.dispatchEvent(downEvent)
        setTimeout(() => window.dispatchEvent(upEvent), Math.random() * 100 + 50)
      }

      // 模拟滚动行为
      const simulateScroll = () => {
        const scrollTarget = Math.random() * document.body.scrollHeight
        window.scrollTo({
          top: scrollTarget,
          left: 0,
          behavior: 'smooth'
        })
      }

      // 模拟触摸事件（对于触摸屏设备）
      const simulateTouch = () => {
        if ('ontouchstart' in window) {
          const touchEvent = new TouchEvent('touchstart', {
            touches: [{
              clientX: Math.random() * window.innerWidth,
              clientY: Math.random() * window.innerHeight,
              identifier: 0
            }],
            bubbles: true
          })
          window.dispatchEvent(touchEvent)
        }
      }

      // 模拟焦点变化
      const simulateFocusChange = () => {
        const focusableElements = document.querySelectorAll('a, button, input, select, textarea, [tabindex]')
        if (focusableElements.length > 0) {
          const randomElement = focusableElements[Math.floor(Math.random() * focusableElements.length)]
          const focusEvent = new FocusEvent('focus', {
            bubbles: true,
            cancelable: true
          })
          randomElement.dispatchEvent(focusEvent)
        }
      }

      // 执行所有模拟行为
      simulateMouseMovement()

      setTimeout(() => simulateKeyboard(), Math.random() * 1000 + 500)
      setTimeout(() => simulateScroll(), Math.random() * 2000 + 1000)
      setTimeout(() => simulateTouch(), Math.random() * 1500 + 800)
      setTimeout(() => simulateFocusChange(), Math.random() * 2500 + 1200)
    })

    await this.page.waitForTimeout(3000)
  }

  /**
   * 尝试访问创作者平台
   */
  private async attemptCreatorPlatformAccess(): Promise<boolean> {
    logger.info('Attempting to access creator platform...')

    try {
      // 方法1: 直接访问创作者平台主页
      logger.info('Method 1: Direct access to creator homepage')
      await this.page.goto('https://creator.xiaohongshu.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      await this.page.waitForTimeout(5000)

      let currentUrl = this.page.url()
      logger.info(`Current URL after direct access: ${currentUrl}`)

      if (!currentUrl.includes('login')) {
        logger.info('Direct access successful, proceeding to publish page')
        return await this.navigateToPublishPage()
      }

      // 方法2: 如果需要登录，等待手动登录
      if (currentUrl.includes('login')) {
        logger.info('Login required, implementing manual login assist...')

        const loginSuccess = await this.waitForManualLogin()
        if (loginSuccess) {
          return await this.navigateToPublishPage()
        }
      }

      // 方法3: 尝试通过主站跳转
      logger.info('Method 3: Attempting access via main site navigation')
      return await this.accessViaMainSite()

    } catch (error) {
      logger.error('Error in creator platform access attempt:', error)
      return false
    }
  }

  /**
   * 等待手动登录
   */
  private async waitForManualLogin(): Promise<boolean> {
    logger.info('Waiting for manual login completion...')
    logger.info('Please complete the login process in the browser window.')

    let attempts = 0
    const maxAttempts = 180 // 3分钟

    while (attempts < maxAttempts) {
      await this.page.waitForTimeout(2000)
      attempts++

      const currentUrl = this.page.url()

      // 检查是否登录成功
      const isLoggedIn = !currentUrl.includes('login') &&
                        (currentUrl.includes('creator.xiaohongshu.com') ||
                         currentUrl.includes('publish') ||
                         !currentUrl.includes('xiaohongshu.com'))

      if (isLoggedIn) {
        logger.info('Manual login detected successfully!')
        await this.page.waitForTimeout(3000)
        return true
      }

      // 每30秒报告一次进度
      if (attempts % 15 === 0) {
        const remainingMinutes = Math.ceil((maxAttempts - attempts) * 2 / 60)
        logger.info(`Still waiting for login... (${remainingMinutes} minutes remaining)`)

        // 模拟一些用户行为，避免被检测为机器人
        await this.page.evaluate(() => {
          window.scrollBy(0, Math.random() * 50 - 25)
        })
      }
    }

    logger.error('Manual login timeout')
    return false
  }

  /**
   * 导航到发布页面
   */
  private async navigateToPublishPage(): Promise<boolean> {
    logger.info('Navigating to publish page...')

    try {
      await this.page.goto('https://creator.xiaohongshu.com/publish/publish', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      await this.page.waitForTimeout(5000)

      const finalUrl = this.page.url()
      logger.info(`Final URL: ${finalUrl}`)

      if (finalUrl.includes('login')) {
        logger.error('Still redirected to login page')
        return false
      }

      if (finalUrl.includes('publish')) {
        logger.info('Successfully reached publish page!')
        return true
      }

      logger.warn('Unexpected URL, but login seems successful')
      return true

    } catch (error) {
      logger.error('Error navigating to publish page:', error)
      return false
    }
  }

  /**
   * 通过主站访问创作者平台
   */
  private async accessViaMainSite(): Promise<boolean> {
    logger.info('Attempting access via main site navigation...')

    try {
      // 回到主站
      await this.page.goto('https://www.xiaohongshu.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      await this.page.waitForTimeout(3000)

      // 模拟查看一些内容
      await this.page.evaluate(() => {
        const links = document.querySelectorAll('a')
        if (links.length > 5) {
          const randomLink = links[Math.floor(Math.random() * Math.min(links.length, 10))]
          if (randomLink && randomLink.href) {
            console.log('Simulating click on:', randomLink.textContent)
          }
        }
      })

      await this.page.waitForTimeout(2000)

      // 尝试点击"发布"按钮来跳转到创作者中心
      const publishButtonClicked = await this.clickPublishButton()

      if (publishButtonClicked) {
        logger.info('Publish button clicked successfully, waiting for redirect...')
        await this.page.waitForTimeout(5000)

        const currentUrl = this.page.url()
        logger.info(`URL after clicking publish button: ${currentUrl}`)

        if (currentUrl.includes('creator.xiaohongshu.com')) {
          // 成功跳转到创作者中心
          return await this.navigateToPublishPage()
        } else if (currentUrl.includes('login')) {
          // 需要登录，等待手动登录
          logger.info('Login required after clicking publish button')
          const loginSuccess = await this.waitForManualLogin()
          if (loginSuccess) {
            return await this.navigateToPublishPage()
          }
        } else {
          logger.warn('Unexpected redirect, but might still work')
          return await this.navigateToPublishPage()
        }
      }

      // 如果找不到发布按钮，回退到直接访问创作者平台
      logger.warn('Could not find publish button, falling back to direct access')
      await this.page.goto('https://creator.xiaohongshu.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      await this.page.waitForTimeout(5000)

      const currentUrl = this.page.url()
      logger.info(`URL after direct access: ${currentUrl}`)

      if (!currentUrl.includes('login')) {
        return await this.navigateToPublishPage()
      }

      logger.error('Still redirected to login after all attempts')
      return false

    } catch (error) {
      logger.error('Error in main site navigation approach:', error)
      return false
    }
  }

  /**
   * 点击发布按钮
   */
  private async clickPublishButton(): Promise<boolean> {
    logger.info('Looking for publish button on main site...')

    try {
      // 等待页面加载完成
      await this.page.waitForSelector('body', { timeout: 10000 })

      // 常见的发布按钮选择器
      const publishButtonSelectors = [
        'button:has-text("发布")',
        'div:has-text("发布")',
        'a:has-text("发布")',
        '.publish-btn',
        'button[class*="publish"]',
        'div[class*="publish"]',
        'a[class*="publish"]',
        '[data-testid="publish-button"]',
        '.create-btn',
        'button:has-text("创作")',
        'div:has-text("创作")'
      ]

      for (const selector of publishButtonSelectors) {
        try {
          const elements = await this.page.$$(selector)

          for (const element of elements) {
            const isVisible = await element.isVisible()
            if (isVisible) {
              const text = await element.textContent()

              if (text && (text.includes('发布') || text.includes('创作'))) {
                logger.info(`Found publish button: "${text}" with selector: ${selector}`)

                // 滚动到元素位置
                await element.scrollIntoViewIfNeeded()
                await this.page.waitForTimeout(1000)

                // 点击元素
                await element.click()
                logger.info('Publish button clicked successfully')
                return true
              }
            }
          }
        } catch (error) {
          logger.debug(`Error with selector ${selector}:`, error)
          continue
        }
      }

      logger.warn('Could not find any publish button')
      return false

    } catch (error) {
      logger.error('Error clicking publish button:', error)
      return false
    }
  }
}
import { AuthManager } from '../auth/authManager'
import { Browser, Page } from 'playwright'
import logger from '../utils/logger'
import { GetNoteDetail, NoteDetail } from './noteDetail'
import { CreatorPlatformAccess } from './creatorPlatformAccess'

export interface Note {
  title: string
  content: string
  tags: string[]
  url: string
  author: string
  likes?: number
  collects?: number
  comments?: number
}

export interface Comment {
  author: string
  content: string
  likes: number
  time: string
}

export interface PublishResult {
  success: boolean
  message: string
  title?: string
  content?: string
  imageCount?: number
  tags?: string
  url?: string
}

export class RedNoteTools {
  private authManager: AuthManager
  private browser: Browser | null = null
  private page: Page | null = null

  // Rate limiting static variables
  private static lastRequestTime: number = 0
  private static requestCount: number = 0
  private static readonly MIN_INTERVAL = 10000 // 10 seconds minimum interval
  private static readonly MAX_REQUESTS_PER_HOUR = 20 // Maximum 20 requests per hour
  private static requestTimestamps: number[] = []

  // Content cache
  private contentCache = new Map<string, { data: any, timestamp: number }>()
  private readonly CACHE_TTL = 30 * 60 * 1000 // 30 minutes

  constructor() {
    logger.info('Initializing RedNoteTools')
    this.authManager = new AuthManager()
  }

  /**
   * Retry mechanism with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        logger.error(`${operationName} attempt ${attempt}/${maxRetries} failed:`, error)

        if (attempt === maxRetries) {
          logger.error(`${operationName} failed after ${maxRetries} attempts`)
          throw error
        }

        // 指数退避: 2^attempt * 1000ms，加上随机抖动
        const baseDelay = Math.pow(2, attempt) * 1000
        const jitter = Math.random() * 1000
        const delay = baseDelay + jitter

        logger.warn(`${operationName} failed, retrying in ${Math.ceil(delay / 1000)}s...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    throw new Error(`Max retries exceeded for ${operationName}`)
  }

  /**
   * Performance monitoring
   */
  private async logPerformance<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now()
    try {
      const result = await fn()
      const duration = Date.now() - start
      logger.info(`${operation} completed in ${duration}ms`)
      return result
    } catch (error) {
      const duration = Date.now() - start
      logger.error(`${operation} failed after ${duration}ms:`, error)
      throw error
    }
  }

  /**
   * Get cached content
   */
  private getCachedContent(key: string): any | null {
    const cached = this.contentCache.get(key)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info(`Cache hit for key: ${key}`)
      return cached.data
    }
    return null
  }

  /**
   * Set cached content
   */
  private setCachedContent(key: string, data: any): void {
    this.contentCache.set(key, {
      data,
      timestamp: Date.now()
    })
    logger.info(`Cached content for key: ${key}`)
  }

  /**
   * Check and enforce rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now()

    // Clean up old timestamps (older than 1 hour)
    RedNoteTools.requestTimestamps = RedNoteTools.requestTimestamps.filter(
      timestamp => now - timestamp < 3600000 // 1 hour
    )

    // Check hourly limit
    if (RedNoteTools.requestTimestamps.length >= RedNoteTools.MAX_REQUESTS_PER_HOUR) {
      const oldestRequest = RedNoteTools.requestTimestamps[0]
      const waitTime = 3600000 - (now - oldestRequest) + 1000 // Wait until hour passes
      logger.warn(`Hourly rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    // Check minimum interval
    const timeSinceLastRequest = now - RedNoteTools.lastRequestTime
    if (timeSinceLastRequest < RedNoteTools.MIN_INTERVAL) {
      const waitTime = RedNoteTools.MIN_INTERVAL - timeSinceLastRequest
      logger.warn(`Rate limiting: waiting ${Math.ceil(waitTime / 1000)}s before next request`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    // Update timestamps
    RedNoteTools.lastRequestTime = Date.now()
    RedNoteTools.requestTimestamps.push(RedNoteTools.lastRequestTime)
    RedNoteTools.requestCount++

    logger.info(`Request #${RedNoteTools.requestCount}, ${RedNoteTools.requestTimestamps.length} requests in last hour`)
  }

  /**
   * Smart delay based on peak hours
   */
  private async smartDelay(): Promise<void> {
    const hour = new Date().getHours()
    // 高峰期(晚8-11点)增加延迟
    const isPeakHour = hour >= 20 || hour <= 23
    const baseDelay = isPeakHour ? 15000 : 10000
    const randomDelay = Math.random() * 5000 + baseDelay

    await new Promise(resolve => setTimeout(resolve, randomDelay))
  }

  async initialize(): Promise<void> {
    logger.info('Initializing browser and page')
    this.browser = await this.authManager.getBrowser()
    if (!this.browser) {
      throw new Error('Failed to initialize browser')
    }

    try {
      this.page = await this.browser.newPage()

      // Inject enhanced anti-detection script
      logger.info('Injecting enhanced anti-detection script')
      await this.page.addInitScript(() => {
        // Remove all automation markers
        const automationProps = [
          '__nightmare', '_phantom', 'callPhantom', '_selenium', 'webdriver',
          '__driver_evaluate', '__webdriver_evaluate', '__selenium_evaluate',
          '__fxdriver_evaluate', '__driver_unwrapped', '__webdriver_unwrapped',
          '__selenium_unwrapped', '__fxdriver_unwrapped',
          'cdc_adoQpoasnfa76pfcZLmcfl_Array', 'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
          'cdc_adoQpoasnfa76pfcZLmcfl_Symbol', '__webdriver_script_fn',
          '__webdriver_script_func', '__webdriver_script_eval',
          '$cdc_asdjflasutopfhvcZLmcfl_', '$chrome_asyncScriptInfo'
        ]

        automationProps.forEach(prop => {
          delete (window as any)[prop]
          delete (document as any)[prop]
        })

        // Hide webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        })

        // Override plugins with realistic plugin objects
        const plugins = [
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
          }
        ]
        Object.defineProperty(navigator, 'plugins', {
          get: () => plugins,
          configurable: true
        })

        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['zh-CN', 'zh', 'en-US', 'en'],
          configurable: true
        })

        Object.defineProperty(navigator, 'language', {
          get: () => 'zh-CN',
          configurable: true
        })

        // Override hardware properties
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

        Object.defineProperty(navigator, 'platform', {
          get: () => 'Win32',
          configurable: true
        })

        // Override connection
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 100,
            downlink: 10,
            saveData: false
          }),
          configurable: true
        })

        // Override permissions
        const originalQuery = window.navigator.permissions.query
        window.navigator.permissions.query = (parameters) => (
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

        // Spoof WebGL fingerprint
        const originalGetParameter = WebGLRenderingContext.prototype.getParameter
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return 'Intel Inc.'
          if (parameter === 37446) return 'Intel(R) Iris(R) Xe Graphics'
          return originalGetParameter.call(this, parameter)
        }

        // Spoof Canvas fingerprint
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
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

        // Add random mouse movements
        setInterval(() => {
          const event = new MouseEvent('mousemove', {
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight,
            bubbles: true
          })
          window.dispatchEvent(event)
        }, 3000)

        // Simulate occasional scroll events
        setInterval(() => {
          if (Math.random() > 0.8) {
            window.scrollBy(0, (Math.random() - 0.5) * 100)
          }
        }, 5000)
      })

      // Load cookies if available
      const cookies = await this.authManager.getCookies()
      if (cookies.length > 0) {
        logger.info(`Loading ${cookies.length} cookies`)
        await this.page.context().addCookies(cookies)
      }

      // Check login status with more robust detection
      logger.info('Checking login status')
      await this.page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' })

      // Wait for page to fully load
      await this.randomDelay(3, 5)

      const isLoggedIn = await this.page.evaluate(() => {
        // Multiple login detection strategies
        const strategies = [
          // Strategy 1: Check sidebar user element
          () => {
            const sidebarUser = document.querySelector('.user.side-bar-component .channel')
            return sidebarUser?.textContent?.trim() === '我'
          },
          // Strategy 2: Check for user avatar
          () => {
            const avatar = document.querySelector('.avatar, .user-avatar, [data-testid="user-avatar"]')
            return !!avatar
          },
          // Strategy 3: Check for logout button
          () => {
            const logoutBtn = document.querySelector('button:has-text("退出"), button:has-text("登出")')
            return !!logoutBtn
          },
          // Strategy 4: Check for logged-in user content
          () => {
            const userContent = document.querySelector('.user-info, .user-name, .profile')
            return !!userContent
          }
        ]

        return strategies.some(strategy => {
          try {
            return strategy()
          } catch (error) {
            return false
          }
        })
      })

      // If not logged in, perform login
      if (!isLoggedIn) {
        logger.error('Not logged in, please login first')
        throw new Error('Not logged in')
      }
      logger.info('Login status verified')
    } catch (error) {
      // 初始化过程中出错，确保清理资源
      await this.cleanup()
      throw error
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up browser resources')
    try {
      if (this.page) {
        await this.page.close().catch(err => logger.error('Error closing page:', err))
        this.page = null
      }

      if (this.browser) {
        await this.browser.close().catch(err => logger.error('Error closing browser:', err))
        this.browser = null
      }
    } catch (error) {
      logger.error('Error during cleanup:', error)
    } finally {
      this.page = null
      this.browser = null
    }
  }

  extractRedBookUrl(shareText: string): string {
    // 匹配 http://xhslink.com/ 开头的链接
    const xhslinkRegex = /(https?:\/\/xhslink\.com\/[a-zA-Z0-9\/]+)/i
    const xhslinkMatch = shareText.match(xhslinkRegex)

    if (xhslinkMatch && xhslinkMatch[1]) {
      return xhslinkMatch[1]
    }

    // 匹配 https://www.xiaohongshu.com/ 开头的链接
    const xiaohongshuRegex = /(https?:\/\/(?:www\.)?xiaohongshu\.com\/[^，\s]+)/i
    const xiaohongshuMatch = shareText.match(xiaohongshuRegex)

    if (xiaohongshuMatch && xiaohongshuMatch[1]) {
      return xiaohongshuMatch[1]
    }

    return shareText
  }

  async searchNotes(keywords: string, limit: number = 10): Promise<Note[]> {
    return this.logPerformance(`searchNotes(${keywords}, ${limit})`, async () => {
      logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)

      // Check cache first
      const cacheKey = `search:${keywords}:${limit}`
      const cached = this.getCachedContent(cacheKey)
      if (cached) {
        return cached
      }

      // Check rate limit before proceeding
      await this.checkRateLimit()

      return this.retryWithBackoff(async () => {
        await this.initialize()
        if (!this.page) throw new Error('Page not initialized')

        // Add smart delay after initialization to mimic human behavior
        logger.info('Waiting before search to avoid anti-bot detection')
        await this.randomDelay(2, 4)

        // Navigate to search page
        logger.info('Navigating to search page')
        await this.page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keywords)}`)

        // Add delay after page load
        await this.randomDelay(2, 3)

        // Wait for search results to load
        logger.info('Waiting for search results')
        await this.page.waitForSelector('.feeds-container', {
          timeout: 30000
        })

        // Get all note items
        let noteItems = await this.page.$$('.feeds-container .note-item')
        logger.info(`Found ${noteItems.length} note items`)
        const notes: Note[] = []

        // Process each note
        for (let i = 0; i < Math.min(noteItems.length, limit); i++) {
          logger.info(`Processing note ${i + 1}/${Math.min(noteItems.length, limit)}`)
          try {
            // Click on the note cover to open detail
            await noteItems[i].$eval('a.cover.mask.ld', (el: HTMLElement) => el.click())

            // Wait for the note page to load
            logger.info('Waiting for note page to load')
            await this.page.waitForSelector('#noteContainer', {
              timeout: 30000
            })

            await this.randomDelay(0.5, 1.5)

            // Extract note content
            const note = await this.page.evaluate(() => {
              const article = document.querySelector('#noteContainer')
              if (!article) return null

              // Get title
              const titleElement = article.querySelector('#detail-title')
              const title = titleElement?.textContent?.trim() || ''

              // Get content
              const contentElement = article.querySelector('#detail-desc .note-text')
              const content = contentElement?.textContent?.trim() || ''

              // Get author info
              const authorElement = article.querySelector('.author-wrapper .username')
              const author = authorElement?.textContent?.trim() || ''

              // Get interaction counts from engage-bar
              const engageBar = document.querySelector('.engage-bar-style')
              const likesElement = engageBar?.querySelector('.like-wrapper .count')
              const likes = parseInt(likesElement?.textContent?.replace(/[^\d]/g, '') || '0')

              const collectElement = engageBar?.querySelector('.collect-wrapper .count')
              const collects = parseInt(collectElement?.textContent?.replace(/[^\d]/g, '') || '0')

              const commentsElement = engageBar?.querySelector('.chat-wrapper .count')
              const comments = parseInt(commentsElement?.textContent?.replace(/[^\d]/g, '') || '0')

              return {
                title,
                content,
                url: window.location.href,
                author,
                likes,
                collects,
                comments
              }
            })

            if (note) {
              logger.info(`Extracted note: ${note.title}`)
              notes.push(note as Note)
            }

            // Add random delay before closing
            await this.randomDelay(0.5, 1)

            // Close note by clicking the close button
            const closeButton = await this.page.$('.close-circle')
            if (closeButton) {
              logger.info('Closing note dialog')
              await closeButton.click()

              // Wait for note dialog to disappear
              await this.page.waitForSelector('#noteContainer', {
                state: 'detached',
                timeout: 30000
              })
            }
          } catch (error) {
            logger.error(`Error processing note ${i + 1}:`, error)
            const closeButton = await this.page.$('.close-circle')
            if (closeButton) {
              logger.info('Attempting to close note dialog after error')
              await closeButton.click()

              // Wait for note dialog to disappear
              await this.page.waitForSelector('#noteContainer', {
                state: 'detached',
                timeout: 30000
              })
            }
          } finally {
            // Add random delay before next note
            await this.randomDelay(0.5, 1.5)
          }
        }

        logger.info(`Successfully processed ${notes.length} notes`)

        // Cache the results
        this.setCachedContent(cacheKey, notes)

        return notes
      }, 'searchNotes')
    })
  }

  async getNoteContent(url: string): Promise<NoteDetail> {
    return this.logPerformance(`getNoteContent(${url})`, async () => {
      logger.info(`Getting note content for URL: ${url}`)

      // Check cache first
      const cacheKey = `note:${url}`
      const cached = this.getCachedContent(cacheKey)
      if (cached) {
        return cached
      }

      // Check rate limit before proceeding
      await this.checkRateLimit()

      return this.retryWithBackoff(async () => {
        await this.initialize()
        if (!this.page) throw new Error('Page not initialized')

        const actualURL = this.extractRedBookUrl(url)
        logger.info(`Navigating to: ${actualURL}`)

        // Add random delay to mimic human behavior
        await this.randomDelay(0.5, 1.5)

        await this.page.goto(actualURL, { waitUntil: 'domcontentloaded' })

        // Add another delay after page load
        await this.randomDelay(1, 2)

        // Log the final URL after any redirects
        const finalURL = this.page.url()
        logger.info(`Final URL after navigation: ${finalURL}`)

        // Check if we got redirected to 404 or error page
        if (finalURL.includes('/404') || finalURL.includes('error')) {
          logger.error(`Redirected to error page: ${finalURL}`)
          throw new Error(`Failed to access note: redirected to ${finalURL}`)
        }

        let note = await GetNoteDetail(this.page)
        note.url = url
        logger.info(`Successfully extracted note: ${note.title}`)

        // Cache the result
        this.setCachedContent(cacheKey, note)

        return note
      }, 'getNoteContent')
    })
  }

  async getNoteComments(url: string): Promise<Comment[]> {
    return this.logPerformance(`getNoteComments(${url})`, async () => {
      logger.info(`Getting comments for URL: ${url}`)

      // Check cache first
      const cacheKey = `comments:${url}`
      const cached = this.getCachedContent(cacheKey)
      if (cached) {
        return cached
      }

      // Check rate limit before proceeding
      await this.checkRateLimit()

      return this.retryWithBackoff(async () => {
        await this.initialize()
        if (!this.page) throw new Error('Page not initialized')

        await this.page.goto(url)

        // Wait for page to fully load
        await this.randomDelay(2, 3)

        // Try to trigger comment loading
        await this.triggerCommentLoading()

        // Wait for comments to load with multiple selectors
        await this.waitForCommentsWithFallback()

        // Extract comments with enhanced fallback logic
        const comments = await this.page.evaluate(() => {
          console.log('Starting comment extraction...')

          // Try multiple strategies to find comments
          const strategies = [
            // Strategy 1: Look for dialog lists
            () => {
              const dialogs = document.querySelectorAll('[role="dialog"], .modal, .popup')
              for (let i = 0; i < dialogs.length; i++) {
                const dialog = dialogs[i]
                const items = dialog.querySelectorAll('[role="listitem"], .comment-item, [class*="comment"]')
                if (items.length > 0) return Array.from(items)
              }
              return null
            },
            // Strategy 2: Look for comment containers directly
            () => {
              const selectors = [
                '[role="dialog"] [role="list"] [role="listitem"]',
                '.comment-list .comment-item',
                '.comments-container .comment',
                '[data-testid="comment-item"]',
                '.note-comments .comment',
                '.detail-comments .comment'
              ]
              for (const selector of selectors) {
                const items = document.querySelectorAll(selector)
                if (items.length > 0) return Array.from(items)
              }
              return null
            },
            // Strategy 3: Look for any element that might contain comment data
            () => {
              const allElements = document.querySelectorAll('*')
              const commentElements: Element[] = []

              for (let i = 0; i < allElements.length; i++) {
                const element = allElements[i]
                const text = element.textContent || ''
                const classList = element.className || ''
                const testid = element.getAttribute('data-testid') || ''

                // If element has comment-like content or attributes
                if ((text.length > 0 && text.length < 500) &&
                    (classList.includes('comment') || testid.includes('comment') ||
                     classList.includes('user') || testid.includes('user'))) {
                  commentElements.push(element)
                }
              }

              return commentElements.length > 0 ? commentElements : null
            }
          ]

          let items: Element[] | null = null
          let usedStrategy = 0

          for (let i = 0; i < strategies.length; i++) {
            items = strategies[i]()
            if (items && items.length > 0) {
              usedStrategy = i + 1
              console.log(`Found ${items.length} potential comment items using strategy ${usedStrategy}`)
              break
            }
          }

          if (!items || items.length === 0) {
            console.log('No comment items found with any strategy')
            return []
          }

          const results: any[] = []

          // Extract data from found items
          for (let index = 0; index < items.length; index++) {
            const item = items[index]
            try {
              // Enhanced text extraction for author
              let author = ''
              const authorSelectors = [
                '[data-testid="user-name"]',
                '.username',
                '.author-name',
                '.user-name',
                '.name',
                '[class*="user"]',
                '[class*="author"]'
              ]

              for (const selector of authorSelectors) {
                const element = item.querySelector(selector)
                if (element?.textContent?.trim()) {
                  author = element.textContent.trim()
                  break
                }
              }

              // Fallback: look for any text that might be a username
              if (!author) {
                const textElements = item.querySelectorAll('*')
                for (let j = 0; j < textElements.length; j++) {
                  const el = textElements[j]
                  const text = el.textContent?.trim()
                  if (text && text.length < 50 && !text.includes(' ') && el.textContent === text) {
                    author = text
                    break
                  }
                }
              }

              // Enhanced content extraction
              let content = ''
              const contentSelectors = [
                '[data-testid="comment-content"]',
                '.comment-text',
                '.comment-content',
                '.content',
                '.text',
                '[class*="content"]',
                '[class*="text"]'
              ]

              for (const selector of contentSelectors) {
                const element = item.querySelector(selector)
                if (element?.textContent?.trim()) {
                  content = element.textContent.trim()
                  break
                }
              }

              // Fallback: use item text content if it looks like a comment
              if (!content) {
                const itemText = item.textContent?.trim() || ''
                if (itemText.length > 10 && itemText.length < 1000 && author !== itemText) {
                  content = itemText.replace(author, '').trim()
                }
              }

              // Enhanced likes extraction
              let likes = 0
              const likesSelectors = [
                '[data-testid="likes-count"]',
                '.like-count',
                '.likes',
                '.like-number',
                '.like',
                '[class*="like"]'
              ]

              for (const selector of likesSelectors) {
                const element = item.querySelector(selector)
                if (element?.textContent) {
                  const match = element.textContent.match(/\d+/)
                  if (match) {
                    likes = parseInt(match[0])
                    break
                  }
                }
              }

              // Enhanced time extraction
              let time = ''
              const timeSelectors = [
                'time',
                '.time',
                '.comment-time',
                '.timestamp',
                '.date',
                '[class*="time"]',
                '[class*="date"]'
              ]

              for (let k = 0; k < timeSelectors.length; k++) {
                const selector = timeSelectors[k]
                const element = item.querySelector(selector)
                if (element?.textContent?.trim()) {
                  time = element.textContent.trim()
                  break
                }
              }

              // Only add if we have meaningful content
              if (author || content) {
                results.push({
                  author: author || 'Unknown',
                  content: content || '',
                  likes,
                  time
                })
                console.log(`Extracted comment ${index + 1}: author="${author}", content="${content?.substring(0, 50)}..."`)
              }
            } catch (error) {
              console.log(`Error processing comment item ${index}:`, error)
            }
          }

          console.log(`Successfully extracted ${results.length} comments`)
          return results
        })

        logger.info(`Successfully extracted ${comments.length} comments`)

        // Cache the results
        this.setCachedContent(cacheKey, comments)

        return comments
      }, 'getNoteComments')
    })
  }

  /**
   * Try to trigger comment loading by clicking comment buttons
   */
  private async triggerCommentLoading(): Promise<void> {
    logger.info('Attempting to trigger comment loading')

    // Try multiple selectors for comment buttons
    const commentButtonSelectors = [
      '.engage-bar .chat-wrapper',
      '.engage-bar .chat-btn',
      '.comment-btn',
      '[data-testid="comment-button"]',
      '.comment-count',
      '.bottom-bar .comment'
    ]

    for (const selector of commentButtonSelectors) {
      try {
        if (this.page) {
          const button = await this.page.$(selector)
          if (button) {
            logger.info(`Found comment button with selector: ${selector}`)
            await button.click()
            await this.randomDelay(1, 2) // Wait for comments to load after click
            return
          }
        }
      } catch (error) {
        logger.debug(`Failed to click comment button with selector ${selector}:`, error)
        continue
      }
    }

    // Try to scroll down to trigger lazy loading
    try {
      if (this.page) {
        logger.info('Scrolling down to trigger comment loading')
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight)
        })
        await this.randomDelay(1, 2)
      }
    } catch (error) {
      logger.debug('Failed to scroll:', error)
    }

    logger.info('No comment button found, comments might be auto-loaded')
  }

  /**
   * Wait for comments with fallback selectors
   */
  private async waitForCommentsWithFallback(): Promise<void> {
    const selectors = [
      // Primary selectors for comment areas
      '[role="dialog"] [role="list"]',
      '.comment-list',
      '.comments-container',
      '[data-testid="comments"]',
      // Alternative selectors
      '.comment-section',
      '.comment-feed',
      '.note-comments',
      '.comment-items',
      // More specific selectors
      '.notes-detail .comment-list',
      '.detail-comments .comment-list',
      '[class*="comment"] [class*="list"]',
      // Generic fallbacks
      '[class*="comment"]',
      '[role="dialog"]',
      '.modal .content'
    ]

    for (const selector of selectors) {
      try {
        logger.info(`Trying selector: ${selector}`)
        if (this.page) {
          await this.page.waitForSelector(selector, { timeout: 8000 })
          logger.info(`Found comments with selector: ${selector}`)

          // Wait for comments to actually load in the container
          await this.randomDelay(2, 4)

          // Check if there are actual comment items
          const hasComments = await this.page.evaluate((sel) => {
            const container = document.querySelector(sel)
            if (!container) return false

            // Look for comment items
            const items = container.querySelectorAll('[role="listitem"], .comment-item, .comment, [class*="comment"]')
            return items.length > 0
          }, selector)

          if (hasComments) {
            logger.info(`Found actual comment items with selector: ${selector}`)
            return
          } else {
            logger.info(`Found container but no comment items with selector: ${selector}`)
          }
        }
      } catch (e) {
        logger.debug(`Selector ${selector} not found, trying next...`)
        continue
      }
    }

    // As a last resort, try to wait longer and scroll
    try {
      if (this.page) {
        logger.info('Last resort: waiting for any dialog with extended timeout')
        await this.page.waitForSelector('[role="dialog"], .modal, .popup', { timeout: 15000 })
        logger.info('Found dialog/popup element')

        // Add extra delay and scroll to ensure comments load
        await this.randomDelay(3, 5)
        await this.page.evaluate(() => {
          // Try to scroll within the dialog if it exists
          const dialog = document.querySelector('[role="dialog"], .modal, .popup')
          if (dialog) {
            dialog.scrollTop = dialog.scrollHeight
          }
        })
        await this.randomDelay(1, 2)
      }
    } catch (e) {
      logger.warn('Could not find any comment container, proceeding with fallback extraction')
    }
  }

  /**
   * 发布图文笔记
   */
  async publishNote(
    title: string,
    content: string,
    imagePaths: string[],
    tags: string = ''
  ): Promise<PublishResult> {
    return this.logPerformance(`publishNote(${title}, ${content.length} chars, ${imagePaths.length} images)`, async () => {
      logger.info(`Starting to publish note: ${title}`)

      // Validate inputs
      if (!title?.trim()) {
        throw new Error('Note title cannot be empty')
      }
      if (!content?.trim()) {
        throw new Error('Note content cannot be empty')
      }
      if (!imagePaths || imagePaths.length === 0) {
        throw new Error('At least one image is required')
      }

      // Validate image paths
      const validImagePaths = await this.validateImagePaths(imagePaths)

      return this.retryWithBackoff(async () => {
        // Check rate limit before proceeding - 重要！
        await this.checkRateLimit()

        await this.initialize()
        if (!this.page) throw new Error('Page not initialized')

        // 添加反爬虫检测诊断
        await this.diagnoseAntiCrawlerDetection()

        // Add smart delay before accessing creator platform
        logger.info('Adding smart delay before accessing creator platform')
        await this.smartDelay()

        // 使用新的创作者平台访问策略
        logger.info('Using new creator platform access strategy...')
        const creatorAccess = new CreatorPlatformAccess(this.page)
        const accessSuccess = await creatorAccess.accessCreatorPlatform()

        if (!accessSuccess) {
          throw new Error('Failed to access creator platform. Please check your account permissions and try again.')
        }

        // 确保在发布页面
        const currentUrl = this.page.url()
        if (!currentUrl.includes('publish')) {
          logger.info('Navigating to publish page...')
          await this.page.goto('https://creator.xiaohongshu.com/publish/publish', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          })
          await this.randomDelay(3, 5)
        }

        // 最终验证
        const finalUrl = this.page.url()
        logger.info(`Final URL before publishing: ${finalUrl}`)

        if (finalUrl.includes('login')) {
          throw new Error('Still being redirected to login page. Creator platform access failed.')
        }

        // Click on "发布图文笔记" button
        logger.info('Looking for "发布图文笔记" button...')
        await this.clickUploadImageButton()

        // Wait for upload interface
        await this.randomDelay(5, 7)

        // Upload images
        logger.info(`Uploading ${validImagePaths.length} images...`)
        await this.uploadImages(validImagePaths)

        // Fill in title
        logger.info('Filling in title...')
        await this.fillTitle(title)

        // Fill in content
        logger.info('Filling in content...')
        await this.fillContent(content)

        // Add tags if provided
        if (tags) {
          logger.info('Adding tags...')
          await this.addTags(tags)
        }

        // Submit the note
        logger.info('Submitting for publication...')
        await this.submitPublish()

        // Wait for completion
        logger.info('Waiting for publish completion...')
        await this.waitForPublishCompletion()

        logger.info('Note published successfully!')
        return {
          success: true,
          message: '图文笔记发布成功',
          title,
          content,
          imageCount: validImagePaths.length,
          tags,
          url: 'https://creator.xiaohongshu.com/publish/publish'
        }
      }, 'publishNote')
    })
  }

  /**
   * Validate image paths
   */
  private async validateImagePaths(imagePaths: string[]): Promise<string[]> {
    const fs = require('fs')
    const path = require('path')
    const validPaths: string[] = []

    for (const imagePath of imagePaths) {
      const resolvedPath = path.resolve(imagePath)

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Image file not found: ${imagePath}`)
      }

      const stats = fs.statSync(resolvedPath)
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${imagePath}`)
      }

      // Check file extension
      const ext = imagePath.toLowerCase().split('.').pop()
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']
      if (!ext || !allowedExtensions.includes(ext)) {
        throw new Error(`Unsupported image format: ${imagePath}. Supported: ${allowedExtensions.join(', ')}`)
      }

      validPaths.push(resolvedPath)
    }

    if (validPaths.length > 18) {
      throw new Error('Maximum 18 images allowed')
    }

    return validPaths
  }

  /**
   * Check login status on creator platform
   */
  private async checkLoginStatus(): Promise<boolean> {
    try {
      const currentUrl = this.page?.url() || ''
      logger.info(`Checking login status, current URL: ${currentUrl}`)

      // Check URL patterns
      if (currentUrl.includes('login')) {
        logger.warn('Login page detected in URL')
        return false
      }

      if (currentUrl.includes('publish')) {
        logger.info('Publish page detected in URL')
        return true
      }

      // Check for login indicators
      const hasLoginForm = await this.page!.evaluate(() => {
        // Look for login form elements
        const loginElements = document.querySelectorAll('.login-container, .login-form, input[type="password"]')
        return loginElements.length > 0
      })

      if (hasLoginForm) {
        logger.warn('Login form detected on page')
        return false
      }

      // Check for user avatar or logged-in indicators
      const hasUserIndicators = await this.page!.evaluate(() => {
        const userSelectors = [
          '.user-info',
          '.avatar',
          '.user-avatar',
          '.user-profile',
          '[data-testid="user-avatar"]'
        ]
        return userSelectors.some(selector => document.querySelector(selector))
      })

      if (hasUserIndicators) {
        logger.info('User indicators detected, likely logged in')
        return true
      }

      logger.warn('Could not determine login status, assuming not logged in')
      return false
    } catch (error) {
      logger.warn('Error checking login status:', error)
      return false
    }
  }

  /**
   * Click the upload image button
   */
  private async clickUploadImageButton(): Promise<void> {
    // 步骤1: 查找并点击"发布笔记"按钮
    const publishNoteSelectors = [
      'button:has-text("发布笔记")',
      'div:has-text("发布笔记")',
      'button:has-text("发布")',
      'div:has-text("发布")',
      '.publish-btn',
      'button[class*="publish"]',
      'div[class*="publish"]'
    ]

    let buttonClicked = false

    // 首先找"发布笔记"按钮
    for (const selector of publishNoteSelectors) {
      try {
        const elements = await this.page!.$$(selector)

        for (const element of elements) {
          const isVisible = await element.isVisible()
          if (isVisible) {
            const text = await element.textContent()

            if (text && (text.includes('发布笔记') || text.includes('发布'))) {
              logger.info(`Found publish note button: "${text}"`)
              await element.click()
              await this.randomDelay(5, 7)
              buttonClicked = true
              break
            }
          }
        }

        if (buttonClicked) break
      } catch (error) {
        // Continue to next selector
      }
    }

    if (!buttonClicked) {
      logger.warn('Could not find "发布笔记" button, trying alternative approach')
    }

    // 步骤2: 查找并点击"上传图文"按钮
    await this.randomDelay(5, 7)
    const uploadImageTextSelectors = [
      'button:has-text("上传图文")',
      'div:has-text("上传图文")',
      'button:has-text("图文")',
      'div:has-text("图文")',
      '.upload-image-btn',
      'button[class*="upload"]'
    ]

    buttonClicked = false
    for (const selector of uploadImageTextSelectors) {
      try {
        const elements = await this.page!.$$(selector)

        for (const element of elements) {
          const isVisible = await element.isVisible()
          if (isVisible) {
            const text = await element.textContent()

            if (text && (text.includes('上传图文') || text.includes('图文'))) {
              logger.info(`Found upload image text button: "${text}"`)
              await element.click()
              await this.randomDelay(5, 7)
              buttonClicked = true
              break
            }
          }
        }

        if (buttonClicked) break
      } catch (error) {
        // Continue to next selector
      }
    }

    if (!buttonClicked) {
      logger.warn('Could not find "上传图文" button')
    }

    // 步骤3: 查找并点击"上传图片"按钮
    await this.randomDelay(5, 7)
    const uploadImageSelectors = [
      'button:has-text("上传图片")',
      'div:has-text("上传图片")',
      'input[type="file"]',
      '.upload-btn',
      'button[class*="upload-image"]',
      'div[class*="upload-image"]'
    ]

    buttonClicked = false
    for (const selector of uploadImageSelectors) {
      try {
        // 对于file input，我们不需要点击，只需要找到即可
        if (selector === 'input[type="file"]') {
          const fileInput = await this.page!.$(selector)
          if (fileInput) {
            logger.info('Found file input element')
            buttonClicked = true
            break
          }
        } else {
          const elements = await this.page!.$$(selector)

          for (const element of elements) {
            const isVisible = await element.isVisible()
            if (isVisible) {
              const text = await element.textContent()

              if (text && text.includes('上传图片')) {
                logger.info(`Found upload image button: "${text}"`)
                await element.click()
                await this.randomDelay(5, 7)
                buttonClicked = true
                break
              }
            }
          }

          if (buttonClicked) break
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    if (!buttonClicked) {
      logger.warn('Could not find "上传图片" button, but file input might be available')
    }
  }

  /**
   * Upload images
   */
  private async uploadImages(imagePaths: string[]): Promise<void> {
    // Wait for file input to be available
    await this.randomDelay(2, 3)

    // Look for file input
    let fileInput = await this.page!.$('input[type="file"]')

    if (!fileInput) {
      // Try to find hidden file inputs
      const hiddenSelectors = [
        'input[type="file"][style*="display: none"]',
        'input[accept*="image"]',
        'input[accept*="jpg"]',
        'input[accept*="png"]',
        '.upload-input input[type="file"]'
      ]

      for (const selector of hiddenSelectors) {
        fileInput = await this.page!.$(selector)
        if (fileInput) break
      }
    }

    if (!fileInput) {
      // Try to click upload area to reveal file input
      const uploadAreaSelectors = [
        'div[class*="upload-area"]',
        'div[class*="upload-container"]',
        '[class*="upload-drag"]'
      ]

      for (const selector of uploadAreaSelectors) {
        try {
          const uploadArea = await this.page!.$(selector)
          if (uploadArea && await uploadArea.isVisible()) {
            await uploadArea.click()
            await this.randomDelay(1, 1)
            fileInput = await this.page!.$('input[type="file"]')
            if (fileInput) break
          }
        } catch (error) {
          // Continue
        }
      }
    }

    if (!fileInput) {
      throw new Error('Could not find file upload input. Please ensure you are on the correct page.')
    }

    // Upload images
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i]
      logger.info(`Uploading image ${i + 1}: ${imagePath}`)

      try {
        await fileInput.setInputFiles([imagePath])
        await this.randomDelay(1, 2)

        // Wait for image processing
        await this.waitForImageProcessing(i + 1)
      } catch (error) {
        logger.error(`Failed to upload image ${i + 1}: ${error}`)
        throw new Error(`Failed to upload image ${i + 1}: ${error}`)
      }
    }

    logger.info('All images uploaded successfully')
  }

  /**
   * Wait for image processing to complete
   */
  private async waitForImageProcessing(imageNumber: number): Promise<void> {
    const maxWaitTime = 15000 // 15 seconds
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      const processingIndicators = [
        '.processing',
        '.uploading',
        '[class*="processing"]',
        '[class*="uploading"]',
        '.loading'
      ]

      let stillProcessing = false
      for (const selector of processingIndicators) {
        const element = await this.page!.$(selector)
        if (element && await element.isVisible()) {
          stillProcessing = true
          break
        }
      }

      if (!stillProcessing) {
        logger.debug(`Image ${imageNumber} processing completed`)
        return
      }

      await this.randomDelay(0.5, 1)
    }

    logger.warn(`Image ${imageNumber} processing timeout, continuing anyway`)
  }

  /**
   * Fill in the title
   */
  private async fillTitle(title: string): Promise<void> {
    const titleSelectors = [
      'input[placeholder*="标题"]',
      'input[placeholder*="title"]',
      'input[name="title"]',
      'input[id*="title"]',
      'input[class*="title"]',
      'input[type="text"]'
    ]

    for (const selector of titleSelectors) {
      try {
        const titleInput = await this.page!.$(selector)
        if (titleInput && await titleInput.isVisible()) {
          await titleInput.click()
          await this.randomDelay(0.5, 1)
          await titleInput.fill(title)
          logger.info('Title filled successfully')
          return
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    // Fallback: try any visible input
    const allInputs = await this.page!.$$('input')
    for (const input of allInputs) {
      try {
        if (await input.isVisible()) {
          await input.click()
          await this.randomDelay(0.5, 1)
          await input.fill(title)
          logger.info('Title filled using fallback method')
          return
        }
      } catch (error) {
        // Continue
      }
    }

    throw new Error('Could not find title input field')
  }

  /**
   * Fill in the content
   */
  private async fillContent(content: string): Promise<void> {
    const contentSelectors = [
      'textarea[placeholder*="正文"]',
      'textarea[placeholder*="内容"]',
      'div[contenteditable="true"]',
      'div[data-placeholder*="正文"]',
      '.content-editor',
      'div[role="textbox"]',
      'textarea'
    ]

    for (const selector of contentSelectors) {
      try {
        const contentElement = await this.page!.$(selector)
        if (contentElement && await contentElement.isVisible()) {
          await contentElement.click()
          await this.randomDelay(0.5, 1)
          await contentElement.fill(content)
          logger.info('Content filled successfully')
          return
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    // Fallback: try any visible contenteditable element
    const contentEditables = await this.page!.$$('div[contenteditable="true"], textarea')
    for (const element of contentEditables) {
      try {
        if (await element.isVisible()) {
          await element.click()
          await this.randomDelay(0.5, 1)
          await element.fill(content)
          logger.info('Content filled using fallback method')
          return
        }
      } catch (error) {
        // Continue
      }
    }

    throw new Error('Could not find content input field')
  }

  /**
   * Add tags
   */
  private async addTags(tags: string): Promise<void> {
    try {
      const tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)

      // Find content element to add tags to
      const contentElement = await this.page!.$('div[contenteditable="true"], textarea')
      if (contentElement) {
        for (const tag of tagList) {
          await contentElement.fill(`#${tag}`)
          await this.randomDelay(0.5, 1)
          await this.page!.keyboard.press('Enter')
          await this.randomDelay(0.5, 1)
        }
        logger.info(`Added ${tagList.length} tags`)
      }
    } catch (error) {
      logger.warn(`Failed to add tags: ${error}`)
    }
  }

  /**
   * Submit the publish form
   */
  private async submitPublish(): Promise<void> {
    const submitSelectors = [
      'button:has-text("发布")',
      'div.submit button',
      'div[class*="submit"] button',
      'button[type="submit"]',
      '.publish-button'
    ]

    for (const selector of submitSelectors) {
      try {
        const submitButton = await this.page!.$(selector)
        if (submitButton && await submitButton.isVisible()) {
          await submitButton.click()
          await this.randomDelay(2, 3)
          logger.info('Publish form submitted')
          return
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    throw new Error('Could not find submit button')
  }

  /**
   * Wait for publish completion
   */
  private async waitForPublishCompletion(): Promise<void> {
    const maxWaitTime = 60000 // 60 seconds
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      // Check for success indicators
      const successSelectors = [
        '.success-message',
        '.publish-success',
        '.toast-success',
        '[data-testid="publish-success"]'
      ]

      for (const selector of successSelectors) {
        const element = await this.page!.$(selector)
        if (element && await element.isVisible()) {
          logger.info('Publish completed successfully')
          await this.randomDelay(2, 2)
          return
        }
      }

      // Check for error indicators
      const errorSelectors = [
        '.error-message',
        '.publish-error',
        '.toast-error',
        '[data-testid="publish-error"]'
      ]

      for (const selector of errorSelectors) {
        const element = await this.page!.$(selector)
        if (element && await element.isVisible()) {
          const errorText = await element.textContent()
          throw new Error(`Publish failed: ${errorText}`)
        }
      }

      // Check if we're still on publish page
      const stillOnPublishPage = await this.page!.$('div.upload-content, div.submit, .creator-editor')
      if (!stillOnPublishPage) {
        logger.info('Left publish page, assuming success')
        return
      }

      await this.randomDelay(1, 2)
    }

    throw new Error('Publish completion timeout')
  }

  /**
   * Wait for a random duration between min and max seconds
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min
    logger.debug(`Adding random delay of ${delay.toFixed(2)} seconds`)
    await new Promise((resolve) => setTimeout(resolve, delay * 1000))
  }

  /**
   * 诊断反爬虫检测机制
   */
  private async diagnoseAntiCrawlerDetection(): Promise<void> {
    logger.info('🔍 Starting anti-crawler detection diagnosis...')
    
    if (!this.page) {
      logger.error('Page not available for diagnosis')
      return
    }

    try {
      // 1. 检查当前页面状态
      const currentUrl = this.page.url()
      logger.info(`📍 Current URL: ${currentUrl}`)

      // 2. 检查是否有验证码或安全验证
      const securityElements = await this.page.evaluate(() => {
        const elements = {
          captcha: document.querySelectorAll('[class*="captcha"], [id*="captcha"], .verify-code, .security-check').length,
          robotCheck: document.querySelectorAll('[class*="robot"], [class*="bot"], .anti-bot').length,
          securityModal: document.querySelectorAll('[class*="security"], [class*="verify"], .modal-security').length,
          loginRedirect: document.querySelectorAll('.login-container, .login-form, [class*="login"]').length,
          errorMessage: document.querySelectorAll('.error-message, .warning-message, [class*="error"]').length
        }
        return elements
      })

      logger.info('🛡️ Security elements detected:', securityElements)

      // 3. 检查页面标题和内容
      const pageInfo = await this.page.evaluate(() => {
        return {
          title: document.title,
          hasLoginForm: !!document.querySelector('input[type="password"], .login-form'),
          hasCaptcha: !!document.querySelector('[class*="captcha"], .verify-code'),
          hasError: !!document.querySelector('.error, .warning, [class*="error"]'),
          bodyText: document.body.textContent?.substring(0, 200) || ''
        }
      })

      logger.info('📄 Page information:', pageInfo)

      // 4. 检查网络请求状态
      const networkInfo = await this.page.evaluate(() => {
        return {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          cookieEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine,
          webdriver: (navigator as any).webdriver,
          plugins: navigator.plugins.length,
          mimeTypes: navigator.mimeTypes.length
        }
      })

      logger.info('🌐 Network information:', networkInfo)

      // 5. 检查是否被重定向到登录页面
      if (currentUrl.includes('login') || pageInfo.hasLoginForm) {
        logger.warn('🚨 DETECTED: Redirected to login page - likely anti-crawler detection')
        logger.warn('💡 This suggests your automation is being detected by Xiaohongshu\'s anti-bot system')
        
        // 6. 分析可能的原因
        await this.analyzeDetectionCauses()
      }

      // 7. 检查Cookie状态
      const cookies = await this.page.context().cookies()
      logger.info(`🍪 Cookie count: ${cookies.length}`)
      
      if (cookies.length === 0) {
        logger.warn('🚨 No cookies found - session may be invalid')
      }

      // 8. 检查页面加载时间
      const loadTime = await this.page.evaluate(() => {
        return performance.timing.loadEventEnd - performance.timing.navigationStart
      })
      
      logger.info(`⏱️ Page load time: ${loadTime}ms`)

      if (loadTime > 10000) {
        logger.warn('🚨 Slow page load detected - may indicate anti-bot delays')
      }

    } catch (error) {
      logger.error('❌ Error during anti-crawler diagnosis:', error)
    }
  }

  /**
   * 分析反爬虫检测的可能原因
   */
  private async analyzeDetectionCauses(): Promise<void> {
    logger.info('🔍 Analyzing potential detection causes...')

    try {
      // 检查浏览器指纹
      const fingerprint = await this.page!.evaluate(() => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        ctx!.textBaseline = 'top'
        ctx!.font = '14px Arial'
        ctx!.fillText('Browser fingerprint test', 2, 2)
        
        return {
          canvasFingerprint: canvas.toDataURL().substring(0, 100),
          screenResolution: `${screen.width}x${screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
          platform: navigator.platform,
          hardwareConcurrency: navigator.hardwareConcurrency,
          deviceMemory: (navigator as any).deviceMemory,
          webglVendor: (() => {
            try {
              const gl = document.createElement('canvas').getContext('webgl')
              return gl?.getParameter(gl.VENDOR) || 'unknown'
            } catch { return 'unknown' }
          })(),
          webglRenderer: (() => {
            try {
              const gl = document.createElement('canvas').getContext('webgl')
              return gl?.getParameter(gl.RENDERER) || 'unknown'
            } catch { return 'unknown' }
          })()
        }
      })

      logger.info('🔬 Browser fingerprint analysis:', fingerprint)

      // 检查自动化特征
      const automationSigns = await this.page!.evaluate(() => {
        return {
          hasWebdriver: !!(window as any).webdriver || !!(navigator as any).webdriver,
          hasAutomation: !!(window as any).__nightmare || !!(window as any)._phantom,
          hasSelenium: !!(window as any).__selenium_evaluate,
          hasPlaywright: !!(window as any).__playwright,
          chromeRuntime: !!(window as any).chrome?.runtime,
          permissionsAPI: typeof navigator.permissions !== 'undefined',
          automationControlled: !!(window as any).chrome?.runtime?.onConnect
        }
      })

      logger.info('🤖 Automation detection signs:', automationSigns)

      // 提供建议
      logger.info('💡 Recommendations:')
      logger.info('   1. Ensure you\'re using the latest anti-detection measures')
      logger.info('   2. Try using a different IP address or VPN')
      logger.info('   3. Increase delays between requests')
      logger.info('   4. Use residential proxies if available')
      logger.info('   5. Consider manual login before automation')

    } catch (error) {
      logger.error('❌ Error analyzing detection causes:', error)
    }
  }
}
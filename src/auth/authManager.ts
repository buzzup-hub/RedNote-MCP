import {Browser, BrowserContext, chromium, Cookie, Page} from 'playwright';
import {CookieManager} from './cookieManager';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import logger from '../utils/logger';

dotenv.config();

export class AuthManager {
  private browser: Browser | null;
  private context: BrowserContext | null;
  private page: Page | null;
  private cookieManager: CookieManager;

  // Browser instance reuse
  private static browserInstance: Browser | null = null;
  private static lastUsed: number = 0;
  private static readonly BROWSER_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(cookiePath?: string) {
    logger.info('Initializing AuthManager');
    this.browser = null;
    this.context = null;
    this.page = null;

    // Set default cookie path to ~/.mcp/rednote/cookies.json
    if (!cookiePath) {
      const homeDir = os.homedir();
      const mcpDir = path.join(homeDir, '.mcp');
      const rednoteDir = path.join(mcpDir, 'rednote');

      // Create directories if they don't exist
      if (!fs.existsSync(mcpDir)) {
        logger.info(`Creating directory: ${mcpDir}`);
        fs.mkdirSync(mcpDir);
      }
      if (!fs.existsSync(rednoteDir)) {
        logger.info(`Creating directory: ${rednoteDir}`);
        fs.mkdirSync(rednoteDir);
      }

      cookiePath = path.join(rednoteDir, 'cookies.json');
    }

    logger.info(`Using cookie path: ${cookiePath}`);
    this.cookieManager = new CookieManager(cookiePath);
  }

  /**
   * Check if browser instance is still valid
   */
  private static isBrowserValid(): boolean {
    if (!AuthManager.browserInstance) return false;

    const now = Date.now();
    const isExpired = now - AuthManager.lastUsed > AuthManager.BROWSER_TIMEOUT;
    const isConnected = AuthManager.browserInstance.isConnected();

    if (isExpired || !isConnected) {
      logger.info(`Browser instance invalid (expired: ${isExpired}, connected: ${isConnected})`);
      return false;
    }

    return true;
  }

  /**
   * Clean up static browser instance
   */
  private static async cleanupBrowserInstance(): Promise<void> {
    if (AuthManager.browserInstance) {
      try {
        logger.info('Cleaning up static browser instance');
        await AuthManager.browserInstance.close();
      } catch (error) {
        logger.error('Error closing static browser instance:', error);
      } finally {
        AuthManager.browserInstance = null;
      }
    }
  }

  async getBrowser(): Promise<Browser> {
    logger.info('Getting browser instance');

    // Try to reuse existing browser instance
    if (AuthManager.isBrowserValid()) {
      logger.info('Reusing existing browser instance');
      AuthManager.lastUsed = Date.now();
      return AuthManager.browserInstance!;
    }

    // Clean up old instance if it exists
    await AuthManager.cleanupBrowserInstance();

    logger.info('Launching new browser with enhanced anti-detection config');
    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled', // 隐藏自动化特征
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--disable-extensions',
        '--disable-plugins-discovery',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions-except',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-domain-reliability',
        '--disable-component-update',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-ipc-flooding-protection',
        '--enable-automation=false',
        '--password-store=basic',
        '--use-mock-keychain',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--window-size=1920,1080',
        '--window-position=100,100',
        '--display=:99',
      ],
      ignoreDefaultArgs: ['--enable-blink-features=AutomationControlled'], // 覆盖默认的自动化参数
    });

    // Store as static instance for reuse
    AuthManager.browserInstance = this.browser;
    AuthManager.lastUsed = Date.now();

    return this.browser;
  }

  async getCookies(): Promise<Cookie[]> {
    logger.info('Loading cookies');
    return await this.cookieManager.loadCookies();
  }

  async login(options?: {timeout?: number}): Promise<void> {
    const timeoutSeconds = options?.timeout || 10
    logger.info(`Starting login process with timeout: ${timeoutSeconds}s`)
    const timeoutMs = timeoutSeconds * 1000
    this.browser = await this.getBrowser()
    if (!this.browser) {
      logger.error('Failed to launch browser');
      throw new Error('Failed to launch browser');
    }

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        logger.info(`Login attempt ${retryCount + 1}/${maxRetries}`);
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();

        // Load existing cookies if available
        const cookies = await this.cookieManager.loadCookies();
        if (cookies && cookies.length > 0) {
          logger.info(`Loaded ${cookies.length} existing cookies`);
          await this.context.addCookies(cookies);
        }

        // Navigate to explore page
        logger.info('Navigating to explore page');
        await this.page.goto('https://www.xiaohongshu.com/explore', {
          waitUntil: 'domcontentloaded',
          timeout: timeoutMs
        });

        // Check if already logged in
        const userSidebar = await this.page.$('.user.side-bar-component .channel');
        if (userSidebar) {
          const isLoggedIn = await this.page.evaluate(() => {
            const sidebarUser = document.querySelector('.user.side-bar-component .channel');
            return sidebarUser?.textContent?.trim() === '我';
          });

          if (isLoggedIn) {
            logger.info('Already logged in');
            // Already logged in, save cookies and return
            const newCookies = await this.context.cookies();
            await this.cookieManager.saveCookies(newCookies);
            return;
          }
        }

        logger.info('Waiting for login dialog');
        // Wait for login dialog if not logged in
        await this.page.waitForSelector('.login-container', {
          timeout: timeoutMs
        });

        // Wait for QR code image
        logger.info('Waiting for QR code');
        const qrCodeImage = await this.page.waitForSelector('.qrcode-img', {
          timeout: timeoutMs
        });

        // Wait for user to complete login
        logger.info('Waiting for user to complete login');
        await this.page.waitForSelector('.user.side-bar-component .channel', {
          timeout: timeoutMs * 6
        });

        // Verify the text content
        const isLoggedIn = await this.page.evaluate(() => {
          const sidebarUser = document.querySelector('.user.side-bar-component .channel');
          return sidebarUser?.textContent?.trim() === '我';
        });

        if (!isLoggedIn) {
          logger.error('Login verification failed');
          throw new Error('Login verification failed');
        }

        logger.info('Login successful, saving cookies');
        // Save cookies after successful login
        const newCookies = await this.context.cookies();
        await this.cookieManager.saveCookies(newCookies);
        return;
      } catch (error) {
        logger.error(`Login attempt ${retryCount + 1} failed:`, error);
        // Clean up current session
        if (this.page) await this.page.close();
        if (this.context) await this.context.close();

        retryCount++;
        if (retryCount < maxRetries) {
          logger.info(`Retrying login in 2 seconds (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          logger.error('Login failed after maximum retries');
          throw new Error('Login failed after maximum retries');
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up browser resources');
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { AuthManager } from './auth/authManager'
import { RedNoteTools } from './tools/rednoteTools'
import logger, { LOGS_DIR, packLogs } from './utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createStdioLogger } from './utils/stdioLogger'

const execAsync = promisify(exec)

const name = 'rednote'
const description =
  'A friendly tool to help you access and interact with Xiaohongshu (RedNote) content through Model Context Protocol.'
const version = '0.2.3'

// Create server instance
const server = new McpServer({
  name,
  version,
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: true,
    sampling: {},
    roots: {
      listChanged: true
    }
  }
})

// Global RedNoteTools instance for browser reuse (Solution 1)
let globalRedNoteTools: RedNoteTools | null = null
let isInitializing = false

/**
 * Get or create the global RedNoteTools instance
 * This ensures we reuse the same browser instance across all requests
 */
async function getRedNoteTools(): Promise<RedNoteTools> {
  if (!globalRedNoteTools) {
    // Prevent concurrent initialization
    if (isInitializing) {
      logger.info('Waiting for existing initialization to complete')
      while (isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (globalRedNoteTools) return globalRedNoteTools
    }
    
    isInitializing = true
    try {
      logger.info('Creating global RedNoteTools instance')
      globalRedNoteTools = new RedNoteTools()
      // Pre-initialize to check login status
      await globalRedNoteTools.initialize()
      logger.info('Global RedNoteTools instance created and initialized')
    } finally {
      isInitializing = false
    }
  }
  return globalRedNoteTools
}

/**
 * Cleanup global instance on server shutdown
 */
async function cleanupGlobalTools(): Promise<void> {
  if (globalRedNoteTools) {
    logger.info('Cleaning up global RedNoteTools instance')
    await globalRedNoteTools.cleanup()
    globalRedNoteTools = null
  }
}

// Register tools
server.tool(
  'search_notes',
  '根据关键词搜索笔记',
  {
    keywords: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('返回结果数量限制')
  },
  async ({ keywords, limit = 10 }: { keywords: string; limit?: number }) => {
    logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)
    try {
      const tools = await getRedNoteTools() // Reuse global instance
      const notes = await tools.searchNotes(keywords, limit)
      logger.info(`Found ${notes.length} notes`)
      return {
        content: notes.map((note) => ({
          type: 'text',
          text: `标题: ${note.title}\n作者: ${note.author}\n内容: ${note.content}\n点赞: ${note.likes}\n评论: ${note.comments}\n链接: ${note.url}\n---`
        }))
      }
    } catch (error) {
      logger.error('Error searching notes:', error)
      throw error
    }
  }
)

server.tool(
  'get_note_content',
  '获取笔记内容',
  {
    url: z.string().describe('笔记 URL')
  },
  async ({ url }: { url: string }) => {
    logger.info(`Getting note content for URL: ${url}`)
    try {
      const tools = await getRedNoteTools() // Reuse global instance
      const note = await tools.getNoteContent(url)
      logger.info(`Successfully retrieved note: ${note.title}`)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(note)
          }
        ]
      }
    } catch (error) {
      logger.error('Error getting note content:', error)
      throw error
    }
  }
)

server.tool(
  'get_note_comments',
  '获取笔记评论',
  {
    url: z.string().describe('笔记 URL')
  },
  async ({ url }: { url: string }) => {
    logger.info(`Getting comments for URL: ${url}`)
    try {
      const tools = await getRedNoteTools() // Reuse global instance
      const comments = await tools.getNoteComments(url)
      logger.info(`Found ${comments.length} comments`)
      return {
        content: comments.map((comment) => ({
          type: 'text',
          text: `作者: ${comment.author}\n内容: ${comment.content}\n点赞: ${comment.likes}\n时间: ${comment.time}\n---`
        }))
      }
    } catch (error) {
      logger.error('Error getting note comments:', error)
      throw error
    }
  }
)

// Add login tool
server.tool('login', '登录小红书账号', {}, async () => {
  logger.info('Starting login process')
  const authManager = new AuthManager()
  try {
    await authManager.login()
    logger.info('Login successful')
    return {
      content: [
        {
          type: 'text',
          text: '登录成功！Cookie 已保存。'
        }
      ]
    }
  } catch (error) {
    logger.error('Login failed:', error)
    throw error
  } finally {
    await authManager.cleanup()
  }
})

// Add publish note tool
server.tool(
  'publish_note',
  '发布图文笔记到小红书',
  {
    title: z.string().describe('笔记标题'),
    content: z.string().describe('笔记内容'),
    image_paths: z.array(z.string()).describe('图片路径列表'),
    tags: z.string().optional().describe('标签，用逗号分隔')
  },
  async ({ title, content, image_paths, tags = '' }: { title: string; content: string; image_paths: string[]; tags?: string }) => {
    logger.info(`Publishing note: ${title}`)
    try {
      const tools = await getRedNoteTools()
      const result = await tools.publishNote(title, content, image_paths, tags)
      logger.info(`Note published successfully: ${result.message}`)
      return {
        content: [
          {
            type: 'text',
            text: `发布成功！\n标题: ${result.title}\n图片数量: ${result.imageCount}\n标签: ${result.tags || '无'}\n${result.message}`
          }
        ]
      }
    } catch (error) {
      logger.error('Error publishing note:', error)
      throw error
    }
  }
)

// Start the server
async function main() {
  logger.info('Starting RedNote MCP Server')

  // Start stdio logging
  const stopLogging = createStdioLogger(`${LOGS_DIR}/stdio.log`)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info('RedNote MCP Server running on stdio')

  // Cleanup on process exit
  process.on('exit', () => {
    stopLogging()
  })
  
  // Cleanup global tools on SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, cleaning up...')
    await cleanupGlobalTools()
    stopLogging()
    process.exit(0)
  })
  
  // Cleanup global tools on SIGTERM
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, cleaning up...')
    await cleanupGlobalTools()
    stopLogging()
    process.exit(0)
  })
}

// 检查是否在 stdio 模式下运行
if (process.argv.includes('--stdio')) {
  main().catch((error) => {
    logger.error('Fatal error in main():', error)
    process.exit(1)
  })
} else {
  const { Command } = require('commander')
  const program = new Command()

  program.name(name).description(description).version(version)

  program
    .command('init [timeout]')
    .description('Initialize and login to RedNote')
    .argument('[timeout]', 'Login timeout in seconds', (value: string) => parseInt(value, 10), 10)
    .usage('[options] [timeout]')
    .addHelpText('after', `
Examples:
  $ rednote-mcp init           # Login with default 10 seconds timeout
  $ rednote-mcp init 30        # Login with 30 seconds timeout
  $ rednote-mcp init --help    # Display help information

Notes:
  This command will launch a browser and open the RedNote login page.
  Please complete the login in the opened browser window.
  After successful login, the cookies will be automatically saved for future operations.
  The [timeout] parameter specifies the maximum waiting time (in seconds) for login, default is 10 seconds.
  The command will fail if the login is not completed within the specified timeout period.`)
    .action(async (timeout: number) => {
      logger.info(`Starting initialization process with timeout: ${timeout}s`)

      try {
        const authManager = new AuthManager()
        await authManager.login({ timeout })
        await authManager.cleanup()
        logger.info('Initialization successful')
        console.log('Login successful! Cookie has been saved.')
        process.exit(0)
      } catch (error) {
        logger.error('Error during initialization:', error)
        console.error('Error during initialization:', error)
        process.exit(1)
      }
    })

  program
    .command('pack-logs')
    .description('Pack all log files into a zip file')
    .action(async () => {
      try {
        const zipPath = await packLogs()
        console.log(`日志已打包到: ${zipPath}`)
        process.exit(0)
      } catch (error) {
        console.error('打包日志失败:', error)
        process.exit(1)
      }
    })

  program
    .command('open-logs')
    .description('Open the logs directory in file explorer')
    .action(async () => {
      try {
        let command
        switch (process.platform) {
          case 'darwin': // macOS
            command = `open "${LOGS_DIR}"`
            break
          case 'win32': // Windows
            command = `explorer "${LOGS_DIR}"`
            break
          case 'linux': // Linux
            command = `xdg-open "${LOGS_DIR}"`
            break
          default:
            throw new Error(`Unsupported platform: ${process.platform}`)
        }

        await execAsync(command)
        console.log(`日志目录已打开: ${LOGS_DIR}`)
        process.exit(0)
      } catch (error) {
        console.error('打开日志目录失败:', error)
        process.exit(1)
      }
    })

  program.parse(process.argv)
}

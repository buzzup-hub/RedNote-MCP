import { RedNoteTools, Note, Comment } from '../rednoteTools'

// npm run test
describe('RedNoteTools', () => {
  let redNoteTools = new RedNoteTools()

  afterAll(async () => {
    await redNoteTools.cleanup()
  })

  // 这是一个集成测试，需要真实的登录状态和有效的笔记 URL
  // 如果遇到 404 或风控错误，请：
  // 1. 在浏览器中手动访问小红书并登录
  // 2. 找到一篇可以正常访问的公开笔记
  // 3. 复制 URL 并替换下面的测试 URL
  // 4. 确保运行过 'node dist/cli.js init' 保存了有效的 cookies
  test.skip('getNoteContent 应该返回笔记详情', async () => {
    // ⚠️ 注意：
    // - 这个测试默认被跳过（test.skip），因为它需要真实环境
    // - 要运行此测试，将 test.skip 改为 test
    // - URL 需要是一个真实可访问的笔记链接
    const url = 'https://www.xiaohongshu.com/explore/YOUR_NOTE_ID_HERE' // 需要替换为实际笔记URL

    const actualURL = redNoteTools.extractRedBookUrl(url)
    const note = await redNoteTools.getNoteContent(actualURL)
    console.log(note)
    expect(note).toBeDefined()
    expect(note.title).toBeTruthy()
    expect(note.content).toBeTruthy()
  }, 600000)

  test('extractRedBookUrl 应该正确提取小红书链接', () => {
    // 测试 xhslink.com 短链接提取
    const shareText1 = '【小红书】http://xhslink.com/abc123 快来看看'
    expect(redNoteTools.extractRedBookUrl(shareText1)).toBe('http://xhslink.com/abc123')

    // 测试 xiaohongshu.com 链接提取
    const shareText2 = '分享 https://www.xiaohongshu.com/explore/123456 给你'
    expect(redNoteTools.extractRedBookUrl(shareText2)).toBe('https://www.xiaohongshu.com/explore/123456')

    // 测试直接传入链接
    const directUrl = 'https://www.xiaohongshu.com/explore/789012'
    expect(redNoteTools.extractRedBookUrl(directUrl)).toBe(directUrl)

    // 测试无匹配情况
    const noMatch = 'this is just text'
    expect(redNoteTools.extractRedBookUrl(noMatch)).toBe(noMatch)
  })
})

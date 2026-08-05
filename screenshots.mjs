import { chromium } from '@playwright/test';

const BASE = 'http://localhost:8443';
const OUT = 'public/screenshots';

const TOOLS = [
  { key: 'seedance', file: 'hero.png', desc: 'Seedance 计费 — 主封面' },
  { key: 'json', file: 'json-diff.png', desc: 'JSON 可视化 & Diff' },
  { key: 'timestamp', file: 'timestamp.png', desc: '时间戳转换' },
  { key: 'imganalyze', file: 'image-analyzer.png', desc: '图片信息识别' },
  { key: 'base64', file: 'base64.png', desc: 'Base64 编解码' },
  { key: 'idgen', file: 'idgen.png', desc: 'ID 生成器' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Set light theme
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('dev-toolkit-theme', 'light'));
  await page.reload();
  await page.waitForTimeout(500);

  // === Screenshot 1: Seedance 计费 (hero) ===
  console.log('📸 hero.png — Seedance 计费');
  await page.goto(BASE);
  await page.waitForTimeout(300);
  // Fill in some values to show the result
  const inputs = page.locator('input[type="number"]');
  const inputCount = await inputs.count();
  for (let i = 0; i < inputCount; i++) {
    const val = await inputs.nth(i).inputValue();
    if (val === '200000' || val === '') {
      await inputs.nth(i).fill('500000');
      break;
    }
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/hero.png`, fullPage: false });

  // === Screenshot 2: JSON 可视化 & Diff ===
  console.log('📸 json-diff.png — JSON 可视化');
  await page.evaluate(() => {
    const nav = document.querySelectorAll('nav button');
    const jsonBtn = Array.from(nav).find(b => b.textContent?.includes('JSON'));
    if (jsonBtn) (jsonBtn).click();
  });
  await page.waitForTimeout(500);
  // Fill in left JSON
  const textareas = page.locator('textarea');
  const leftTa = textareas.first();
  await leftTa.fill(JSON.stringify({ name: 'Alice', age: 30, city: 'Beijing', role: 'admin', active: true }, null, 2));
  await page.waitForTimeout(300);
  // Click A/B对比
  const abBtn = page.locator('button', { hasText: 'A/B 对比' });
  if (await abBtn.isVisible()) {
    await abBtn.click();
    await page.waitForTimeout(300);
  }
  // Fill right JSON
  const rightTa = textareas.nth(1);
  await rightTa.fill(JSON.stringify({ name: 'Alice', age: 25, city: 'Shanghai', role: 'user', active: true }, null, 2));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/json-diff.png`, fullPage: false });

  // === Screenshot 3: 时间戳转换 ===
  console.log('📸 timestamp.png — 时间戳转换');
  await page.evaluate(() => {
    const nav = document.querySelectorAll('nav button');
    const btn = Array.from(nav).find(b => b.textContent?.includes('时间戳'));
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(500);
  // Fill timestamp
  await page.fill('input[placeholder="输入时间戳，如 1705289400000"]', '1722777600000');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/timestamp.png`, fullPage: false });

  // === Screenshot 4: 图片信息识别 ===
  console.log('📸 image-analyzer.png — 图片信息识别');
  await page.evaluate(() => {
    const nav = document.querySelectorAll('nav button');
    const btn = Array.from(nav).find(b => b.textContent?.includes('图片'));
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(500);

  // Load example images
  const exampleBtns = page.locator('button', { hasText: '示例' });
  const exampleCount = await exampleBtns.count();
  for (let i = 0; i < Math.min(exampleCount, 3); i++) {
    await exampleBtns.nth(i).click();
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/image-analyzer.png`, fullPage: false });

  // === Screenshot 5: Base64 编解码 ===
  console.log('📸 base64.png — Base64 编解码');
  await page.evaluate(() => {
    const nav = document.querySelectorAll('nav button');
    const btn = Array.from(nav).find(b => b.textContent?.includes('Base64'));
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(500);
  const base64Textareas = page.locator('textarea');
  await base64Textareas.first().fill('Hello, Dev Toolkit! 你好，开发者工具包！');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/base64.png`, fullPage: false });

  // === Screenshot 6: ID 生成器 ===
  console.log('📸 idgen.png — ID 生成器');
  await page.evaluate(() => {
    const nav = document.querySelectorAll('nav button');
    const btn = Array.from(nav).find(b => b.textContent?.includes('ID'));
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/idgen.png`, fullPage: false });

  // === Screenshot 7: 深色主题 ===
  console.log('📸 dark-theme.png — 深色主题');
  // Switch to dark theme
  await page.evaluate(() => {
    localStorage.setItem('dev-toolkit-theme', 'dark');
    window.location.reload();
  });
  await page.waitForTimeout(500);
  // Navigate to JSON
  await page.evaluate(() => {
    const nav = document.querySelectorAll('nav button');
    const btn = Array.from(nav).find(b => b.textContent?.includes('JSON'));
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(500);
  const leftTaDark = page.locator('textarea').first();
  await leftTaDark.fill(JSON.stringify({ framework: 'React', version: 19, features: ['Vite', 'Tailwind', 'Recharts'] }, null, 2));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/dark-theme.png`, fullPage: false });

  // === Screenshot 8: LLM 批量测试 (配置界面) ===
  console.log('📸 llmbatch.png — LLM 批量测试');
  await page.evaluate(() => {
    localStorage.setItem('dev-toolkit-theme', 'light');
    window.location.reload();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const nav = document.querySelectorAll('nav button');
    const btn = Array.from(nav).find(b => b.textContent?.includes('LLM'));
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/llmbatch.png`, fullPage: false });

  await browser.close();
  console.log('✅ All screenshots saved to public/screenshots/');
}

run().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
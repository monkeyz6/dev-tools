import { Page, Locator } from '@playwright/test'

/** 字段容器：Label 的父级 div（内含 label + 控件） */
export const fieldOf = (page: Page, label: string): Locator =>
  page.locator(`label:has-text("${label}")`).locator('..')

/** 按字段标签定位输入框 */
export const inputByLabel = (page: Page, label: string): Locator =>
  fieldOf(page, label).locator('input')

/** 按字段标签定位自绘下拉的触发按钮（CustomSelect 是 button + 绝对定位下拉） */
export const selectByLabel = (page: Page, label: string): Locator =>
  fieldOf(page, label).getByRole('button').first()

/** 打开下拉并选择某个选项：把选择范围限定在该字段容器内，避免命中其他字段的触发钮/选项 */
export async function selectOption(page: Page, label: string, option: string): Promise<void> {
  const field = fieldOf(page, label)
  await field.getByRole('button').first().click()
  await field.getByRole('button', { name: option, exact: true }).last().click()
}

/** 通过侧栏导航进入某个工具 */
export async function goto(page: Page, navText: RegExp | string): Promise<void> {
  await page.goto('/')
  await page.getByRole('link', { name: navText }).first().click()
}

/**
 * 读取共享历史记录 IndexedDB（dev-toolkit-history）里某个工具的 store 全部记录。
 * LLM 批量测试 / 模型探测 / 图片接口测试的历史记录都已从 localStorage 迁移到这里，
 * store 名分别是 'llmbatch' / 'modelprobe' / 'imgtest'。
 */
export function readHistoryStore(page: Page, store: string): Promise<any[]> {
  return page.evaluate(store => new Promise<any[]>((resolve, reject) => {
    const req = indexedDB.open('dev-toolkit-history')
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(store)) { resolve([]); return }
      const tx = db.transaction(store, 'readonly')
      const getReq = tx.objectStore(store).getAll()
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => reject(getReq.error)
    }
    req.onerror = () => reject(req.error)
  }), store)
}

import { useEffect, useRef } from 'react'

/**
 * 防抖持久化：deps 变化后延迟 delay 毫秒执行 fn（合并高频写入，避免每次击键
 * 都 JSON.stringify 整份数据写盘）；组件卸载时若还有未落盘的变更立即补写，不丢数据。
 */
export function useDebouncedPersist(fn: () => void, deps: readonly unknown[], delay = 400): void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const pending = useRef(false)

  useEffect(() => {
    pending.current = true
    const timer = window.setTimeout(() => {
      pending.current = false
      fnRef.current()
    }, delay)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => () => {
    if (pending.current) {
      pending.current = false
      fnRef.current()
    }
  }, [])
}

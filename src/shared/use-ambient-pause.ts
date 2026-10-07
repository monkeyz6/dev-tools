import { useEffect } from 'react'

// 有测试在跑时暂停背景光斑漂移（index.css 的 :root[data-tool-busy]）：
// 光斑在动，叠在上面的每层 backdrop-filter 每帧都得重新模糊，运行期频繁重渲染时 GPU 负担被放大。
// 引用计数：同一时刻可能有多个调用方（例如运行与单格重试）。
let busyCount = 0

function sync() {
  if (typeof document === 'undefined') return
  if (busyCount > 0) document.documentElement.dataset.toolBusy = '1'
  else delete document.documentElement.dataset.toolBusy
}

export function useAmbientPause(active: boolean): void {
  useEffect(() => {
    if (!active) return
    busyCount++
    sync()
    return () => {
      busyCount = Math.max(0, busyCount - 1)
      sync()
    }
  }, [active])
}

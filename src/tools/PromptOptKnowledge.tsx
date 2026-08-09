import React, { useState } from 'react'
import { Badge, CopyBtn } from '../shared/ui'
import { IconChevron } from '../shared/icons'
import { FRAMEWORKS, CORE_ELEMENTS, type FrameworkId } from '../shared/prompt-frameworks'

const MONO = '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace'

const COLORS = ['var(--accent)', 'var(--accent)', 'var(--warn)', 'var(--accent)', 'var(--accent)', 'var(--accent)']

function FrameworkBlock({ fw, color }: { fw: (typeof FRAMEWORKS)[number]; color: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--s1)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer border-0 outline-none bg-transparent"
        style={{ color: 'var(--text)' }}
      >
        <span className="text-sm font-bold flex-shrink-0" style={{ color, minWidth: 64 }}>{fw.abbr}</span>
        <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--t2)' }}>{fw.fullName}</span>
        <Badge>{fw.tagline}</Badge>
        <span style={{ color: 'var(--t3)' }}><IconChevron open={open} /></span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {fw.fields.map(f => (
              <div key={f.key} className="min-w-0">
                <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>{f.name} <span style={{ color, fontWeight: 600 }}>{f.cn}</span></p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--t3)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl overflow-hidden" style={{ background: 'var(--code)', border: '1px solid var(--inputBorder)' }}>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] tracking-wide" style={{ color: 'var(--t3)', letterSpacing: '0.06em' }}>TEXT · {fw.abbr}</span>
              <CopyBtn text={fw.example} />
            </div>
            <pre className="px-3 pb-3 overflow-x-auto text-[11.5px] leading-relaxed" style={{ color: 'var(--text)', fontFamily: MONO, margin: 0 }}>{fw.example}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function PromptOptKnowledge() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>六种框架概览</p>
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--s1)' }}>
          <table className="w-full text-xs min-w-[520px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--t3)' }}>
                <th className="px-3 py-2 text-left font-semibold">框架</th>
                <th className="px-3 py-2 text-left font-semibold">全称</th>
                <th className="px-3 py-2 text-left font-semibold">要素</th>
                <th className="px-3 py-2 text-left font-semibold">一句话定位</th>
              </tr>
            </thead>
            <tbody>
              {FRAMEWORKS.map(fw => (
                <tr key={fw.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--accent)' }}>{fw.abbr}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t2)' }}>{fw.fullName}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t2)' }}>{fw.fields.length}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t2)' }}>{fw.tagline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>框架详解 <span className="font-normal" style={{ color: 'var(--t3)' }}>点击展开要素释义与完整示例</span></p>
        {FRAMEWORKS.map((fw, i) => <FrameworkBlock key={fw.id} fw={fw} color={COLORS[i % COLORS.length]} />)}
      </div>

      <div>
        <p className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>框架对比与选型</p>
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--s1)' }}>
          <table className="w-full text-xs min-w-[520px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--t3)' }}>
                <th className="px-3 py-2 text-left font-semibold">框架</th>
                <th className="px-3 py-2 text-left font-semibold">核心特色</th>
                <th className="px-3 py-2 text-left font-semibold">典型适用场景</th>
                <th className="px-3 py-2 text-left font-semibold">复杂度</th>
              </tr>
            </thead>
            <tbody>
              {FRAMEWORKS.map(fw => (
                <tr key={fw.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--accent)' }}>{fw.abbr}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t2)' }}>{fw.coreFeature}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t2)' }}>{fw.bestFor}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--t2)' }}>{fw.complexity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>万变不离其宗：四大核心要素</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CORE_ELEMENTS.map(el => (
            <div key={el.index} className="rounded-xl px-4 py-3.5" style={{ border: '1px solid var(--border)', background: 'var(--s1)' }}>
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'var(--accent)', letterSpacing: '0.12em' }}>{el.index}</p>
              <p className="text-sm font-bold mt-1" style={{ color: 'var(--text)' }}>{el.title}</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--t3)' }}>{el.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl px-4 py-3 text-xs leading-relaxed" style={{ border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--accentSub), var(--s1))', color: 'var(--t2)' }}>
          抓住四大核心要素灵活运用即可，不必拘泥框架名称。输出不理想时，<b style={{ color: 'var(--text)' }}>针对性调整角色、任务、上下文或格式</b>，形成「编写 → 发送 → 验证 → 调整」的迭代循环，直到输出稳定满足目标。
        </div>
      </div>
    </div>
  )
}

export default PromptOptKnowledge

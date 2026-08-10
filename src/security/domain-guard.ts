const ALLOWED_HOSTS = ['cvking.cn', 'localhost', '127.0.0.1']

export function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`),
  )
}

/** 校验当前域名，未授权时清空页面，返回是否放行 */
export function guardHost(): boolean {
  const hostname = window.location.hostname
  if (isAllowedHost(hostname)) return true
  document.body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#888;">未授权部署，请访问官方地址</div>'
  return false
}

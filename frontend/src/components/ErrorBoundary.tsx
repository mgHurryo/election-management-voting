import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Intentionally no telemetry/logging: do not capture credentials or ballot data.
  }
  render() {
    if (this.state.failed)
      return (
        <section className="state" role="alert">
          <h1>页面暂时无法显示</h1>
          <p>请重新加载页面。若问题持续，请联系维护人员。</p>
          <button onClick={() => window.location.reload()}>重新加载</button>
        </section>
      )
    return this.props.children
  }
}

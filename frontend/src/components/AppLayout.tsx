import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../hooks/useAuth'
export function AppLayout() {
  const { user, signOut } = useAuth()
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳至主要内容
      </a>
      <header className="app-header">
        <NavLink to="/" className="brand">
          选举管理与投票系统
        </NavLink>
        <span className="label">前端框架</span>
      </header>
      <div className="app-body">
        <nav className="navigation" aria-label="主导航">
          <NavLink to="/" end>
            框架首页
          </NavLink>
          <NavLink to="/elections">选举模块</NavLink>
          {user?.role === 'ADMIN' && <NavLink to="/elections/new">创建选举</NavLink>}
          {user ? (
            <button onClick={signOut}>退出登录</button>
          ) : (
            <NavLink to="/login">登录模块</NavLink>
          )}
        </nav>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <footer>
        React · TypeScript · REST API <span>业务功能待实现</span>
      </footer>
    </div>
  )
}

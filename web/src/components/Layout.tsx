import { NavLink, Outlet } from 'react-router-dom';
import { AIR_URL, AUTHOR, GITHUB_URL } from '../config';
import { useTheme } from '../useTheme';

const LINKS = [
  { to: '/', label: 'Estimate', end: true },
  { to: '/lab', label: 'Model Lab', end: false },
  { to: '/data', label: 'Data', end: false },
];

export function Layout() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'asphalt';
  return (
    <div className={dark ? 'app t dark' : 'app t'} data-theme={theme}>
      <header className="site-header">
        <div className="site-header__inner">
          <NavLink to="/" className="brand">
            Tehran House Price
          </NavLink>
          <nav aria-label="Main" className="pills">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className="pill">
                {l.label}
              </NavLink>
            ))}
            <button type="button" className="theme-toggle" onClick={toggle}>
              {dark ? 'Light' : 'Asphalt'}
            </button>
          </nav>
        </div>
      </header>
      <Outlet />
      <footer className="site-footer">
        <div className="site-footer__inner">
          <span>
            Built by {AUTHOR}. Data: Divar real estate ads, ODbL. City outline: © OpenStreetMap contributors, ODbL.
            {GITHUB_URL ? (
              <>
                {' '}
                <a href={GITHUB_URL}>GitHub</a>
              </>
            ) : null}
          </span>
          {AIR_URL ? <a href={AIR_URL}>Next project: Tehran Air Risk</a> : null}
        </div>
      </footer>
    </div>
  );
}

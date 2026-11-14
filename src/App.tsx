import { useEffect } from 'react';

let booted = false;

export default function App() {
  useEffect(() => {
    if (booted) return;
    booted = true;

    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(s);
      });

    (async () => {
      try {
        if (!localStorage.getItem('parallel_clean_init_v3')) {
          localStorage.removeItem('parallel-portable-v2');
          localStorage.removeItem('parallel_portable_v1');
          localStorage.removeItem('parallel-active-profile');
          localStorage.setItem('parallel_clean_init_v3', '1');
        }
      } catch {
        // ignore storage errors
      }

      await loadScript('/parallel/offline.js');
      await loadScript('/parallel/app.js');
    })();
  }, []);

  return (
    <>
      <div className="backdrop">
        <div className="orb orb-a"></div>
        <div className="orb orb-b"></div>
        <div className="orb orb-c"></div>
      </div>

      <div id="app" className="shell">
        <aside className="sidebar glass">
          <div className="brand">
            <div className="brand-logo">
              <svg
                viewBox="0 0 48 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19.4 38.8c-4.8-3.7-9.2-7.3-10.6-11.9c-1-3.4.7-6.5 3.7-7.1c2.8-.4 5.3 1.2 6.9 3.7c1.5-2.6 4.1-4.2 6.8-3.7c3.1.7 4.8 3.7 3.7 7.1c-1.4 4.7-5.8 8.3-10.5 11.9M34.3 9.2c.5 1.4.7 2.8.9 4.3c1.5.1 2.9.5 4.3 1c-1.4.4-2.8.8-4.4.9c-.1 1.5-.3 2.9-.9 4.3q-.6-2.1-.9-4.2c-1.5-.2-3-.6-4.3-1.1q1.95-.75 4.2-.9c.3-1.5.6-2.9 1.1-4.3" />
              </svg>
            </div>
            <div>
              <div className="brand-name">
                parallel<span>.</span>
              </div>
              <div className="brand-sub">ANOTHER WORLD, ANOTHER YOU.</div>
            </div>
          </div>

          <div className="sidebar-label">EXPLORE YOUR STORY</div>
          <nav id="side-nav" className="side-nav"></nav>
          <div className="sidebar-spacer"></div>
          <div className="sidebar-note">
            <span className="dot"></span>
            <div>
              <b>一个人，很多个宇宙。</b>
              <p>每个角色保留来时的故事，也记得与你经历的故事。</p>
            </div>
          </div>
          <div className="sidebar-footer" id="sidebar-current"></div>
        </aside>

        <section className="main-panel glass">
          <header className="topbar">
            <div className="topbar-title">
              <div className="eyebrow" id="section-eyebrow">
                WELCOME TO PARALLEL
              </div>
              <h1 id="section-title">发现心动</h1>
            </div>
            <div className="topbar-actions" id="topbar-actions"></div>
          </header>

          <main id="view" className="main-view"></main>
          <nav id="mobile-nav" className="mobile-nav glass"></nav>
        </section>

        <aside className="right-panel">
          <div className="right-top">
            <span className="overline">THE LITTLE DETAILS</span>
            <span className="status-pill" id="mode-pill">
              演示模式
            </span>
          </div>
          <div className="quote-card glass">
            <span className="quote-mark">“</span>
            <p>同一个人，下一次遇见时，依然记得上一次的你。</p>
            <span className="quote-by">THE PARALLEL RULE</span>
          </div>
          <div className="side-info glass" id="side-info"></div>
          <div className="right-footer">
            PARALLEL / AN EARLY LOCAL PROTOTYPE
            <br />
            FICTIONAL CHARACTERS ONLY · 18+
          </div>
        </aside>
      </div>

      <div id="toast" role="status" aria-live="polite"></div>
      <div id="modal-root"></div>
    </>
  );
}




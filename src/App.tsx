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
              <img
                src="/assets/aistudio/image_0cf832e3.png"
                alt="Parallel"
                className="brand-logo-img"
              />
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
              正常模式 · 未连接 API
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

const NAV_TEMPLATE = `
  <header class="marketing-header">
    <a href="/" class="marketing-logo" aria-label="FreeSurf Post home">
      <svg class="logo-mark" viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="card-mask-nav" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="#ffffff"/><rect x="44" y="24" width="34" height="60" rx="7" transform="rotate(8 61 54)" fill="#000000" stroke="#000000" stroke-width="6"/></mask></defs><g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"><rect x="18" y="12" width="34" height="68" rx="7" transform="rotate(-12 35 46)" mask="url(#card-mask-nav)"/><rect x="44" y="24" width="34" height="60" rx="7" transform="rotate(8 61 54)"/></g></svg>
      <span>FreeSurf Post</span>
    </a>
    <button class="marketing-menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav-menu">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <nav class="marketing-nav" id="nav-menu">
      <div class="marketing-group">
        <button class="marketing-link marketing-toggle" type="button" aria-expanded="false" aria-controls="nav-resources">
          Resources
          <svg class="marketing-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="marketing-dropdown" id="nav-resources">
          <a href="/resources/">All resources</a>
          <a href="/resources/#comparisons">Comparisons</a>
          <a href="/resources/#social-media-apis">Social Media APIs</a>
          <a href="/llms.txt">LLMs.txt</a>
        </div>
      </div>
      <a class="marketing-link" href="/#pricing">Pricing</a>
      <a class="marketing-link marketing-cta" href="/#auth">Sign in / Sign up</a>
    </nav>
  </header>
`;

class FreeSurfPostNav extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === "true") return;
    this.dataset.rendered = "true";
    this.style.display = "block";
    this.innerHTML = NAV_TEMPLATE;

    const menuBtn = this.querySelector(".marketing-menu-btn");
    const nav = this.querySelector(".marketing-nav");
    const resourcesBtn = this.querySelector(".marketing-toggle");
    const resources = this.querySelector(".marketing-dropdown");

    const closeAll = () => {
      nav.classList.remove("open");
      resources.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.setAttribute("aria-label", "Open menu");
      resourcesBtn.setAttribute("aria-expanded", "false");
    };

    menuBtn.addEventListener("click", () => {
      const open = !nav.classList.contains("open");
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    resourcesBtn.addEventListener("click", () => {
      const open = !resources.classList.contains("open");
      resources.classList.toggle("open", open);
      resourcesBtn.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", (event) => {
      if (!this.contains(event.target)) closeAll();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAll();
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeAll();
    });
  }
}

if (!customElements.get("freesurf-post-nav")) {
  customElements.define("freesurf-post-nav", FreeSurfPostNav);
}

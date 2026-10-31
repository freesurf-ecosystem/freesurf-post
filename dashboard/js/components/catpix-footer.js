const FOOTER_TEMPLATE = `
  <footer class="freesurf-footer">
    <div class="freesurf-footer-inner">
      <div class="freesurf-footer-brand">
        <a href="https://catpix.app" class="freesurf-footer-logo"><svg class="logo-mark" viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="card-mask-footer" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="#ffffff"/><rect x="44" y="24" width="34" height="60" rx="7" transform="rotate(8 61 54)" fill="#000000" stroke="#000000" stroke-width="6"/></mask></defs><g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"><rect x="18" y="12" width="34" height="68" rx="7" transform="rotate(-12 35 46)" mask="url(#card-mask-footer)"/><rect x="44" y="24" width="34" height="60" rx="7" transform="rotate(8 61 54)"/></g></svg>Catpix</a>
        <p class="freesurf-footer-tagline">Catpix is a social media scheduler developed by FreeSurf. We create free tools for freelancers, small businesses, and independent workers.</p>
      </div>
      <div class="freesurf-footer-links">
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Resources</span>
          <a href="/resources/">All resources</a>
          <a href="/resources/#comparisons">Comparisons</a>
          <a href="/resources/#platform-schedulers">Platform API &amp; schedulers</a>
        </div>
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Newsletter</span>
          <a href="https://feedfree.tech" target="_blank" rel="noopener">Feedfree Digest</a>
        </div>
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">FreeSurf tools</span>
          <a href="https://invoices.freesurf.tools">Invoices</a>
          <a href="https://links.freesurf.tools">Link-in-bio</a>
          <a href="https://transcribe.freesurf.tools">Meeting Transcriber</a>
          <a href="https://calories.freesurf.tools">Calorie Tracker</a>
        </div>
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Platform</span>
          <a href="https://catpix.app">Home</a>
          <a href="https://github.com/freesurf-ecosystem/catpix">GitHub</a>
          <a href="https://post.freesurf.tools/llms.txt">API reference</a>
        </div>
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Legal</span>
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          <a href="mailto:support@freesurf.tools">Support</a>
        </div>
      </div>
    </div>
    <div class="freesurf-footer-bottom">
      <span>&copy; <span class="freesurf-footer-year"></span> Catpix by FreeSurf. Built for independent workers.</span>
    </div>
  </footer>
`;

class CatpixFooter extends HTMLElement {
  static get observedAttributes() {
    return ["theme-toggle"];
  }

  connectedCallback() {
    if (this.dataset.rendered === "true") return;
    this.dataset.rendered = "true";
    this.style.display = "block";
    this.innerHTML = FOOTER_TEMPLATE;

    const year = this.querySelector(".freesurf-footer-year");
    if (year) year.textContent = String(new Date().getFullYear());

    if (this.hasAttribute("theme-toggle")) {
      this.mountThemeToggle();
    }
  }

  mountThemeToggle() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "footer-theme-toggle";
    button.id = "btn-theme-toggle";
    button.title = "Toggle dark mode";
    button.setAttribute("aria-label", "Toggle dark mode");
    button.textContent = "◐";

    const bottom = this.querySelector(".freesurf-footer-bottom");
    if (bottom) bottom.appendChild(button);

    const applyTheme = (theme) => {
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
    };

    applyTheme(localStorage.getItem("freesurf-theme"));

    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "" : "dark";
      applyTheme(next);
      localStorage.setItem("freesurf-theme", next);
    });
  }
}

if (!customElements.get("catpix-footer")) {
  customElements.define("catpix-footer", CatpixFooter);
}

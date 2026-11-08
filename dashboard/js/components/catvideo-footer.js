const FOOTER_TEMPLATE = `
  <footer class="freesurf-footer">
    <div class="freesurf-footer-inner">
      <div class="freesurf-footer-brand">
        <a href="https://catvideo.app" class="freesurf-footer-logo"><svg class="logo-mark" viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="card-mask-footer" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="#ffffff"/><rect x="44" y="24" width="34" height="60" rx="7" transform="rotate(8 61 54)" fill="#000000" stroke="#000000" stroke-width="6"/></mask></defs><g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"><rect x="18" y="12" width="34" height="68" rx="7" transform="rotate(-12 35 46)" mask="url(#card-mask-footer)"/><rect x="44" y="24" width="34" height="60" rx="7" transform="rotate(8 61 54)"/></g></svg>CatVideo</a>
        <p class="freesurf-footer-tagline">CatVideo is a social media scheduler developed by FreeSurf. We create free tools for freelancers, small businesses, and independent workers.</p>
      </div>
      <div class="freesurf-footer-links">
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Resources</span>
          <a href="/resources/#comparisons">Comparisons</a>
          <a href="/llms.txt" title="Machine-readable information for LLMs">LLMs.txt</a>
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
        </div>
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Platform</span>
          <a href="https://catvideo.app">Home</a>
          <a href="https://github.com/freesurf-ecosystem/catvideo">GitHub</a>
          <a href="https://post.freesurf.tools/llms.txt">API reference</a>
        </div>
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Review Us</span>
          <a href="https://play.google.com/store/apps/details?id=tools.freesurf.post" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;" aria-label="Rate CatVideo on Google Play">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none"/></svg>
            Google Play
          </a>
          <a href="https://www.producthunt.com/products/catvideo?launch=catvideo" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;" aria-label="Review CatVideo on Product Hunt">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8v8 M10 8h3a2.5 2.5 0 0 1 0 5h-3"/></svg>
            Product Hunt
          </a>
          <a href="https://www.trustpilot.com/review/catvideo.app" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;" aria-label="Review CatVideo on Trustpilot">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Trustpilot
          </a>
          <a href="https://www.g2.com/products/catvideo/reviews" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;" aria-label="Review CatVideo on G2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-family="Arial, sans-serif" font-weight="700" fill="currentColor" stroke="none">G2</text></svg>
            G2
          </a>
          <a href="https://www.capterra.com/p/10283793/CatVideo/" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;" aria-label="Review CatVideo on Capterra">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M16.5 9.5a5 5 0 1 0 0 5"/></svg>
            Capterra
          </a>
        </div>
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Legal</span>
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          <a href="/support/">Support</a>
        </div>
      </div>
    </div>
    <div class="freesurf-footer-bottom">
      <span>&copy; <span class="freesurf-footer-year"></span> CatVideo by FreeSurf. Built for independent workers.</span>
    </div>
  </footer>
`;

class CatVideoFooter extends HTMLElement {
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

if (!customElements.get("catvideo-footer")) {
  customElements.define("catvideo-footer", CatVideoFooter);
}

const FOOTER_TEMPLATE = `
  <footer class="freesurf-footer">
    <div class="freesurf-footer-inner">
      <div class="freesurf-footer-brand">
        <a href="https://post.freesurf.tools" class="freesurf-footer-logo"><svg class="logo-mark" viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="card-mask-footer" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="#ffffff"/><rect x="44" y="24" width="34" height="60" rx="7" transform="rotate(8 61 54)" fill="#000000" stroke="#000000" stroke-width="6"/></mask></defs><g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"><rect x="18" y="12" width="34" height="68" rx="7" transform="rotate(-12 35 46)" mask="url(#card-mask-footer)"/><rect x="44" y="24" width="34" height="60" rx="7" transform="rotate(8 61 54)"/></g></svg>FreeSurf Post</a>
        <p class="freesurf-footer-tagline">FreeSurf Post is a social media scheduler and part of the FreeSurf ecosystem of products. We create free tools for freelancers, small businesses, and independent workers.</p>
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
          <a href="https://post.freesurf.tools">Home</a>
          <a href="https://post.freesurf.tools/llms.txt">API reference</a>
        </div>
        <div class="freesurf-footer-col">
          <span class="freesurf-footer-heading">Review Us</span>
          <a href="https://play.google.com/store/apps/details?id=tools.freesurf.post" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;" aria-label="Rate FreeSurf Post on Google Play">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none"/></svg>
            Google Play
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
      <span>&copy; <span class="freesurf-footer-year"></span> FreeSurf Post. Built for independent workers.</span>
    </div>
  </footer>
`;

class FreeSurfPostFooter extends HTMLElement {
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

if (!customElements.get("freesurf-post-footer")) {
  customElements.define("freesurf-post-footer", FreeSurfPostFooter);
}

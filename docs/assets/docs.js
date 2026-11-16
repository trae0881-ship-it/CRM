(() => {
  const pages = [
    { file: "index.html", title: "Documentation home" },
    { file: "DOMAIN_SETUP.html", title: "Domain setup" },
    { file: "CUSTOM_DOMAIN_CONNECTION.html", title: "Custom domain connection" },
    { file: "AUTOMATIC_LINK_GENERATION.html", title: "Automatic link generation" },
    { file: "DNS_CONFIGURATION.html", title: "DNS configuration" },
    { file: "DOMAIN_TROUBLESHOOTING.html", title: "Domain troubleshooting" },
    { file: "SEO_LINK_CONFIGURATION.html", title: "SEO and link configuration" },
  ];
  const sidebar = document.querySelector(".guide-sidebar");
  const toggle = document.querySelector(".guide-mobile-toggle");
  toggle?.addEventListener("click", () => {
    const expanded = sidebar?.classList.toggle("is-open") ?? false;
    toggle.setAttribute("aria-expanded", String(expanded));
  });

  const copyText = async (value, button) => {
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1600);
    } catch {
      button.textContent = "Copy manually";
    }
  };
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (target) void copyText(target.innerText, button);
    });
  });

  const search = document.querySelector("[data-doc-search]");
  const results = document.querySelector("[data-doc-search-results]");
  let pageContent;
  const loadPages = async () => {
    if (pageContent) return pageContent;
    pageContent = Promise.all(pages.map(async (page) => {
      try {
        const response = await fetch(page.file);
        if (!response.ok) return { ...page, text: "" };
        const source = await response.text();
        const parsed = new DOMParser().parseFromString(source, "text/html");
        return { ...page, text: parsed.body.textContent.toLowerCase() };
      } catch {
        return { ...page, text: "" };
      }
    }));
    return pageContent;
  };
  search?.addEventListener("input", async () => {
    const query = search.value.trim().toLowerCase();
    if (!results) return;
    results.replaceChildren();
    if (!query) return;
    const found = (await loadPages()).filter((page) => page.title.toLowerCase().includes(query) || page.text.includes(query));
    if (!found.length) {
      results.textContent = "No matching guide pages.";
      return;
    }
    found.forEach((page) => {
      const link = document.createElement("a");
      link.href = page.file;
      link.textContent = page.title;
      link.className = "guide-search-result";
      results.append(link, document.createElement("br"));
    });
  });
})();

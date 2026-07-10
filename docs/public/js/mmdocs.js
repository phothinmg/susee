// function giscusTheme(theme) {
//   const iframe = document.querySelector(".giscus-frame");
//   if (!iframe) {
//     return;
//   }

//   iframe.contentWindow?.postMessage(
//     {
//       giscus: {
//         setConfig: {
//           theme,
//         },
//       },
//     },
//     "https://giscus.app",
//   );
// }

// function giscusInit(theme) {
//   const container = document.getElementById("giscus-thread");
//   if (!container || container.querySelector("script[data-giscus-script]")) {
//     return;
//   }

//   const requiredConfig = [
//     ["data-repo", "data-repo"],
//     ["data-repo-id", "data-repo-id"],
//     ["data-category", "data-category"],
//     ["data-category-id", "data-category-id"],
//   ];

//   if (
//     requiredConfig.some(([, attrName]) => !container.getAttribute(attrName))
//   ) {
//     return;
//   }

//   const script = document.createElement("script");
//   const configAttrs = [
//     "data-repo",
//     "data-repo-id",
//     "data-category",
//     "data-category-id",
//     "data-mapping",
//     "data-strict",
//     "data-reactions-enabled",
//     "data-emit-metadata",
//     "data-input-position",
//     "data-lang",
//   ];

//   script.src = "https://giscus.app/client.js";
//   script.async = true;
//   script.crossOrigin = "anonymous";
//   script.setAttribute("data-giscus-script", "true");
//   script.setAttribute("data-theme", theme);

//   configAttrs.forEach((attrName) => {
//     const value = container.getAttribute(attrName);

//     if (value) {
//       script.setAttribute(attrName, value);
//     }
//   });

//   container.appendChild(script);
// }

function themeToggle() {
  // const themeButtons = document.querySelectorAll("[data-theme-toggle]");
  // const rootElement = document.documentElement;
  // const pfSearch = document.getElementById("pf-search");
  // const themeStorageKey = "mmdocs_local_theme";

  // let themeSwitchFrame = null;

  // const getInitialTheme = () => {
  //   const savedTheme = localStorage.getItem(themeStorageKey);

  //   if (savedTheme === "dark" || savedTheme === "light") {
  //     return savedTheme;
  //   }

  //   return window.matchMedia("(prefers-color-scheme: dark)").matches
  //     ? "dark"
  //     : "light";
  // };

  // const applyTheme = (theme) => {
  //   const isDark = theme === "dark";

  //   const currentAttr = rootElement.getAttribute("data-mmdocs-theme");

  //   if (!currentAttr && isDark) {
  //     rootElement.setAttribute("data-mmdocs-theme", "dark");
  //   }
  //   if (currentAttr && !isDark) {
  //     rootElement.removeAttribute("data-mmdocs-theme");
  //   }
  //   giscusTheme(theme);
  //   themeButtons.forEach((themeButton) => {
  //     const themeDarkIcon = themeButton.querySelector(
  //       "svg.jekyll-tabler-icon.ti-sun",
  //     );
  //     const themeLightIcon = themeButton.querySelector(
  //       "svg.jekyll-tabler-icon.ti-moon",
  //     );
  //     const themeLabel = themeButton.querySelector("span");
  //     const actionLabel = isDark
  //       ? "Switch to light mode"
  //       : "Switch to dark mode";

  //     themeButton.classList.toggle("is-active", isDark);
  //     themeButton.setAttribute("aria-label", actionLabel);
  //     themeButton.setAttribute("title", actionLabel);

  //     if (pfSearch) {
  //       const pf_attr = pfSearch.getAttribute("data-pf-theme");
  //       if (!pf_attr && isDark) {
  //         pfSearch.setAttribute("data-pf-theme", "dark");
  //       }
  //       if (pf_attr && !isDark) {
  //         pfSearch.removeAttribute("data-pf-theme");
  //       }
  //     }

  //     if (themeDarkIcon && themeLightIcon) {
  //       // themeIcon.className = isDark ? "ri-sun-line" : "ri-moon-line";
  //       if (isDark) {
  //         themeDarkIcon.style.display = "block";
  //         themeLightIcon.style.display = "none";
  //       } else {
  //         themeDarkIcon.style.display = "none";
  //         themeLightIcon.style.display = "block";
  //       }
  //     }

  //     if (themeLabel) {
  //       themeLabel.textContent = isDark ? "Light mode" : "Dark mode";
  //     }
  //   });
  // };

  // const initialTheme = getInitialTheme();

  // applyTheme(initialTheme);
  // giscusInit(initialTheme);

  // themeButtons.forEach((themeButton) => {
  //   themeButton.addEventListener("click", () => {
  //     const currentAttr = rootElement.getAttribute("data-mmdocs-theme");
  //     const nextTheme = currentAttr ? "light" : "dark";

  //     rootElement.classList.add("theme-switching");
  //     applyTheme(nextTheme);
  //     localStorage.setItem(themeStorageKey, nextTheme);

  //     if (themeSwitchFrame !== null) {
  //       cancelAnimationFrame(themeSwitchFrame);
  //     }

  //     themeSwitchFrame = requestAnimationFrame(() => {
  //       rootElement.classList.remove("theme-switching");
  //       themeSwitchFrame = null;
  //     });
  //   });
  // });
}

function searchToggle() {
  const search = document.getElementById("search");
  const searchBtn = document.getElementById("search-btn");
  const searchClose = document.getElementById("search-close");

  /* Search show */
  if (search && searchBtn) {
    searchBtn.addEventListener("click", () => {
      search.classList.add("show-search");
    });
  }

  /* Search hidden */
  if (search && searchClose) {
    searchClose.addEventListener("click", () => {
      search.classList.remove("show-search");
    });
  }
}

function deskMenuToggle() {
  const navMenu = document.getElementById("nav-menu");
  const navToggle = document.getElementById("nav-toggle");
  const navClose = document.getElementById("nav-close");
  /* Menu show */
  if (navMenu && navToggle) {
    navToggle.addEventListener("click", () => {
      navMenu.classList.add("show-menu");
    });
  }

  /* Menu hidden */
  if (navMenu && navClose) {
    navClose.addEventListener("click", () => {
      navMenu.classList.remove("show-menu");
    });
  }
}

function mobileMenuToggle() {
  const menuToggle = document.getElementById("sidebar-nav-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  if (!menuToggle || !mobileNav) return;
  menuToggle.addEventListener("click", () => {
    mobileNav.showModal();
    menuToggle.setAttribute("aria-expanded", "true");
  });
  mobileNav.addEventListener("close", () => {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.focus();
  });
  mobileNav.addEventListener("click", (e) => {
    e.target === mobileNav && mobileNav.close();
  });
  mobileNav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      mobileNav.close();
    });
  });
}

function sidebarDeskToggle() {
  const navPanel = document.querySelector(
    ".sidebar > nav .nav_panel_container",
  );
  if (!navPanel) return;
  const navLists = navPanel.querySelectorAll("li");
  const navLinks = navPanel.querySelectorAll("a");
  const currentPath = location.pathname.replace(/\/$/, "") || "/";

  const setActiveNavItem = (targetLi) => {
    navLists.forEach((li) => {
      li.classList.toggle("active", li === targetLi);
    });
  };

  const setActiveNavLink = (targetLink) => {
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link === targetLink);
    });
  };

  navLists.forEach((li) => {
    const link = li.querySelector("a");
    if (!link) return;

    const linkPath =
      new URL(link.href, location.origin).pathname.replace(/\/$/, "") || "/";

    if (linkPath === currentPath) {
      setActiveNavItem(li);
      setActiveNavLink(link);
    }

    link.addEventListener("click", () => {
      setActiveNavItem(li);
      setActiveNavLink(link);
    });
  });
}

function sidebarMobileToggle() {
  const sidebarMobileNav = document.getElementById("sidebar-mobile-nav");
  const sidebarMobileMenu = document.getElementById("sidebar-mobile-menu");
  const sidebarMobilePanel = sidebarMobileNav?.querySelector(
    ".nav_panel_container",
  );
  const currentPath = location.pathname.replace(/\/$/, "") || "/";

  if (!sidebarMobileNav || !sidebarMobileMenu || !sidebarMobilePanel) return;

  const mobileNavLinks = sidebarMobileNav.querySelectorAll("a");

  const setActiveMobileNavLink = (targetLink) => {
    mobileNavLinks.forEach((link) => {
      link.classList.toggle("is-active", link === targetLink);
    });
  };

  mobileNavLinks.forEach((link) => {
    const linkPath =
      new URL(link.href, location.origin).pathname.replace(/\/$/, "") || "/";

    if (linkPath === currentPath) {
      setActiveMobileNavLink(link);
    }
  });

  sidebarMobileMenu.addEventListener("click", () => {
    if (sidebarMobileNav.open) {
      sidebarMobileNav.close();
      return;
    }

    sidebarMobileNav.showModal();
  });

  document.addEventListener("click", (event) => {
    if (!sidebarMobileNav.open) return;

    const clickTarget = event.target;
    if (!(clickTarget instanceof Element)) return;

    if (
      clickTarget === sidebarMobileMenu ||
      sidebarMobileMenu.contains(clickTarget) ||
      sidebarMobilePanel.contains(clickTarget)
    ) {
      return;
    }

    sidebarMobileNav.close();
  });

  mobileNavLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setActiveMobileNavLink(link);
      sidebarMobileNav.close();
    });
  });
}

function tocToggle() {
  const toc = document.getElementById("toc");
  const article = document.querySelector(".docs_content .markdown_body");

  if (!toc || !article) return;

  const headingEntries = Array.from(toc.querySelectorAll('a[href^="#"]'))
    .map((link) => {
      const id = decodeURIComponent(link.hash.slice(1));
      const heading = id ? document.getElementById(id) : null;

      if (!heading || !article.contains(heading)) {
        return null;
      }

      return { id, link, heading };
    })
    .filter(Boolean);

  if (headingEntries.length === 0) return;

  let scheduled = false;
  let activeId = "";

  const getScrollOffset = () => {
    const docsMain = document.querySelector(".docs_main");
    const stickyTop = docsMain
      ? Number.parseFloat(
          getComputedStyle(docsMain).getPropertyValue("--docs-sticky-top"),
        )
      : NaN;

    return Number.isFinite(stickyTop) ? stickyTop + 24 : 103;
  };

  const setActiveLink = (nextId) => {
    if (activeId === nextId) return;

    activeId = nextId;
    headingEntries.forEach(({ id, link }) => {
      link.classList.toggle("is-active", id === nextId);
    });
  };

  const scrollToHeading = (id) => {
    const entry = headingEntries.find((headingEntry) => headingEntry.id === id);

    if (!entry) return false;

    const headingTop =
      entry.heading.getBoundingClientRect().top + scrollY - getScrollOffset();

    scrollTo({
      top: Math.max(headingTop, 0),
      behavior: "smooth",
    });

    setActiveLink(id);
    history.replaceState(null, "", `#${encodeURIComponent(id)}`);

    return true;
  };

  const syncActiveHeading = () => {
    scheduled = false;

    const threshold = getScrollOffset();
    let currentEntry = headingEntries[0];

    headingEntries.forEach((entry) => {
      if (entry.heading.getBoundingClientRect().top <= threshold) {
        currentEntry = entry;
      }
    });

    setActiveLink(currentEntry?.id ?? "");
  };

  const queueSync = () => {
    if (scheduled) return;

    scheduled = true;
    requestAnimationFrame(syncActiveHeading);
  };

  addEventListener("scroll", queueSync, { passive: true });
  addEventListener("resize", queueSync);
  addEventListener("hashchange", queueSync);

  headingEntries.forEach(({ id, link }) => {
    link.addEventListener("click", (event) => {
      if (!id) return;

      event.preventDefault();
      scrollToHeading(id);
    });
  });

  if (location.hash) {
    const initialId = decodeURIComponent(location.hash.slice(1));

    if (initialId) {
      setActiveLink(initialId);
    }
  }

  queueSync();
}

function codeBlockCopy() {
  const codeBlocks = document.querySelectorAll("[data-shiki-highlighter]");
  if (!codeBlocks.length) return;

  function fallbackCopy(text) {
    const textarea = $.document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (e) {
      success = false;
    }

    $.document.body.removeChild(textarea);
    return success;
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        return fallbackCopy(text);
      }
    }
    return fallbackCopy(text);
  }

  codeBlocks.forEach((block) => {
    const copyBtn = block.querySelector("[data-copy-btn]");
    const code = block.querySelector("pre code");
    if (!copyBtn || !code) return;

    copyBtn.addEventListener("click", async () => {
      const text = code.textContent;
      const success = await copyText(text);
      if (success) {
        copyBtn.classList.add("copied");

        setTimeout(() => {
          copyBtn.classList.remove("copied");
        }, 1000);
      }
    });
  });
}
// themeToggle();
searchToggle();
deskMenuToggle();
mobileMenuToggle();
sidebarDeskToggle();
sidebarMobileToggle();
tocToggle();
codeBlockCopy();

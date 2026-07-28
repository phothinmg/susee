(function () {
  const themeButtons = document.querySelectorAll("[data-theme-toggle]");
  const rootElement = document.documentElement;
  const pfSearch = document.getElementById("pf-search");
  const themeStorageKey = "mmdocs_local_theme";

  let themeSwitchFrame = null;

  function giscusTheme(theme) {
    const iframe = document.querySelector(".giscus-frame");
    if (!iframe) {
      return;
    }

    iframe.contentWindow?.postMessage(
      {
        giscus: {
          setConfig: {
            theme,
          },
        },
      },
      "https://giscus.app",
    );
  }

  function giscusInit(theme) {
    const container = document.getElementById("giscus-thread");
    if (!container || container.querySelector("script[data-giscus-script]")) {
      return;
    }

    const requiredConfig = [
      ["data-repo", "data-repo"],
      ["data-repo-id", "data-repo-id"],
      ["data-category", "data-category"],
      ["data-category-id", "data-category-id"],
    ];

    if (
      requiredConfig.some(([, attrName]) => !container.getAttribute(attrName))
    ) {
      return;
    }

    const script = document.createElement("script");
    const configAttrs = [
      "data-repo",
      "data-repo-id",
      "data-category",
      "data-category-id",
      "data-mapping",
      "data-strict",
      "data-reactions-enabled",
      "data-emit-metadata",
      "data-input-position",
      "data-lang",
    ];

    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-giscus-script", "true");
    script.setAttribute("data-theme", theme);

    configAttrs.forEach((attrName) => {
      const value = container.getAttribute(attrName);

      if (value) {
        script.setAttribute(attrName, value);
      }
    });

    container.appendChild(script);
  }

  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem(themeStorageKey);

    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  const applyTheme = (theme) => {
    const isDark = theme === "dark";

    const currentAttr = rootElement.getAttribute("data-mmdocs-theme");

    if (!currentAttr && isDark) {
      rootElement.setAttribute("data-mmdocs-theme", "dark");
    }
    if (currentAttr && !isDark) {
      rootElement.removeAttribute("data-mmdocs-theme");
    }
    giscusTheme(theme);
    themeButtons.forEach((themeButton) => {
      const themeDarkIcon = themeButton.querySelector(
        "svg.jekyll-tabler-icon.ti-sun",
      );
      const themeLightIcon = themeButton.querySelector(
        "svg.jekyll-tabler-icon.ti-moon",
      );
      const themeLabel = themeButton.querySelector("span");
      const actionLabel = isDark
        ? "Switch to light mode"
        : "Switch to dark mode";

      themeButton.classList.toggle("is-active", isDark);
      themeButton.setAttribute("aria-label", actionLabel);
      themeButton.setAttribute("title", actionLabel);

      if (pfSearch) {
        const pf_attr = pfSearch.getAttribute("data-pf-theme");
        if (!pf_attr && isDark) {
          pfSearch.setAttribute("data-pf-theme", "dark");
        }
        if (pf_attr && !isDark) {
          pfSearch.removeAttribute("data-pf-theme");
        }
      }

      if (themeDarkIcon && themeLightIcon) {
        // themeIcon.className = isDark ? "ri-sun-line" : "ri-moon-line";
        if (isDark) {
          themeDarkIcon.style.display = "block";
          themeLightIcon.style.display = "none";
        } else {
          themeDarkIcon.style.display = "none";
          themeLightIcon.style.display = "block";
        }
      }

      if (themeLabel) {
        themeLabel.textContent = isDark ? "Light mode" : "Dark mode";
      }
    });
  };

  const initialTheme = getInitialTheme();

  applyTheme(initialTheme);
  giscusInit(initialTheme);

  themeButtons.forEach((themeButton) => {
    themeButton.addEventListener("click", () => {
      const currentAttr = rootElement.getAttribute("data-mmdocs-theme");
      const nextTheme = currentAttr ? "light" : "dark";

      rootElement.classList.add("theme-switching");
      applyTheme(nextTheme);
      localStorage.setItem(themeStorageKey, nextTheme);

      if (themeSwitchFrame !== null) {
        cancelAnimationFrame(themeSwitchFrame);
      }

      themeSwitchFrame = requestAnimationFrame(() => {
        rootElement.classList.remove("theme-switching");
        themeSwitchFrame = null;
      });
    });
  });
})();

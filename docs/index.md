---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Susee"
  tagline: Simple TypeScript bundler
  actions:
    - theme: brand
      text: What is Susee?
      link: /documentation/what-is-susee
    - theme: alt
      text: Getting Started
      link: /documentation/getting-started

features:
  - title: Dual-Format
    details: >
      Susee generates output artifacts in both ECMAScript Module (ESM) and CommonJS (CJS) formats from a single TypeScript source tree.
  - title: Dependency Resolution
    details: >
      Susee automatically resolves and collects all local TypeScript dependencies starting from configured entry points.
  - title: Plugin System
    details: >
      Susee provides a plugin architecture with three execution points in the build pipeline. Plugins can be synchronous or asynchronous, and may be provided as objects or factory functions.
---

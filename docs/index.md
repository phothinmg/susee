---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Susee"
  tagline: TypeScript-first bundler for library packages
  actions:
    - theme: brand
      text: What is Susee?
      link: /guide/what-is-susee
    - theme: alt
      text: Quick Start
      link: /guide/quick-start

features:
  - title: TypeScript-first
    details: Designed for TypeScript library workflows with reliable output and type-safe defaults.
  - title: Dual Module Output
    details: Build ESM and CommonJS artifacts from the same source entry with minimal setup.
  - title: Automatic Renaming
    details: Resolves duplicate declaration conflicts during source consolidation automatically.
  - title: Fast Builds
    details: Focused pipeline for package builds without unnecessary app-bundler overhead.
  - title: Package.json Management
    details: Optionally updates package metadata to match generated build artifacts.
  - title: Plugin System
    details: Add custom build behavior through plugin extension points.
  - title: CLI and Programmatic API
    details: Run builds from commands in CI or call the build API inside custom scripts.
---

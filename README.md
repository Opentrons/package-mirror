# Package Mirror

This repository contains cached package binaries for faster CI builds.

## Purpose

Instead of downloading package binaries from official sources every time, this repository provides pre-cached versions that can be downloaded much faster.

## Supported Packages

- **Cypress** - End-to-end testing framework
- **Electron** - Desktop app framework
- More packages can be added as needed

## How it works

1. **Automated caching**: When new package versions are detected, the automation script downloads the official binaries and creates GitHub releases
2. **Fast downloads**: CI builds download from this repository instead of official sources
3. **Fallback**: If a version isn't cached here, builds fall back to official sources

## Usage

CI builds automatically check this repository first:

### Cypress

#!/usr/bin/env node
'use strict'

/**
 * Package Cache Automation Script
 * 
 * This script automates the process of caching ALL packages in GitHub releases.
 * It fetches the package.json from the Opentrons/opentrons repository and caches
 * all dependencies (both binary packages and npm packages) for faster CI builds.
 * This provides GitHub's faster download speeds instead of going to package maintainers.
 * 
 * Usage: node scripts/package-cache-automation.js [--deploy] [--package=package-name]
 * --deploy: Actually create the release and upload assets (default: dry run)
 * --package: Specific package to cache (default: all packages found)
 */

const { Octokit } = require('@octokit/rest')
const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync } = require('child_process')

const REPO_DETAILS = {
  owner: 'Opentrons',
  repo: 'package-mirror',
}

const SOURCE_REPO = {
  owner: 'Opentrons',
  repo: 'opentrons',
  branch: 'edge'
}


async function getPackageJsonFromRepo(octokit) {
  try {
    console.log(`Fetching package.json from ${SOURCE_REPO.owner}/${SOURCE_REPO.repo}...`)
    const { data } = await octokit.rest.repos.getContent({
      owner: SOURCE_REPO.owner,
      repo: SOURCE_REPO.repo,
      path: 'package.json',
      ref: SOURCE_REPO.branch
    })
    
    if (data.type !== 'file') {
      throw new Error('package.json is not a file')
    }
    
    const content = Buffer.from(data.content, 'base64').toString('utf8')
    return JSON.parse(content)
  } catch (error) {
    console.error('Error fetching package.json from repository:', error.message)
    process.exit(1)
  }
}

// Known packages that have downloadable binaries
const BINARY_PACKAGES = {
  cypress: {
    name: 'Cypress',
    platforms: [
      { os: 'Linux', platform: 'linux', arch: 'x64' },
      { os: 'macOS', platform: 'darwin', arch: 'x64' },
      { os: 'Windows', platform: 'win32', arch: 'x64' }
    ],
    getDownloadUrl: (version, platform, arch) => 
      `https://download.cypress.io/desktop/${version}?platform=${platform}&arch=${arch}`,
    getFilename: (version, platform, arch) => 
      `cypress-${version}-${platform}-${arch}.zip`
  },
  electron: {
    name: 'Electron',
    platforms: [
      { os: 'Linux', platform: 'linux', arch: 'x64' },
      { os: 'macOS', platform: 'darwin', arch: 'x64' },
      { os: 'Windows', platform: 'win32', arch: 'x64' }
    ],
    getDownloadUrl: (version, platform, arch) => 
      `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-${platform}-${arch}.zip`,
    getFilename: (version, platform, arch) => 
      `electron-v${version}-${platform}-${arch}.zip`
  },
  puppeteer: {
    name: 'Puppeteer',
    platforms: [
      { os: 'Linux', platform: 'linux', arch: 'x64' },
      { os: 'macOS', platform: 'darwin', arch: 'x64' },
      { os: 'Windows', platform: 'win32', arch: 'x64' }
    ],
    getDownloadUrl: (version, platform, arch) => {
      // Puppeteer downloads Chrome/Chromium binaries
      const chromeVersion = version.replace(/[^\d.]/g, '')
      return `https://storage.googleapis.com/chrome-for-testing-public/${chromeVersion}/${platform}-${arch}/chrome-${platform}-${arch}.zip`
    },
    getFilename: (version, platform, arch) => 
      `puppeteer-chrome-${version}-${platform}-${arch}.zip`
  },
  playwright: {
    name: 'Playwright',
    platforms: [
      { os: 'Linux', platform: 'linux', arch: 'x64' },
      { os: 'macOS', platform: 'darwin', arch: 'x64' },
      { os: 'Windows', platform: 'win32', arch: 'x64' }
    ],
    getDownloadUrl: (version, platform, arch) => {
      // Playwright downloads browser binaries
      return `https://playwright.azureedge.net/builds/playwright-${version}-${platform}-${arch}.zip`
    },
    getFilename: (version, platform, arch) => 
      `playwright-${version}-${platform}-${arch}.zip`
  },
  'playwright-core': {
    name: 'Playwright Core',
    platforms: [
      { os: 'Linux', platform: 'linux', arch: 'x64' },
      { os: 'macOS', platform: 'darwin', arch: 'x64' },
      { os: 'Windows', platform: 'win32', arch: 'x64' }
    ],
    getDownloadUrl: (version, platform, arch) => {
      // Playwright Core downloads browser binaries
      return `https://playwright.azureedge.net/builds/playwright-core-${version}-${platform}-${arch}.zip`
    },
    getFilename: (version, platform, arch) => 
      `playwright-core-${version}-${platform}-${arch}.zip`
  },
  'playwright-chromium': {
    name: 'Playwright Chromium',
    platforms: [
      { os: 'Linux', platform: 'linux', arch: 'x64' },
      { os: 'macOS', platform: 'darwin', arch: 'x64' },
      { os: 'Windows', platform: 'win32', arch: 'x64' }
    ],
    getDownloadUrl: (version, platform, arch) => {
      // Playwright Chromium downloads Chromium binaries
      return `https://playwright.azureedge.net/builds/chromium-${version}-${platform}-${arch}.zip`
    },
    getFilename: (version, platform, arch) => 
      `playwright-chromium-${version}-${platform}-${arch}.zip`
  },
  'playwright-firefox': {
    name: 'Playwright Firefox',
    platforms: [
      { os: 'Linux', platform: 'linux', arch: 'x64' },
      { os: 'macOS', platform: 'darwin', arch: 'x64' },
      { os: 'Windows', platform: 'win32', arch: 'x64' }
    ],
    getDownloadUrl: (version, platform, arch) => {
      // Playwright Firefox downloads Firefox binaries
      return `https://playwright.azureedge.net/builds/firefox-${version}-${platform}-${arch}.zip`
    },
    getFilename: (version, platform, arch) => 
      `playwright-firefox-${version}-${platform}-${arch}.zip`
  },
  'playwright-webkit': {
    name: 'Playwright WebKit',
    platforms: [
      { os: 'Linux', platform: 'linux', arch: 'x64' },
      { os: 'macOS', platform: 'darwin', arch: 'x64' },
      { os: 'Windows', platform: 'win32', arch: 'x64' }
    ],
    getDownloadUrl: (version, platform, arch) => {
      // Playwright WebKit downloads WebKit binaries
      return `https://playwright.azureedge.net/builds/webkit-${version}-${platform}-${arch}.zip`
    },
    getFilename: (version, platform, arch) => 
      `playwright-webkit-${version}-${platform}-${arch}.zip`
  }
}

function getAllDependencies(packageJson) {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
  return Object.entries(deps).map(([name, version]) => ({
    name,
    version: version.replace(/^[\^~]/, '') // Remove version prefixes
  }))
}

function getAllPackages(packageJson) {
  const allDeps = getAllDependencies(packageJson)
  const packagesToCache = []
  
  console.log(`\nFound ${allDeps.length} total dependencies in package.json`)
  console.log(`Available binary packages: ${Object.keys(BINARY_PACKAGES).join(', ')}`)
  
  for (const { name, version } of allDeps) {
    if (BINARY_PACKAGES[name]) {
      console.log(`✅ Found binary package: ${name}@${version}`)
      packagesToCache.push({
        name,
        version,
        config: BINARY_PACKAGES[name],
        type: 'binary'
      })
    } else {
      console.log(`📦 Found npm package: ${name}@${version}`)
      packagesToCache.push({
        name,
        version,
        config: {
          name: name,
          platforms: [
            { os: 'All Platforms', platform: 'npm', arch: 'all' }
          ],
          getDownloadUrl: (version) => `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          getFilename: (version) => `${name}-${version}.tgz`
        },
        type: 'npm'
      })
    }
  }
  
  return packagesToCache
}

async function checkReleaseExists(octokit, packageName, version) {
  try {
    const tagName = sanitizeTagName(`${packageName}-${version}`)
    const { data } = await octokit.rest.repos.getReleaseByTag({
      owner: REPO_DETAILS.owner,
      repo: REPO_DETAILS.repo,
      tag: tagName
    })
    return { exists: true, release: data }
  } catch (error) {
    if (error.status === 404) {
      return { exists: false, release: null }
    }
    throw error
  }
}

async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath)
    let redirectCount = 0
    const maxRedirects = 5
    
    const download = (downloadUrl) => {
      if (redirectCount >= maxRedirects) {
        reject(new Error(`Too many redirects (${redirectCount})`))
        return
      }
      
      https.get(downloadUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            redirectCount++
            console.log(`Redirecting from ${downloadUrl} to: ${redirectUrl}`)
            download(redirectUrl)
            return
          } else {
            console.error(`Redirect response but no location header: ${response.statusCode}`)
            reject(new Error(`Redirect without location header: ${response.statusCode}`))
            return
          }
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`))
          return
        }
        
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      }).on('error', (err) => {
        fs.unlink(filepath, () => {}) // Delete the file on error
        reject(err)
      })
    }
    
    download(url)
  })
}

async function downloadPackageBinary(packageName, version, platform, arch, config) {
  const url = config.getDownloadUrl(version, platform, arch)
  const filename = config.getFilename(version, platform, arch)
  const filepath = path.join(__dirname, '..', 'temp', filename)
  
  // Create temp directory if it doesn't exist
  const tempDir = path.dirname(filepath)
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  
  console.log(`Downloading ${filename} from ${url}`)
  try {
    await downloadFile(url, filepath)
    console.log(`Downloaded ${filename}`)
  } catch (error) {
    console.error(`Failed to download ${filename}:`, error.message)
    throw error
  }
  
  return { filepath, filename }
}

async function downloadNpmPackage(packageName, version, config) {
  const url = config.getDownloadUrl(version)
  const filename = config.getFilename(version)
  const filepath = path.join(__dirname, '..', 'temp', filename)
  
  // Create temp directory if it doesn't exist
  const tempDir = path.dirname(filepath)
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  
  console.log(`Downloading ${filename} from ${url}`)
  try {
    await downloadFile(url, filepath)
    console.log(`Downloaded ${filename}`)
  } catch (error) {
    console.error(`Failed to download ${filename}:`, error.message)
    throw error
  }
  
  return { filepath, filename }
}

function sanitizeTagName(name) {
  // GitHub tag names must be valid git refs
  // Remove or replace invalid characters
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '-')  // Replace invalid chars with hyphens
    .replace(/^[.-]/, '')              // Remove leading dots/hyphens
    .replace(/[.-]$/, '')              // Remove trailing dots/hyphens
    .replace(/-+/g, '-')               // Replace multiple hyphens with single
    .substring(0, 100)                 // Limit length
}

async function createRelease(octokit, packageName, version, deploy, config) {
  const tagName = sanitizeTagName(`${packageName}-${version}`)
  const releaseName = `${config.name} ${version} Cache`
  const body = `Cached ${config.name} ${version} binaries for faster CI builds.

This release contains pre-downloaded ${config.name} binaries for all supported platforms to speed up CI builds.

**Generated by:** Package Cache Automation Script
**Package:** ${config.name}
**Version:** ${version}
**Source Repository:** ${SOURCE_REPO.owner}/${SOURCE_REPO.repo}
**Created:** ${new Date().toISOString()}`

  if (deploy) {
    const { data } = await octokit.rest.repos.createRelease({
      owner: REPO_DETAILS.owner,
      repo: REPO_DETAILS.repo,
      tag_name: tagName,
      name: releaseName,
      body: body,
      draft: false,
      prerelease: false
    })
    return data
  } else {
    console.log(`[DRY RUN] Would create release: ${tagName}`)
    console.log(`[DRY RUN] Title: ${releaseName}`)
    console.log(`[DRY RUN] Body: ${body}`)
    return { id: 'dry-run', upload_url: 'dry-run' }
  }
}

async function uploadAsset(octokit, release, filepath, filename, deploy) {
  if (!deploy) {
    console.log(`[DRY RUN] Would upload asset: ${filename}`)
    return
  }

  const fileContent = fs.readFileSync(filepath)
  const { data } = await octokit.rest.repos.uploadReleaseAsset({
    owner: REPO_DETAILS.owner,
    repo: REPO_DETAILS.repo,
    release_id: release.id,
    name: filename,
    data: fileContent,
    headers: {
      'content-type': 'application/zip',
      'content-length': fileContent.length
    }
  })
  console.log(`Uploaded ${filename}`)
  return data
}

async function cleanup(filepaths) {
  for (const filepath of filepaths) {
    try {
      fs.unlinkSync(filepath)
      console.log(`Cleaned up ${filepath}`)
    } catch (error) {
      console.warn(`Failed to cleanup ${filepath}:`, error.message)
    }
  }
  
  // Remove temp directory if empty
  const tempDir = path.join(__dirname, '..', 'temp')
  try {
    fs.rmdirSync(tempDir)
    console.log(`Cleaned up temp directory`)
  } catch (error) {
    // Directory not empty or doesn't exist, that's fine
  }
}

async function cachePackage(packageInfo, deploy) {
  const { name: packageName, version, config } = packageInfo

  console.log(`\n📦 Processing ${config.name} ${version}...`)
  
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
  
  // Check if release already exists
  const { exists, release } = await checkReleaseExists(octokit, packageName, version)
  
  if (exists) {
    const tagName = sanitizeTagName(`${packageName}-${version}`)
    console.log(`✅ Release ${tagName} already exists`)
    console.log(`Release URL: ${release.html_url}`)
    return true
  }
  
  const originalTagName = `${packageName}-${version}`
  const tagName = sanitizeTagName(originalTagName)
  if (originalTagName !== tagName) {
    console.log(`📝 Sanitized tag name: "${originalTagName}" → "${tagName}"`)
  }
  console.log(`❌ Release ${tagName} does not exist. Creating...`)
  
  // Create the release
  const newRelease = await createRelease(octokit, packageName, version, deploy, config)
  
  if (deploy) {
    console.log(`Created release: ${newRelease.html_url}`)
  }
  
  // Download and upload packages
  const downloadedFiles = []
  
  try {
    if (packageInfo.type === 'binary') {
      // Binary packages need downloads for all platforms
      for (const { os, platform, arch } of config.platforms) {
        console.log(`\nProcessing ${os} (${platform}-${arch})...`)
        
        const { filepath, filename } = await downloadPackageBinary(packageName, version, platform, arch, config)
        downloadedFiles.push(filepath)
        
        await uploadAsset(octokit, newRelease, filepath, filename, deploy)
      }
    } else {
      // NPM packages only need one download
      console.log(`\nProcessing npm package...`)
      
      const { filepath, filename } = await downloadNpmPackage(packageName, version, config)
      downloadedFiles.push(filepath)
      
      await uploadAsset(octokit, newRelease, filepath, filename, deploy)
    }
    
    // Only print success message if we get here (all downloads succeeded)
    if (packageInfo.type === 'binary') {
      console.log(`\n✅ Successfully cached ${config.name} ${version} for all platforms`)
    } else {
      console.log(`\n✅ Successfully cached ${config.name} ${version} npm package`)
    }
    if (deploy) {
      console.log(`Release URL: ${newRelease.html_url}`)
    }
    
    return true
    
  } catch (error) {
    console.error(`❌ Failed to cache ${config.name} ${version}:`, error.message)
    return false
  } finally {
    // Cleanup downloaded files
    await cleanup(downloadedFiles)
  }
}

async function main() {
  const deploy = process.argv.includes('--deploy')
  const packageArg = process.argv.find(arg => arg.startsWith('--package='))
  const specificPackage = packageArg ? packageArg.split('=')[1] : null
  
  const token = process.env.GITHUB_TOKEN
  
  if (!token) {
    console.error('GITHUB_TOKEN environment variable is required')
    process.exit(1)
  }

  const octokit = new Octokit({ auth: token })
  const packageJson = await getPackageJsonFromRepo(octokit)
  
  // Get all packages from the repository's package.json
  const allPackages = getAllPackages(packageJson)
  
  // Filter by specific package if requested
  const packagesToProcess = specificPackage 
    ? allPackages.filter(pkg => pkg.name === specificPackage)
    : allPackages
  
  console.log(`🚀 Package Cache Automation`)
  console.log(`Mode: ${deploy ? 'DEPLOY' : 'DRY RUN'}`)
  console.log(`Source Repository: ${SOURCE_REPO.owner}/${SOURCE_REPO.repo}`)
  console.log(`Found ${allPackages.length} total packages in package.json`)
  console.log(`Packages to process: ${packagesToProcess.map(p => `${p.name}@${p.version}`).join(', ')}`)
  
  if (packagesToProcess.length === 0) {
    console.log(`⚠️  No binary packages found to cache.`)
    console.log(`Available binary packages: ${Object.keys(BINARY_PACKAGES).join(', ')}`)
    return
  }
  
  let successCount = 0
  let totalCount = packagesToProcess.length
  
  for (const packageInfo of packagesToProcess) {
    console.log(`\n${packageInfo.config.name} version: ${packageInfo.version}`)
    
    const success = await cachePackage(packageInfo, deploy)
    if (success) {
      successCount++
      console.log(`✅ ${packageInfo.config.name} ${packageInfo.version} - SUCCESS`)
    } else {
      console.log(`❌ ${packageInfo.config.name} ${packageInfo.version} - FAILED`)
    }
  }
  
  console.log(`\n📊 Summary:`)
  console.log(`✅ Successfully processed: ${successCount}/${totalCount} packages`)
  
  if (successCount > 0) {
    if (deploy) {
      console.log(`\n🎉 Successfully cached ${successCount} package(s) in GitHub releases!`)
    } else {
      console.log(`\n🔍 This was a dry run. Use --deploy to actually create releases.`)
    }
  } else {
    console.log(`\n❌ No packages were successfully cached.`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error.message)
    process.exit(1)
  })
}

module.exports = { main }

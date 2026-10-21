# TODE — Insect Uprising

A 3D insect-themed game built with **JavaScript, Three.js, and Vite**, with a Windows desktop version packaged using **Electron** and **electron-builder**.

This repository contains the game's source code, assets, development environment, and configuration for building a standalone Windows executable.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Development Mode](#development-mode)
- [Production Build](#production-build)
- [Running the Windows Desktop App](#running-the-windows-desktop-app)
- [Building the Windows Executable](#building-the-windows-executable)
- [Project Structure](#project-structure)
- [Asset Management](#asset-management)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

- 3D graphics powered by Three.js.
- Browser-based development environment with Vite.
- 3D models, textures, and audio assets.
- Configurable background music and boss soundtracks.
- Desktop application support through Electron.
- Windows installer generation with electron-builder.
- Support for relative asset paths to improve compatibility with packaged desktop builds.

## Technology Stack

| Technology | Purpose |
|---|---|
| JavaScript | Game logic and application code |
| Three.js | 3D rendering and graphics |
| Vite | Development server and production bundler |
| Electron | Desktop application runtime |
| electron-builder | Windows installer and executable packaging |
| npm | Dependency management and project scripts |

## Prerequisites

Before installing the project, make sure you have the following tools:

- **Node.js:** Use a supported LTS release. Node.js 22 LTS is a recommended starting point.
- **npm:** Installed alongside Node.js.
- **Git:** Required to clone the repository.
- **Windows:** Required to build and test the Windows `.exe` package using the commands documented below.

Verify your installation:

```bash
node --version
npm --version
git --version
```

## Getting Started

### 1. Clone the repository

Open a terminal and run:

```bash
git clone https://github.com/3NombresJJA/Tode-Insects-Uprising.git
```

### 2. Navigate to the game directory

```bash
cd Tode-Insects-Uprising/game
```

**Important:** Run all npm commands from this `game` directory, where the game's `package.json` is located.

### 3. Install dependencies

```bash
npm install
```

This installs the dependencies specified in `package.json`, including Three.js, Vite, Electron, and electron-builder.

## Development Mode

To start the local development server, run:

```bash
npm run dev
```

Vite will display a local URL in the terminal, typically:

```text
http://localhost:5173/
```

Open the URL in your browser to run the game.

The development server supports hot module replacement where applicable, allowing changes to the source code to appear without restarting the entire development server.

To stop the server, press `Ctrl + C` in the terminal.

## Production Build

To compile the game for production, run:

```bash
npm run build
```

Vite generates the production files in the `dist/` directory.

To test the production build locally, run:

```bash
npm run preview
```

Open the local URL displayed by Vite to test the compiled application.

The `dist/` directory is generated automatically. You do not need to create it manually.

## Running the Windows Desktop App

The project uses Electron to run the game as a desktop application.

After installing dependencies, run:

```bash
npm run desktop
```

This command builds the game and launches Electron using the configured entry point.

The Electron main process is defined in:

```text
electron/main.cjs
```

It opens the compiled application from:

```text
dist/index.html
```

This workflow is useful for testing the desktop version before generating a distributable installer.

## Building the Windows Executable

The project uses electron-builder to package the application for Windows.

### Option 1: Generate the Windows installer

Run:

```bash
npm run build:exe
```

This command performs two operations:

1. Builds the production version of the game with Vite.
2. Packages the application using electron-builder with the NSIS Windows installer target.

The generated installer is placed in:

```text
dist-electron/
```

The installer filename includes the configured product name and application version.

### Option 2: Generate the configured Windows distributions

Run:

```bash
npm run dist:win
```

This command builds the game and runs electron-builder for Windows using the targets configured in `package.json`.

The Windows targets are configured as:

- **NSIS:** A Windows installer that installs the application on the user's computer.
- **Portable:** A portable executable intended to run without a traditional installation process.

The generated files are placed in:

```text
dist-electron/
```

The exact filenames depend on the application version and electron-builder configuration.

### Where to find the executable

After a successful build, open:

```text
game/dist-electron/
```

Look for the generated installer or portable executable.

**Note:** The installer and portable executable are different distribution formats. Use the installer for a conventional Windows installation or the portable build when you want to distribute a standalone executable.

## Project Structure

The following is a simplified overview of the main project files and directories:

```text
Tode-Insects-Uprising/
└── game/
    ├── electron/
    │   └── main.cjs
    ├── public/
    │   ├── audios/
    │   ├── models/
    │   └── textures/
    ├── src/
    │   └── ...
    ├── dist/                # Generated by Vite
    ├── dist-electron/       # Generated by electron-builder
    ├── index.html
    ├── package.json
    ├── package-lock.json
    └── vite.config.js
```

The exact contents of `src/` and `public/` may vary as the project evolves.

### Main directories

- `electron/`: Electron's main process and desktop window configuration.
- `public/`: Static resources such as audio files, models, and textures.
- `src/`: Game source code and application modules.
- `dist/`: Production build generated by Vite.
- `dist-electron/`: Windows distributables generated by electron-builder.

## Asset Management

The game uses external assets such as 3D models, audio files, and textures.

Static assets should be placed in the appropriate directories under `public/`, for example:

```text
public/
├── audios/
├── models/
└── textures/
```

When loading these resources, use Vite's base URL configuration so asset paths work correctly in both the browser and the packaged Electron application.

For example:

```javascript
export function getAssetUrl(src) {
    return `${import.meta.env.BASE_URL}${src.replace(/^\/+/, '')}`;
}
```

Use the helper when loading an asset:

```javascript
textureLoader.load(
    getAssetUrl('/textures/ground.png'),
    (texture) => {
        material.map = texture;
        material.needsUpdate = true;
    }
);
```

The same approach can be used for audio files and 3D models, adapting the loading method to the relevant Three.js API.

The Vite configuration should use a relative base path for this packaging setup:

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
    base: './'
});
```

This configuration helps the packaged desktop application resolve local resources correctly.

## Troubleshooting

### `Missing script: "build:exe"`

Make sure you are running the command inside the `game/` directory and that `package.json` contains the required script:

```json
"build:exe": "npm run build && electron-builder --win nsis"
```

Check the available scripts with:

```bash
npm run
```

### `Cannot find package 'three'` or another dependency

Install the project dependencies:

```bash
npm install
```

Then retry the command.

### The application opens, but models, textures, or audio files are missing

Check the following:

1. Confirm that the required assets exist in `public/`.
2. Check that the asset filenames and letter casing match the paths in the code.
3. Verify that resource paths are resolved through the configured base URL.
4. Run `npm run build` again after changing the source code or assets.
5. Check the browser or Electron developer console for loading errors.

### The executable is not generated

Confirm that:

- You are running the build on Windows.
- Dependencies were installed successfully.
- The `electron/main.cjs` file exists.
- The `main` field in `package.json` points to `electron/main.cjs`.
- The production build completes successfully.
- The build log does not contain a packaging error.

Run the build again and inspect the terminal output:

```bash
npm run build:exe
```

### Test the production build separately

If the game works in development but fails in the desktop application, try:

```bash
npm run build
npm run preview
```

This helps distinguish production asset-path issues from Electron packaging issues.

## Licence

The course project this game is built on is distributed under the MIT License; see LICENSE (Copyright (c) 2025 JetBrains Academy). The third-party models keep their own licences, listed in Credits.

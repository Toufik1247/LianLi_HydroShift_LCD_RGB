<div align="center">

# 🌈 Lian Li HydroShift LCD RGB (LED Only) for SignalRGB

[![SignalRGB Plugin](https://img.shields.io/badge/SignalRGB-Custom%20Plugin-0ea5e9?style=for-the-badge)](https://docs.signalrgb.com/plugins/plugin-creation)
[![Hardware](https://img.shields.io/badge/Hardware-Lian%20Li%20HydroShift-111827?style=for-the-badge)](https://lian-li.com/)
[![USB](https://img.shields.io/badge/USB-0x0416%3A0x7399-1f2937?style=for-the-badge)](#-compatibility)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](#-installation)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](./LICENSE)

<img src="https://lian-li.com/wp-content/uploads/2024/06/shift_002.webp" alt="Lian Li HydroShift LCD AIO" width="560" />

</div>

A custom SignalRGB **plugin** focused on HydroShift RGB LEDs only.

> [!NOTE]
> In SignalRGB terminology:
> - **Plugin** = device driver code (`.js`)
> - **Add-on** = distribution/update channel in SignalRGB UI that can deliver plugins

## ✨ Highlights
- ✅ Stable LED control for HydroShift in SignalRGB
- ✅ Supports `Forced`, `Canvas`, `Paint`, `Depaint`, `Shutdown Color`
- ✅ Coexists with **L-Connect** for LCD and cooling management
- ✅ Lightweight single-file plugin implementation

## 🔌 Compatibility
| Item | Value |
|---|---|
| Vendor ID | `0x0416` |
| Product ID | `0x7399` |
| HID Validation | `interface === 1` |
| LED Mapping | `3 fans x 8 LEDs = 24 LEDs` |

This project is **hardware-specific** to HydroShift protocol behavior, not a generic plugin for all Lian Li products.

## 🚀 Installation
### 1) Preferred: Add-on URL install
1. Open SignalRGB: `Settings` -> `Add-ons`
2. Click `Add Add-on` and paste this GitHub repository URL
3. Enable/install the add-on
4. Restart SignalRGB if prompted
5. Verify device name: `Lian Li Hydroshift LCD AIO (LED Only)`

### 2) Manual fallback install
1. Place this folder in:
   - `%USERPROFILE%\Documents\WhirlwindFX\Plugins\Lian Li\LianLi_HydroShift_LCD_RGB`
2. Restart SignalRGB
3. Verify device name: `Lian Li Hydroshift LCD AIO (LED Only)`

If Add-on URL install is unavailable on your SignalRGB build, use manual install.

## 🧩 What This Plugin Does Not Control
- ❌ LCD screen content
- ❌ Pump behavior
- ❌ Fan speed / RPM control

Keep those functions in **L-Connect** (or future contributor extensions).

## ⚙️ Recommended L-Connect Coexistence
- Keep L-Connect active for LCD and pump/fan profiles
- Avoid simultaneous LED writes from L-Connect on this device
- Let SignalRGB own LED writes

Concurrent writes from both apps may cause flicker/conflicts.

## 🤝 Contributing
Contributions are welcome, especially for:
1. Protocol robustness across HydroShift revisions
2. Optional telemetry/control integration paths (where supported)
3. Diagnostics and developer tooling

### Contributor rules
- Keep only one active plugin `.js` file in the plugin folder
- Avoid aggressive re-init bursts inside render loops
- Validate changes in all modes: Forced, Canvas, Paint/Depaint, Shutdown

### Official SignalRGB docs
- Plugin creation: https://docs.signalrgb.com/plugins/plugin-creation
- Plugin exports: https://docs.signalrgb.com/plugins/plugin-creation/plugin-exports
- Plugin runtime: https://docs.signalrgb.com/plugins/plugin-creation/plugin-runtime
- User controls: https://docs.signalrgb.com/plugins/plugin-creation/user-controls
- Writes/reads: https://docs.signalrgb.com/plugins/plugin-creation/writes-and-reads
- Fan control API: https://docs.signalrgb.com/plugins/plugin-creation/fan-control
- Plugin template: https://docs.signalrgb.com/plugins/plugin-creation/plugin-template
- Components: https://docs.signalrgb.com/plugins/plugin-creation/using-components

## 🗺️ Roadmap
1. Broader HydroShift hardware revision compatibility
2. Optional fan telemetry/control path (when feasible with supported APIs)
3. Extended runtime diagnostics toggles

## 📄 License
MIT — see [`LICENSE`](./LICENSE).

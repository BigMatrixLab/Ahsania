# amcgh_capture

AMCGH capture

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Windows app

The same shell builds a Windows program that opens the app in its own window ("AMCGH Capture").

One-time setup on the build PC: Flutter, Visual Studio Build Tools with C++ (Desktop development with C++), NuGet and Inno Setup:

```powershell
winget install Microsoft.NuGet
winget install JRSoftware.InnoSetup
```

Build and make the installer:

```powershell
flutter build windows --release --dart-define=APP_URL=https://your-server
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" windows\installer.iss
```

The installer is `build\AMCGH-Capture-Setup.exe`. It installs to Program Files and adds Start-menu and desktop shortcuts. Windows 10 and 11 already include WebView2, which the app needs.

`windows/CMakeLists.txt` sets `_SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS`: flutter_inappwebview_windows still uses `<experimental/coroutine>`, which Visual Studio 2026 refuses otherwise.

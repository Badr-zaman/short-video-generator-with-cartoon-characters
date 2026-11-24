import { Config } from "@remotion/cli/config";

// WebGL (Three.js) in headless Chrome on macOS needs the ANGLE backend.
Config.setChromiumOpenGlRenderer("angle");
Config.setVideoImageFormat("jpeg");

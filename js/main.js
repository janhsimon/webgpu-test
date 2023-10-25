"use strict";

import { onKeyUp, load, update, render, onResize, onMouseMove, onMouseWheel, onKeyDown } from "./app.js";

let context, device, time;

// Prevent the right-click context menu from popping up
window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

// Main loop
window.startWebGPU = async () => {
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance"
  });
  if (!adapter) {
    throw new Error("No appropriate GPU adapter found.");
  }

  const uniformBufferStride = adapter.limits.minUniformBufferOffsetAlignment;

  const adapterInfo = await adapter.requestAdapterInfo();
  if (!adapterInfo) {
    throw new Error("Failed to retrieve GPU adapter info.");
  }

  console.log(`GPU information:
\tVendor: ${adapterInfo.vendor}
\tArchitecture: ${adapterInfo.architecture}
\tDevice: ${adapterInfo.device}
\tDescription: ${adapterInfo.description}`);

  /*
  console.log(`GPU limits:
\tMax texture dimension 2D: ${adapter.limits.maxTextureDimension2D}
\tMax bind groups: ${adapter.limits.maxBindGroups}
\tMax bindings per bind group: ${adapter.limits.maxBindingsPerBindGroup}
\tMax dynamic uniform buffers per pipeline layout: ${adapter.limits.maxDynamicUniformBuffersPerPipelineLayout}
\tMax sampled textures per shader stage: ${adapter.limits.maxSampledTexturesPerShaderStage}
\tMax samplers per shading stage: ${adapter.limits.maxSamplersPerShaderStage}
\tMax uniform buffers per shading stage: ${adapter.limits.maxUniformBuffersPerShaderStage}
\tMin uniform buffer offset alignment: ${adapter.limits.minUniformBufferOffsetAlignment}`);
  */

  // Find the canvas
  const canvas = document.querySelector("canvas");

  // Context
  context = canvas.getContext("webgpu");

  // Device
  device = await adapter.requestDevice();
  if (!device) {
    throw new Error("No appropriate GPU device found.");
  }

  const colorFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: colorFormat,
  });

  await load(device, colorFormat, uniformBufferStride);

  // Resize the canvas
  window.addEventListener("resize", (event) => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    onResize(device, canvas.width, canvas.height);
  });

  // Move movement
  window.addEventListener("mousemove", (event) => {
    onMouseMove(event);
  });

  // Move wheel
  window.addEventListener("wheel", (event) => {
    onMouseWheel(event);
  });

  // Key press
  window.addEventListener("keydown", (event) => {
   onKeyDown(event);
  });

  // Key release
  window.addEventListener("keyup", (event) => {
    onKeyUp(event);
  });

  // Force an initial resize event needed to complete initialization
  window.dispatchEvent(new Event('resize'));

  time = Date.now();
  loop();
};

function loop() {
  const newTime = Date.now();
  update(newTime - time);
  time = Date.now();

  render(device, context.getCurrentTexture().createView());

  window.requestAnimationFrame(loop);
}
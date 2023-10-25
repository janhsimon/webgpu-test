"use strict";

import { loadCamera, getCameraPosition, tumbleCamera, panCamera, dollyCamera, calculateViewMatrix } from "./camera.js";
import { loadModels, renderModel } from "./model.js";
import { loadShader } from "./shader.js";
import { loadTexture } from "./texture.js";

import { vec3, mat4 } from "./external/wgpu-matrix.module.js";

const depthFormat = "depth32float";

const staticUniformBufferSize = 16 * 4 + 4 * 4 + 4 * 4; // In bytes: view-projection matrix (mat4), camera position (vec3 + 1 float padding), light direction (vec3 + 1 float padding)
const dynamicUniformBufferSize = 16 * 4; // In bytes: world matrices (mat4)

let alignedStaticUniformBufferSize;

let uniformBuffer;
let depthTexture;
let renderBundle;
let renderPassDescriptor;

let rifleModel = { meshes: null, worldMatrix: mat4.scaling([15, 15, 15]) };

let projectionMatrix, viewProjectionMatrix;

let lightPosition = vec3.create(-1, 1, 1);

let shiftKeyDown = false;

function align(value, stride) {
  return (value + stride - 1) & ~(stride - 1);
}

async function load(device, colorFormat, uniformBufferStride) {
  // Load models
  let vertices, indices, modelMaterialDefinitions, modelTextureFilenames;
  [vertices, indices, [rifleModel.meshes], modelMaterialDefinitions, modelTextureFilenames] = await loadModels("models/Rifle.aem");

  // Load all image textures required by the models
  const modelTextures = new Array();
  for (const modelTextureFilename of modelTextureFilenames) {
    modelTextures.push(await loadTexture("textures/" + modelTextureFilename, device));
  }

  // Load extra image textures as fallbacks
  const fallbackDiffuseTexture = await loadTexture("textures/fallback_diffuse.png", device);
  const fallbackNormalTexture = await loadTexture("textures/fallback_normal.png", device);

  // Material bind group layout
  const materialBindGroupLayout = device.createBindGroupLayout({
    label: "Material bind group layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT, // Diffuse texture
        texture: {}
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT, // Normal texture
        texture: {}
      }
    ]
  });

  // Create a bind group for each material required by the models
  const materialBindGroups = new Array();
  for (const modelMaterialDefinition of modelMaterialDefinitions) {
    const diffuseTextureIndex = modelMaterialDefinition.diffuse;
    const diffuseTexture = diffuseTextureIndex < 255 ? modelTextures[diffuseTextureIndex] : fallbackDiffuseTexture;
    const normalTextureIndex = modelMaterialDefinition.normal;
    const normalTexture = normalTextureIndex < 255 ? modelTextures[normalTextureIndex] : fallbackNormalTexture;

    const materialBindGroup = device.createBindGroup({
      label: "Material bind group",
      layout: materialBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: diffuseTexture // Diffuse texture
        },
        {
          binding: 1,
          resource: normalTexture // Normal texture
        }
      ]
    });
    materialBindGroups.push(materialBindGroup);
  }

  // Create an extra material bind group as fallback
  const fallbackMaterialBindGroup = device.createBindGroup({
    label: "Fallback material bind group",
    layout: materialBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: fallbackDiffuseTexture // Diffuse texture
      },
      {
        binding: 1,
        resource: fallbackNormalTexture // Normal texture
      }
    ]
  });
  materialBindGroups.push(fallbackMaterialBindGroup);

  // Vertex layout
  const vertexLayout = {
    arrayStride: 11 * 4, // Size of a vertex in bytes
    attributes: [
      // Position
      {
        format: "float32x3",
        offset: 0 * 4, // Starting offset in the buffer in bytes
        shaderLocation: 0
      },
      // Normal
      {
        format: "float32x3",
        offset: 3 * 4, // Starting offset in the buffer in bytes
        shaderLocation: 1
      },
      // Tangent
      {
        format: "float32x3",
        offset: 6 * 4, // Starting offset in the buffer in bytes
        shaderLocation: 2
      },
      // UV
      {
        format: "float32x2",
        offset: 9 * 4, // Starting offset in the buffer in bytes
        shaderLocation: 3
      }
    ]
  };

  // Vertex buffer
  const vertexBuffer = device.createBuffer({
    label: "Vertex buffer",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // Index buffer
  const indexBuffer = device.createBuffer({
    label: "Index buffer",
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // Uniform buffer
  alignedStaticUniformBufferSize = align(staticUniformBufferSize, uniformBufferStride);
  uniformBuffer = device.createBuffer({
    label: "Uniform buffer",
    size: alignedStaticUniformBufferSize + dynamicUniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  // Sampler
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear"
  });

  // Scene bind group layout
  const sceneBindGroupLayout = device.createBindGroupLayout({
    label: "Scene bind group layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, // View-projection matrix, camera position, light direction
        buffer: {}
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT, // Sampler
        sampler: {}
      }
    ]
  });

  // Scene bind group
  const sceneBindGroup = device.createBindGroup({
    label: "Scene bind group",
    layout: sceneBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource:
        {
          buffer: uniformBuffer, // View-projection matrix, camera position, light direction
          offset: 0,
          size: staticUniformBufferSize
        }
      },
      {
        binding: 1,
        resource: sampler // Sampler
      }
    ]
  });

  // Model bind group layout
  const modelBindGroupLayout = device.createBindGroupLayout({
    label: "Model bind group layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX, // World matrix
        buffer: { hasDynamicOffset: true }
      }
    ]
  });

  // Model bind group
  const modelBindGroup = device.createBindGroup({
    label: "Model bind group",
    layout: modelBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource:
        {
          buffer: uniformBuffer, // World matrix
          offset: alignedStaticUniformBufferSize,
          size: 16 * 4
        }
      }
    ]
  });

  // Shaders
  const vertexShaderProgram = await loadShader("shaders/basic.vert.wgsl", device);
  const fragmentShaderProgram = await loadShader("shaders/basic.frag.wgsl", device);

  // Pipeline layout
  const pipelineLayout = device.createPipelineLayout({
    label: "Pipeline layout",
    bindGroupLayouts: [sceneBindGroupLayout, materialBindGroupLayout, modelBindGroupLayout]
  });

  // Pipeline
  const pipeline = device.createRenderPipeline({
    label: "Pipeline",
    layout: pipelineLayout,
    vertex: {
      module: vertexShaderProgram,
      entryPoint: "main",
      buffers: [vertexLayout]
    },
    fragment: {
      module: fragmentShaderProgram,
      entryPoint: "main",
      targets: [{
        format: colorFormat,
        blend: {
          color: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha"
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha"
          },
        }
      }]
    },
    primitive: {
      topology: "triangle-list",
      frontFace: "cw",
      cullMode: "none"
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "greater",
      format: depthFormat
    }
  });

  // Render bundle
  const renderBundleEncoder = device.createRenderBundleEncoder({
    colorFormats: [colorFormat],
    depthStencilFormat: depthFormat
  });

  // Record the render bundle
  {
    renderBundleEncoder.setPipeline(pipeline);
    renderBundleEncoder.setVertexBuffer(0, vertexBuffer);
    renderBundleEncoder.setIndexBuffer(indexBuffer, "uint32");

    renderBundleEncoder.setBindGroup(0, sceneBindGroup);
    renderModel(rifleModel, 0, materialBindGroups, modelBindGroup, renderBundleEncoder);

    renderBundle = renderBundleEncoder.finish();
  }

  // Render pass descriptor for rendering
  renderPassDescriptor = {
    colorAttachments: [{
      view: {}, // Filled in every frame
      loadOp: "clear",
      storeOp: "store",
      clearValue: [0.13, 0.13, 0.13, 1]
    }],
    depthStencilAttachment: {
      view: {}, // Filled in on resize
      depthLoadOp: "clear",
      depthStoreOp: "store",
      depthClearValue: 0.0
    }
  };

  // Camera
  loadCamera([5, 5, -5], [0, 0, 0]);

  //var m = mat4.lookAt([9, 7, 5], [2, 2, 2], [0, 1, 0]);
  //m = mat4.invert(m);
  //console.log(m);
}

function update(deltaTime) {
  //rifleModel.worldMatrix = mat4.rotateY(rifleModel.worldMatrix, deltaTime * 0.001);

  viewProjectionMatrix = mat4.multiply(projectionMatrix, calculateViewMatrix());
}

function render(device, view) {
  const cameraPos = getCameraPosition();
  const lightDir = vec3.normalize(vec3.sub(vec3.create(0), lightPosition));

  // Write the static part of the uniform buffer
  device.queue.writeBuffer(uniformBuffer, 0, viewProjectionMatrix); // View-projection matrix
  device.queue.writeBuffer(uniformBuffer, 16 * 4 + 0 * 4, cameraPos); // Camera position
  device.queue.writeBuffer(uniformBuffer, 16 * 4 + 4 * 4, lightDir); // Light direction

  // Write the dynamic part of the uniform buffer
  device.queue.writeBuffer(uniformBuffer, alignedStaticUniformBufferSize, rifleModel.worldMatrix); // World matrices

  const commandEncoder = device.createCommandEncoder();

  // Render pass that executes the render bundle
  renderPassDescriptor.colorAttachments[0].view = view;
  const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
  renderPass.executeBundles([renderBundle]);
  renderPass.end();

  // Submit
  device.queue.submit([commandEncoder.finish()]);
}

function onResize(device, width, height) {
  if (depthTexture) {
    depthTexture.destroy();
  }

  // Recreate the depth texture with the new width and height
  depthTexture = device.createTexture({
    label: "Depth texture",
    size: [width, height],
    format: depthFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });

  // Update the render pass descriptor
  renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();

  // Recreate the projection matrix with the new aspect ratio
  const aspect = width / height;
  projectionMatrix = mat4.perspective(Math.PI / 3, aspect, 0.01, 1000.0);

  // Reverse the depth in the projection matrix
  const depthReverseMatrix = mat4.identity();
  depthReverseMatrix[10] = -1;
  depthReverseMatrix[14] = 1;
  projectionMatrix = mat4.multiply(depthReverseMatrix, projectionMatrix);
}

function onMouseMove(event) {
  const leftMouseButtonDown = (event.buttons & (1 << 0)) !== 0;
  const rightMouseButtonDown = (event.buttons & (1 << 1)) !== 0;

  if (leftMouseButtonDown && !rightMouseButtonDown) {
    if (shiftKeyDown) {
      const lightPivot = vec3.create(0, 0, 0);
      const positionToPivot = vec3.sub(lightPivot, lightPosition);
      const moveToPivot = mat4.translation(positionToPivot);

      const yaw = mat4.rotationY(-event.movementX * (Math.PI / 180) * 0.1);

      const moveBack = mat4.translation([-positionToPivot[0], -positionToPivot[1], -positionToPivot[2]]);

      const transform = mat4.multiply(moveBack, mat4.multiply(moveToPivot, yaw));

      lightPosition = vec3.transformMat4(lightPosition, transform);
    }
    else {
      tumbleCamera(event.movementX, event.movementY);
    }
  }

  if (rightMouseButtonDown && !leftMouseButtonDown) {
    panCamera(event.movementX, event.movementY);
  }
}

function onMouseWheel(event) {
  dollyCamera(event.deltaY);
}

function onKeyDown(event) {
  if (event.code == "ShiftLeft") {
    shiftKeyDown = true;
  }
}

function onKeyUp(event) {
  if (event.code == "ShiftLeft") {
    shiftKeyDown = false;
  }
}

export { onKeyUp, load, update, render, onResize, onMouseMove, onMouseWheel, onKeyDown };